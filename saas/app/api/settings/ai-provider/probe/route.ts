/**
 * POST /api/settings/ai-provider/probe — live health probe of the tenant's
 * CURRENTLY active AI provider (including the in-house "keyone" cluster), via a
 * tiny chat() call. Reports ok/latency/error. Owner-gated (settings),
 * rate-limited. Distinct from /test, which validates a key BEFORE saving.
 */
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let user;
  try { user = await requirePermission("settings"); } catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
  const limited = enforceRateLimit(req, { name: "ai-probe", identifier: user.id, limit: 6, windowSec: 60 });
  if (limited) return limited;

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
  if (!bot) return NextResponse.json({ ok: false, error: "no_bot" }, { status: 400 });

  const override = botProviderOverride(bot as any); // null → in-house keyone cluster
  const provider = (bot as any).aiProvider || "keyone";
  const t0 = Date.now();
  try {
    const text = await chat([{ role: "user", content: "اكتب كلمة: تم" }], { provider: override, meterUserId: user.id, maxTokens: 8, timeoutMs: 15000, retries: 0 });
    return NextResponse.json({ ok: true, provider, latencyMs: Date.now() - t0, sample: String(text || "").slice(0, 80) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, provider, latencyMs: Date.now() - t0, error: String(e?.message || e).slice(0, 200) });
  }
}
