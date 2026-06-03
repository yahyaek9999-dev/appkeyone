// ---------------------------------------------------------------------------
// GET /api/admin/runtime — Admin-only runtime diagnostics endpoint
//
// Returns combined health of all KEYONE subsystems:
//   - SAAS app health (DB, uptime, memory, build version)
//   - WhatsApp service health (sessions, reconnects, memory)
//   - System resource utilization
//
// Auth: requires admin role. Not public.
// ---------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { authErrorStatus } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { wa } from "@/lib/wa";

export const dynamic = "force-dynamic";

export async function GET() {
  // requireAdmin enforces an OWNER session with User.role === "admin"; a team
  // member session (even of an admin owner) is correctly rejected.
  try {
    await requireAdmin();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: authErrorStatus(e) });
  }

  const start = Date.now();

  // ── SAAS health ───────────────────────────────────────────────
  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {}

  // Quick counts for system overview
  const [userCount, botCount, activeSubCount] = await Promise.all([
    prisma.user.count().catch(() => -1),
    prisma.bot.count().catch(() => -1),
    prisma.subscription
      .count({ where: { status: "active" } })
      .catch(() => -1),
  ]);

  // ── WhatsApp service health ───────────────────────────────────
  let waHealth: any = null;
  try {
    const r = await fetch(
      (process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001") +
        "/sessions/stats",
      {
        headers: {
          "X-Internal-Secret":
            process.env.SAAS_INTERNAL_SECRET ||
            "dev-internal-secret-change-me",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (r.ok) waHealth = await r.json().catch(() => null);
  } catch {}

  const mem = process.memoryUsage();

  return NextResponse.json({
    ok: true,
    saas: {
      db: dbOk ? "ok" : "error",
      uptime: Math.floor(process.uptime()),
      buildId:
        process.env.NEXT_PUBLIC_BUILD_ID ?? process.env.BUILD_ID ?? "dev",
      memory: {
        rss: Math.round(mem.rss / 1048576),
        heapUsed: Math.round(mem.heapUsed / 1048576),
        heapTotal: Math.round(mem.heapTotal / 1048576),
      },
      counts: {
        users: userCount,
        bots: botCount,
        activeSubs: activeSubCount,
      },
    },
    whatsapp: waHealth,
    latencyMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  });
}
