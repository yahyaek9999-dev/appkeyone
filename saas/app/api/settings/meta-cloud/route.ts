// GET  /api/settings/meta-cloud  → current Meta Cloud config (tokens masked, never raw)
// PUT  /api/settings/meta-cloud  → update config (phone_number_id, waba_id, token, app_secret, verify_token)
//
// Security:
//   - requireUser() gates by session
//   - Tokens are AES-256-GCM encrypted at rest via lib/crypto-util
//   - GET never returns raw tokens — only a UI mask
//   - Empty/whitespace token on PUT means "keep existing"
//   - Connection mode is normalized through lib/messaging/mode.ts so the
//     DB never holds a value the runtime can't interpret.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/crypto-util";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { metaCloudAllowedForUser, metaCloudGloballyEnabled } from "@/lib/messaging/feature-flags";

export const dynamic = "force-dynamic";

const ModeEnum = z.enum(["qr", "meta_cloud"]);
const PutBody = z.object({
  mode:                 ModeEnum,
  phoneNumberId:        z.string().max(64).optional(),
  businessAccountId:    z.string().max(64).optional(),
  accessToken:          z.string().max(2000).optional(),
  appSecret:            z.string().max(500).optional(),
  webhookVerifyToken:   z.string().max(200).optional(),
});

export async function GET() {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } }) as any;
  if (!bot) return NextResponse.json({ error: "البوت غير مهيأ" }, { status: 400 });

  const mode = normalizeConnectionMode(bot.connectionMode);
  const eligibility = await metaCloudAllowedForUser(user.id);

  // Build UI-safe masks. Raw tokens are NEVER returned.
  const mask = (enc: string | null | undefined): { mask: string; hasValue: boolean } => {
    if (!enc) return { mask: "", hasValue: false };
    try { return { mask: maskSecret(decryptSecret(enc)), hasValue: true }; }
    catch { return { mask: "•••• (يرجى إعادة الإدخال)", hasValue: true }; }
  };

  return NextResponse.json({
    ok: true,
    mode,
    phoneNumberId: bot.metaPhoneNumberId || "",
    businessAccountId: bot.metaBusinessAccountId || "",
    webhookVerifyToken: bot.metaWebhookVerifyToken || "",
    accessToken: mask(bot.metaAccessTokenEnc),
    appSecret:   mask(bot.metaAppSecretEnc),
    qualityRating: bot.metaQualityRating || null,
    messagingLimit: bot.metaMessagingLimit || null,
    verifiedAt: bot.metaVerifiedAt || null,
    eligibility: {
      globalEnabled: metaCloudGloballyEnabled(),
      planAccess: eligibility.access,
      allowed: eligibility.allowed,
      reason: eligibility.reason,
    },
  });
}

export async function PUT(req: Request) {
  let user;
  try { user = await requirePermission("settings"); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }

  const limited = enforceRateLimit(req, { name: "meta-settings", ...RATE_LIMITS.api });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = PutBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });

  const data: any = { connectionMode: parsed.data.mode };

  if (parsed.data.phoneNumberId !== undefined)      data.metaPhoneNumberId = parsed.data.phoneNumberId.trim() || null;
  if (parsed.data.businessAccountId !== undefined)  data.metaBusinessAccountId = parsed.data.businessAccountId.trim() || null;
  if (parsed.data.webhookVerifyToken !== undefined) data.metaWebhookVerifyToken = parsed.data.webhookVerifyToken.trim() || null;

  // Tokens: only encrypt + store when caller provided a non-empty value.
  // Empty string means "keep existing".
  if (parsed.data.accessToken && parsed.data.accessToken.trim()) {
    data.metaAccessTokenEnc = encryptSecret(parsed.data.accessToken.trim());
  }
  if (parsed.data.appSecret && parsed.data.appSecret.trim()) {
    data.metaAppSecretEnc = encryptSecret(parsed.data.appSecret.trim());
  }

  await prisma.bot.update({ where: { userId: user.id }, data: data as any });
  return NextResponse.json({ ok: true });
}
