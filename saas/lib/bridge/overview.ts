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
  qrExpiresAt: string | null; // the code's REAL expiry (ISO), streamed from the Bridge
  qrRemainingMs: number; // ms until this exact code dies (0 once dead)
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

// If an older Bridge streams a QR without a real expiry, assume ~one WhatsApp Web
// rotation (~20s) — NEVER the old fixed 60s, which showed dead codes and caused
// "Check your connection and try again" on scan.
const QR_FALLBACK_TTL_MS = 22_000;

function transportView(t: any): TransportView {
  const now = Date.now();
  const qrAt = t.lastQrAt ? new Date(t.lastQrAt).getTime() : null;
  const qrExp = t.lastQrExpiresAt ? new Date(t.lastQrExpiresAt).getTime() : null;
  const qrAgeMs = qrAt !== null ? now - qrAt : null;
  // A code is "live" only until its REAL expiry (from the Bridge). Show a QR only
  // while it is genuinely scannable — a rotated/dead code fails WhatsApp pairing.
  const liveUntil = qrExp ?? (qrAt !== null ? qrAt + QR_FALLBACK_TTL_MS : null);
  const fresh = liveUntil !== null && now < liveUntil;
  return {
    provider: t.provider,
    state: t.state,
    identity: t.identity ?? null,
    hasQr: !!(t.lastQr && fresh),
    qr: t.lastQr && fresh ? t.lastQr : null,
    qrAgeMs,
    qrExpiresAt: qrExp ? new Date(qrExp).toISOString() : null,
    qrRemainingMs: fresh && liveUntil !== null ? liveUntil - now : 0,
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
          lastQr: true, lastQrAt: true, lastQrExpiresAt: true, lastError: true,
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

  const latest = await latestVersionFromKeyone();
  // "releaseUrl" points at the KEYONE download page (not a repository).
  return { bridges, latestVersion: latest, releaseUrl: latest ? "/dashboard/settings/bridge/download" : null };
}

// --- latest version from the KEYONE download server (version.json), cached ---
// best-effort so the dashboard never blocks. NO GitHub dependency.
let verCache: { at: number; tag: string | null } | null = null;

async function latestVersionFromKeyone(): Promise<string | null> {
  if (verCache && Date.now() - verCache.at < 10 * 60_000) {
    return verCache.tag;
  }
  const origin = process.env.NEXT_PUBLIC_BASE_URL || "https://wkeyone.app";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${origin}/downloads/keyone-bridge/version.json`, {
      signal: ctrl.signal,
      cache: "no-store",
    });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      verCache = { at: Date.now(), tag: j?.version || null };
      return verCache.tag;
    }
  } catch {
    /* store not populated / unreachable — dashboard shows "current only" */
  }
  verCache = { at: Date.now(), tag: null };
  return null;
}
