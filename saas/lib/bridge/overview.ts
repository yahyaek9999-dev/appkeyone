// lib/bridge/overview.ts — the single view-model the Bridge dashboard renders.
//
// Pure, read-only, DB-backed: derives every customer-visible state (online /
// offline / connecting / updating / error, per-device telemetry, WhatsApp link
// state, latest QR, diagnostics) from the additive Bridge tables. Used by both
// the SSR page and the polling GET /api/bridge/v1/overview route so the initial
// paint and live updates share one shape. Never reads token hashes.

import { prisma } from "@/lib/db";

/** The 5 top-level customer states. */
export type BridgeStatus = "online" | "offline" | "connecting" | "updating" | "error";

export type TransportView = {
  provider: string;
  state: string; // linking | connecting | connected | disconnected | logged_out
  identity: string | null;
  hasQr: boolean;
  qr: string | null; // raw QR string (rendered to an image client-side)
  qrAgeMs: number | null;
  lastError: string | null;
};

export type DiagnosticsView = {
  cloudApi: "ok"; // this response proves the Cloud API is reachable
  bridge: "online" | "offline";
  whatsapp: "connected" | "linking" | "disconnected";
};

export type BridgeView = {
  id: string;
  name: string;
  status: BridgeStatus;
  os: string | null;
  arch: string | null;
  version: string | null;
  isPrimary: boolean;
  updating: boolean;
  lastError: string | null;
  lastHeartbeatAt: string | null;
  lastSeenLabel: string | null;
  whatsapp: TransportView | null;
  transports: TransportView[];
  diagnostics: DiagnosticsView;
};

export type BridgeOverview = {
  bridges: BridgeView[];
  latestVersion: string | null;
  releaseUrl: string | null;
};

const QR_TTL_MS = 60_000;

function transportView(t: any): TransportView {
  const qrAgeMs = t.lastQrAt ? Date.now() - new Date(t.lastQrAt).getTime() : null;
  const fresh = qrAgeMs !== null && qrAgeMs < QR_TTL_MS;
  return {
    provider: t.provider,
    state: t.state,
    identity: t.identity ?? null,
    hasQr: !!(t.lastQr && fresh),
    qr: t.lastQr && fresh ? t.lastQr : null,
    qrAgeMs,
    lastError: t.lastError ?? null,
  };
}

/** Derive the single top-level status a customer sees for a bridge. */
export function deriveStatus(b: any, wa: TransportView | null): BridgeStatus {
  if (b.updating) return "updating";
  if (b.lastError || (wa && wa.state === "logged_out")) return "error";
  if (b.status !== "online") return "offline";
  if (wa && wa.state === "connected") return "online";
  // Bridge is online but WhatsApp isn't connected yet (linking / no session).
  return "connecting";
}

function seenLabel(d: Date | string | null): string | null {
  if (!d) return null;
  const ms = Date.now() - new Date(d).getTime();
  if (ms < 60_000) return "الآن";
  if (ms < 3_600_000) return `منذ ${Math.floor(ms / 60_000)} دقيقة`;
  if (ms < 86_400_000) return `منذ ${Math.floor(ms / 3_600_000)} ساعة`;
  return `منذ ${Math.floor(ms / 86_400_000)} يوم`;
}

/** Build the full overview for a workspace. Read-only. */
export async function getBridgeOverview(userId: string): Promise<BridgeOverview> {
  const rows = await (prisma as any).bridge.findMany({
    where: { userId, revokedAt: null },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      os: true,
      arch: true,
      version: true,
      status: true,
      isPrimary: true,
      updating: true,
      lastError: true,
      lastHeartbeatAt: true,
      transports: {
        select: {
          provider: true, state: true, identity: true,
          lastQr: true, lastQrAt: true, lastError: true,
        },
        orderBy: { provider: "asc" },
      },
    },
  });

  const bridges: BridgeView[] = rows.map((b: any) => {
    const transports = (b.transports || []).map(transportView);
    const whatsapp = transports.find((t: TransportView) => t.provider === "whatsapp") ?? null;
    const status = deriveStatus(b, whatsapp);
    return {
      id: b.id,
      name: b.name || "جهاز Bridge",
      status,
      os: b.os ?? null,
      arch: b.arch ?? null,
      version: b.version ?? null,
      isPrimary: !!b.isPrimary,
      updating: !!b.updating,
      lastError: b.lastError ?? null,
      lastHeartbeatAt: b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).toISOString() : null,
      lastSeenLabel: seenLabel(b.lastHeartbeatAt),
      whatsapp,
      transports,
      diagnostics: {
        cloudApi: "ok",
        bridge: b.status === "online" ? "online" : "offline",
        whatsapp:
          whatsapp?.state === "connected" ? "connected"
          : whatsapp && (whatsapp.state === "linking" || whatsapp.state === "connecting") ? "linking"
          : "disconnected",
      },
    };
  });

  const latest = await latestRelease();
  return { bridges, latestVersion: latest?.tag ?? null, releaseUrl: latest?.url ?? null };
}

// --- latest release (GitHub), cached best-effort so the dashboard never blocks ---
let relCache: { at: number; tag: string | null; url: string | null } | null = null;

async function latestRelease(): Promise<{ tag: string; url: string } | null> {
  if (relCache && Date.now() - relCache.at < 10 * 60_000) {
    return relCache.tag ? { tag: relCache.tag, url: relCache.url! } : null;
  }
  const repo = process.env.BRIDGE_RELEASE_REPO || "yahyaek9999-dev/keyone-bridge";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      relCache = { at: Date.now(), tag: j.tag_name || null, url: j.html_url || null };
      return relCache.tag ? { tag: relCache.tag, url: relCache.url! } : null;
    }
  } catch {
    /* network/none — dashboard shows "current only" */
  }
  relCache = { at: Date.now(), tag: null, url: null };
  return null;
}
