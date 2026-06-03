// GET  /api/settings/ai-provider  → current config (key masked, never raw)
// PUT  /api/settings/ai-provider  → update provider/model/key
//
// Security:
//   - requireUser() gates by session
//   - rate-limited to prevent brute-force/spam saves
//   - API key is AES-256-GCM encrypted at rest via lib/crypto-util
//   - GET never returns the raw key — only a UI mask
//   - Empty/whitespace apiKey on PUT means "keep existing key"

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission, getAuthContext } from "@/lib/auth";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto-util";
import { isProviderId, DEFAULT_MODELS, PROVIDER_LABELS } from "@/lib/providers/types";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { auditCtx } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

const ProviderEnum = z.enum(["keyone", "openai", "gemini", "openrouter", "claude", "groq"]);

const PutBody = z.object({
  provider: ProviderEnum,
  // apiKey: when present and non-empty, replaces the stored key.
  // When omitted or empty string, the existing stored key is preserved.
  apiKey: z.string().max(500).optional(),
  // model: optional per-bot override. Empty string clears the override.
  model: z.string().max(120).optional(),
});

export async function GET() {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
  if (!bot) {
    return NextResponse.json({ error: "البوت غير مهيأ" }, { status: 400 });
  }

  const provider = (bot as any).aiProvider || "keyone";
  const enc      = (bot as any).aiApiKeyEnc as string | null | undefined;
  const model    = (bot as any).aiModel as string | null | undefined;

  // Build a UI-safe mask. Never return the raw key.
  let keyMask = "";
  let hasKey = false;
  if (enc) {
    try {
      const raw = decryptSecret(enc);
      hasKey = raw.length > 0;
      keyMask = maskSecret(raw);
    } catch {
      // Stored ciphertext can't be decrypted (e.g. AUTH_SECRET rotated).
      // Signal to the UI that there is "something" but it's unusable.
      hasKey = true;
      keyMask = "•••• (مفتاح غير قابل للقراءة - أعد إدخاله)";
    }
  }

  return NextResponse.json({
    provider,
    model: model || "",
    defaultModel: provider === "keyone" ? "" : (DEFAULT_MODELS as any)[provider] || "",
    hasKey,
    keyMask,
    connectionMode: (bot as any).connectionMode || "unofficial",
    providers: Object.entries(PROVIDER_LABELS).map(([id, label]) => ({ id, label })),
  });
}

export async function PUT(req: NextRequest) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, {
    name: "settings-ai-save",
    identifier: user.id,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  const parsed = PutBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 });
  }
  const { provider, apiKey, model } = parsed.data;

  // Belt-and-suspenders: provider must be a known id.
  if (!isProviderId(provider)) {
    return NextResponse.json({ error: "مزوّد غير معروف" }, { status: 400 });
  }

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } });
  if (!bot) return NextResponse.json({ error: "البوت غير مهيأ" }, { status: 400 });

  // Build the update patch carefully.
  const data: Record<string, any> = { aiProvider: provider };

  if (provider === "keyone") {
    // Switching back to default — clear any stored key + model override.
    data.aiApiKeyEnc = null;
    data.aiModel = null;
  } else {
    // Optional model override. Empty string clears it.
    if (typeof model === "string") {
      data.aiModel = model.trim() === "" ? null : model.trim();
    }
    // API key handling:
    //   - non-empty trimmed string ⇒ encrypt + store
    //   - omitted OR empty ⇒ preserve existing (the user didn't change it)
    if (typeof apiKey === "string" && apiKey.trim().length > 0) {
      try {
        data.aiApiKeyEnc = encryptSecret(apiKey.trim());
      } catch (e: any) {
        return NextResponse.json(
          { error: "فشل تشفير المفتاح: " + (e?.message || "") },
          { status: 500 }
        );
      }
    } else {
      // No new key supplied. If the bot has no stored key yet, we cannot
      // activate this provider — reject explicitly so the merchant gets a
      // useful error instead of silent "keyone" fallback.
      if (!(bot as any).aiApiKeyEnc) {
        return NextResponse.json(
          { error: "مفتاح الـ API مطلوب لتفعيل هذا المزوّد" },
          { status: 400 }
        );
      }
    }
  }

  await prisma.bot.update({ where: { id: bot.id }, data: data as any });

  // Audit the provider switch — record ONLY the provider id, never the key.
  void auditCtx(await getAuthContext(), "settings.ai_provider_changed", {
    userId: user.id,
    targetType: "bot",
    targetId: bot.id,
    metadata: { provider, keyChanged: typeof apiKey === "string" && apiKey.trim().length > 0 },
    req,
  });

  return NextResponse.json({ ok: true });
}
