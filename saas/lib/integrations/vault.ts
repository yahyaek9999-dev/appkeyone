// Universal Providers — credential vault (server-only).
//
// One place to load/save/mask/decrypt TenantProviderCredential rows. Mirrors the
// proven app/api/settings/ai-provider + commerce/email-provider pattern:
//   - secrets AES-256-GCM encrypted at rest (lib/crypto-util)
//   - GET never returns raw secrets — only a mask + hasValue
//   - empty secret on save = keep existing value
//   - custom endpoints are SSRF-validated before persistence
//
// IMPORTANT: do not import this from client components — it touches prisma + crypto.

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto-util";
import { assertPublicHttpUrl } from "@/lib/ssrf";
import { getDescriptor } from "./registry";
import type {
  ProviderDescriptor,
  ProviderDomain,
  ProviderFieldSpec,
  ResolvedProvider,
  ProviderStatus,
} from "./types";

type CredRow = {
  id: string;
  userId: string;
  domain: string;
  provider: string;
  enabled: boolean;
  priority: number;
  label: string;
  secretEnc: string | null;
  secret2Enc: string | null;
  publicId: string;
  endpoint: string;
  model: string;
  configJson: string;
  status: string;
  lastCheckAt: Date | null;
  lastError: string;
  updatedAt: Date;
};

function parseConfig(json: string): Record<string, any> {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

function decryptSafe(blob: string | null): string {
  if (!blob) return "";
  try {
    return decryptSecret(blob);
  } catch {
    return "";
  }
}

// ── Masked UI shape ──────────────────────────────────────────────────────────

export type MaskedFieldState = {
  key: string;
  secret: boolean;
  hasValue: boolean;
  /** For non-secret fields: the actual value (prefilled). For secrets: "". */
  value: string;
  /** For secret fields with a stored value: a UI-safe mask. */
  mask: string;
};

export type MaskedCredential = {
  id: string;
  domain: ProviderDomain;
  provider: string;
  label: string;
  enabled: boolean;
  priority: number;
  status: ProviderStatus;
  lastCheckAt: string | null;
  lastError: string;
  updatedAt: string;
  /** Per-field state keyed by field.key, driven by the descriptor. */
  fields: Record<string, MaskedFieldState>;
};

function readField(spec: ProviderFieldSpec, row: CredRow, config: Record<string, any>): MaskedFieldState {
  let raw = "";
  if (spec.store === "secret") raw = decryptSafe(row.secretEnc);
  else if (spec.store === "secret2") raw = decryptSafe(row.secret2Enc);
  else if (spec.store === "publicId") raw = row.publicId || "";
  else if (spec.store === "endpoint") raw = row.endpoint || "";
  else if (spec.store === "model") raw = row.model || "";
  else if (typeof spec.store === "object") raw = config[spec.store.config] != null ? String(config[spec.store.config]) : "";
  const hasValue = raw.length > 0;
  return {
    key: spec.key,
    secret: !!spec.secret,
    hasValue,
    value: spec.secret ? "" : raw,
    mask: spec.secret && hasValue ? maskSecret(raw) : "",
  };
}

export function maskCredential(row: CredRow): MaskedCredential {
  const descriptor = getDescriptor(row.domain as ProviderDomain, row.provider);
  const config = parseConfig(row.configJson);
  const fields: Record<string, MaskedFieldState> = {};
  if (descriptor) {
    for (const spec of descriptor.fields) {
      fields[spec.key] = readField(spec, row, config);
    }
  }
  return {
    id: row.id,
    domain: row.domain as ProviderDomain,
    provider: row.provider,
    label: row.label,
    enabled: row.enabled,
    priority: row.priority,
    status: (row.status as ProviderStatus) || "unknown",
    lastCheckAt: row.lastCheckAt ? row.lastCheckAt.toISOString() : null,
    lastError: row.lastError || "",
    updatedAt: row.updatedAt.toISOString(),
    fields,
  };
}

// ── Read ─────────────────────────────────────────────────────────────────────

export async function listCredentials(userId: string, domain: ProviderDomain): Promise<MaskedCredential[]> {
  const rows = (await (prisma as any).tenantProviderCredential.findMany({
    where: { userId, domain },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  })) as CredRow[];
  return rows.map(maskCredential);
}

/** Server-only: decrypt one credential into an executable ResolvedProvider. */
export function toResolved(row: CredRow): ResolvedProvider | null {
  const descriptor = getDescriptor(row.domain as ProviderDomain, row.provider);
  if (!descriptor) return null;
  return {
    credId: row.id,
    domain: row.domain as ProviderDomain,
    provider: row.provider,
    descriptor,
    priority: row.priority,
    source: "vault",
    status: (row.status as ProviderStatus) || "unknown",
    lastCheckAt: row.lastCheckAt,
    secret: decryptSafe(row.secretEnc),
    secret2: decryptSafe(row.secret2Enc),
    publicId: row.publicId || "",
    endpoint: row.endpoint || "",
    model: row.model || "",
    config: parseConfig(row.configJson),
  };
}

/** Resolve one specific stored credential (regardless of enabled) — for health tests. */
export async function loadOneResolved(
  userId: string,
  domain: ProviderDomain,
  provider: string,
): Promise<ResolvedProvider | null> {
  const row = (await (prisma as any).tenantProviderCredential.findUnique({
    where: { userId_domain_provider: { userId, domain, provider } },
  })) as CredRow | null;
  return row ? toResolved(row) : null;
}

/**
 * Build a ResolvedProvider from ad-hoc form `values` (for the Test button),
 * overlaying typed values on top of any stored credential. Blank secret fields
 * fall back to the stored secret. No DB write.
 */
export async function toResolvedAdHoc(
  userId: string,
  domain: ProviderDomain,
  provider: string,
  values: Record<string, string | number | undefined | null>,
): Promise<ResolvedProvider | null> {
  const descriptor = getDescriptor(domain, provider);
  if (!descriptor) return null;
  const base = await loadOneResolved(userId, domain, provider);
  const out: ResolvedProvider = base || {
    credId: null,
    domain,
    provider,
    descriptor,
    priority: 100,
    source: "vault",
    status: "unknown",
    lastCheckAt: null,
    secret: "",
    secret2: "",
    publicId: "",
    endpoint: "",
    model: "",
    config: {},
  };
  out.config = { ...out.config };
  for (const spec of descriptor.fields) {
    const raw = values[spec.key];
    const val = raw == null ? "" : String(raw).trim();
    if (spec.secret) {
      if (val) {
        if (spec.store === "secret2") out.secret2 = val;
        else out.secret = val;
      }
      continue; // blank → keep stored secret
    }
    if (!val) continue; // blank non-secret → keep stored
    if (spec.store === "endpoint") out.endpoint = val;
    else if (spec.store === "publicId") out.publicId = val;
    else if (spec.store === "model") out.model = val;
    else if (typeof spec.store === "object") out.config[spec.store.config] = val;
  }
  return out;
}

/** Enabled, priority-sorted resolved providers from the vault for a domain. */
export async function loadEnabledResolved(userId: string, domain: ProviderDomain): Promise<ResolvedProvider[]> {
  const rows = (await (prisma as any).tenantProviderCredential.findMany({
    where: { userId, domain, enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
  })) as CredRow[];
  return rows.map(toResolved).filter((r): r is ResolvedProvider => r !== null);
}

// ── Write ────────────────────────────────────────────────────────────────────

export type SaveInput = {
  enabled?: boolean;
  priority?: number;
  label?: string;
  values: Record<string, string | number | undefined | null>;
};

export type SaveResult =
  | { ok: true; credential: MaskedCredential }
  | { ok: false; error: string; field?: string };

/**
 * Upsert a credential from generic form `values` keyed by descriptor field keys.
 * Secrets are encrypted; empty secret values keep the existing stored secret.
 * Custom endpoints are SSRF-validated. Returns a masked credential on success.
 */
export async function saveCredential(
  userId: string,
  domain: ProviderDomain,
  provider: string,
  input: SaveInput,
): Promise<SaveResult> {
  const descriptor = getDescriptor(domain, provider);
  if (!descriptor) return { ok: false, error: "unknown_provider" };

  const existing = (await (prisma as any).tenantProviderCredential.findUnique({
    where: { userId_domain_provider: { userId, domain, provider } },
  })) as CredRow | null;

  const config = existing ? parseConfig(existing.configJson) : {};
  const data: Record<string, any> = {};

  for (const spec of descriptor.fields) {
    const rawVal = input.values[spec.key];
    const val = rawVal == null ? "" : String(rawVal).trim();

    if (spec.secret) {
      // Empty → keep existing secret. Non-empty → encrypt + overwrite.
      if (val) {
        const col = spec.store === "secret2" ? "secret2Enc" : "secretEnc";
        try {
          data[col] = encryptSecret(val);
        } catch (e: any) {
          return { ok: false, error: "encrypt_failed", field: spec.key };
        }
      }
      continue;
    }

    if (spec.store === "endpoint") {
      if (val && descriptor.needsEndpoint) {
        // SMTP host (no scheme) is validated by the email adapter at send time;
        // URL endpoints are SSRF-validated here.
        if (/^https?:\/\//i.test(val)) {
          try {
            await assertPublicHttpUrl(val);
          } catch {
            return { ok: false, error: "endpoint_blocked", field: spec.key };
          }
        }
      }
      data.endpoint = val;
    } else if (spec.store === "publicId") {
      data.publicId = val;
    } else if (spec.store === "model") {
      data.model = val;
    } else if (typeof spec.store === "object") {
      if (val === "") delete config[spec.store.config];
      else config[spec.store.config] = val;
    }
  }

  // Validate required fields (secrets count as satisfied if already stored).
  for (const spec of descriptor.fields) {
    if (!spec.required) continue;
    if (spec.secret) {
      const willHave =
        (spec.store === "secret2" ? data.secret2Enc : data.secretEnc) ||
        (existing && (spec.store === "secret2" ? existing.secret2Enc : existing.secretEnc));
      if (!willHave) return { ok: false, error: "missing_required", field: spec.key };
    } else {
      let v = "";
      if (spec.store === "endpoint") v = data.endpoint ?? "";
      else if (spec.store === "publicId") v = data.publicId ?? "";
      else if (spec.store === "model") v = data.model ?? "";
      else if (typeof spec.store === "object") v = config[spec.store.config] != null ? String(config[spec.store.config]) : "";
      if (!v) return { ok: false, error: "missing_required", field: spec.key };
    }
  }

  data.configJson = JSON.stringify(config).slice(0, 10000);
  if (typeof input.enabled === "boolean") data.enabled = input.enabled;
  if (typeof input.priority === "number") data.priority = Math.max(0, Math.min(9999, Math.round(input.priority)));
  if (typeof input.label === "string") data.label = input.label.slice(0, 120);

  const row = (await (prisma as any).tenantProviderCredential.upsert({
    where: { userId_domain_provider: { userId, domain, provider } },
    create: {
      userId,
      domain,
      provider,
      enabled: typeof input.enabled === "boolean" ? input.enabled : true,
      priority: typeof input.priority === "number" ? input.priority : 100,
      label: input.label?.slice(0, 120) || descriptor.label,
      ...data,
    },
    update: data,
  })) as CredRow;

  return { ok: true, credential: maskCredential(row) };
}

export async function deleteCredential(userId: string, domain: ProviderDomain, provider: string): Promise<boolean> {
  try {
    await (prisma as any).tenantProviderCredential.delete({
      where: { userId_domain_provider: { userId, domain, provider } },
    });
    return true;
  } catch {
    return false;
  }
}

/** Set priorities from an ordered list of provider ids (index → priority*10). */
export async function reorderCredentials(userId: string, domain: ProviderDomain, order: string[]): Promise<void> {
  await Promise.all(
    order.map((provider, idx) =>
      (prisma as any).tenantProviderCredential
        .updateMany({ where: { userId, domain, provider }, data: { priority: (idx + 1) * 10 } })
        .catch(() => {}),
    ),
  );
}

/** Persist a health-check outcome on the credential row. */
export async function setHealth(
  credId: string,
  status: ProviderStatus,
  error = "",
): Promise<void> {
  await (prisma as any).tenantProviderCredential
    .update({ where: { id: credId }, data: { status, lastError: error.slice(0, 500), lastCheckAt: new Date() } })
    .catch(() => {});
}
