// GET/PUT /api/admin/integrations  (Areas 3 + 4 — admin-managed Meta + AI)
//
// Lets a platform admin configure Meta (App ID/Secret, Business ID, Phone
// Number ID, Access Token) and AI provider keys (OpenAI/Claude/Gemini) from the
// admin UI — no env requirement. Secrets are AES-256-GCM encrypted at rest in
// SiteConfig and never returned raw (GET returns a mask only).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/crypto-util";

export const dynamic = "force-dynamic";

const Body = z.object({
  metaAppId: z.string().max(64).optional(),
  metaBusinessId: z.string().max(64).optional(),
  metaPhoneNumberId: z.string().max(64).optional(),
  metaAccessToken: z.string().max(2000).optional(),
  metaAppSecret: z.string().max(500).optional(),
  defaultAiProvider: z.enum(["", "openai", "claude", "gemini"]).optional(),
  openaiKey: z.string().max(500).optional(),
  claudeKey: z.string().max(500).optional(),
  geminiKey: z.string().max(500).optional(),
});

function mask(enc: string | null | undefined): { mask: string; hasValue: boolean } {
  if (!enc) return { mask: "", hasValue: false };
  try {
    return { mask: maskSecret(decryptSecret(enc)), hasValue: true };
  } catch {
    return { mask: "•••• (أعد الإدخال)", hasValue: true };
  }
}

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const cfg: any = await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });

  return NextResponse.json({
    ok: true,
    meta: {
      appId: cfg.metaAppId || "",
      businessId: cfg.metaBusinessId || "",
      phoneNumberId: cfg.metaPhoneNumberId || "",
      accessToken: mask(cfg.metaAccessTokenEnc),
      appSecret: mask(cfg.metaAppSecretEnc),
    },
    ai: {
      defaultProvider: cfg.defaultAiProvider || "",
      openai: mask(cfg.openaiKeyEnc),
      claude: mask(cfg.claudeKeyEnc),
      gemini: mask(cfg.geminiKeyEnc),
    },
  });
}

export async function PUT(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });
  const d = parsed.data;

  const data: any = {};
  if (d.metaAppId !== undefined) data.metaAppId = d.metaAppId.trim() || null;
  if (d.metaBusinessId !== undefined) data.metaBusinessId = d.metaBusinessId.trim() || null;
  if (d.metaPhoneNumberId !== undefined)
    data.metaPhoneNumberId = d.metaPhoneNumberId.trim() || null;
  if (d.defaultAiProvider !== undefined) data.defaultAiProvider = d.defaultAiProvider || null;

  // Secrets: encrypt only when a non-empty value is provided (empty = keep).
  if (d.metaAccessToken && d.metaAccessToken.trim())
    data.metaAccessTokenEnc = encryptSecret(d.metaAccessToken.trim());
  if (d.metaAppSecret && d.metaAppSecret.trim())
    data.metaAppSecretEnc = encryptSecret(d.metaAppSecret.trim());
  if (d.openaiKey && d.openaiKey.trim()) data.openaiKeyEnc = encryptSecret(d.openaiKey.trim());
  if (d.claudeKey && d.claudeKey.trim()) data.claudeKeyEnc = encryptSecret(d.claudeKey.trim());
  if (d.geminiKey && d.geminiKey.trim()) data.geminiKeyEnc = encryptSecret(d.geminiKey.trim());

  await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  return NextResponse.json({ ok: true });
}
