// POST /api/settings/ai-provider/test
//
// Tests the merchant's provider credentials BEFORE they are persisted.
// Sends a tiny 2-token "ping" prompt and reports the result.
//
// Security:
//   - requireUser() gates by session
//   - aggressive rate limit (5/min/user) — vendor keys are expensive to test
//   - body apiKey is used in-memory only; never logged
//   - if `apiKey` is omitted, falls back to the stored bot key (if any)

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto-util";
import { isProviderId } from "@/lib/providers/types";
import { testProviderKey } from "@/lib/providers/provider-router";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({
  provider: z.enum(["openai", "gemini", "openrouter", "claude", "groq"]),
  apiKey: z.string().max(500).optional(),
  model: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  // Tight rate limit — test calls hit external paid APIs.
  const limited = enforceRateLimit(req, {
    name: "settings-ai-test",
    identifier: user.id,
    limit: 5,
    windowSec: 60,
  });
  if (limited) return limited;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { provider, model } = parsed.data;
  let apiKey = (parsed.data.apiKey || "").trim();

  // Zod already restricts to the 5 testable providers; isProviderId is a
  // belt-and-suspenders runtime check against future zod schema drift.
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "مزوّد غير صالح" }, { status: 400 });
  }

  // If no key supplied in the request, try the stored encrypted one.
  if (!apiKey) {
    const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
    const enc = bot ? (bot as any).aiApiKeyEnc : null;
    if (!enc) {
      return NextResponse.json(
        { error: "أدخل مفتاح API أو احفظ مفتاحاً سابقاً قبل الاختبار" },
        { status: 400 }
      );
    }
    try {
      apiKey = decryptSecret(enc);
    } catch {
      return NextResponse.json(
        { error: "تعذّر قراءة المفتاح المحفوظ — أعد إدخاله" },
        { status: 400 }
      );
    }
  }

  const r = await testProviderKey(provider, apiKey, model || null);
  if (r.ok) {
    return NextResponse.json({ ok: true, preview: r.preview, usage: r.usage });
  }
  // Surface a useful status code so the UI can show 401 vs 5xx distinctly.
  const status = r.status >= 400 && r.status < 600 ? r.status : 502;
  return NextResponse.json({ ok: false, error: r.error }, { status });
}
