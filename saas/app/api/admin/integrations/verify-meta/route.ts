// POST /api/admin/integrations/verify-meta  (Area 3)
//
// Verifies the admin-configured Meta connection: reads the stored phone-number
// id + access token, calls the Graph health endpoint, and maps the result to a
// status the UI shows (connected / token_invalid / disconnected / not_configured).
// Read-only — never touches the WhatsApp send pipeline.

import { authErrorStatus } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { decryptSecret } from "@/lib/crypto-util";
import { getPhoneNumberHealth } from "@/lib/messaging/meta-api";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await requireAdmin();
  } catch (e) {
    return NextResponse.json({ error: "غير مصرح" }, { status: authErrorStatus(e) });
  }

  const cfg: any = await prisma.siteConfig.findUnique({ where: { id: "singleton" } });
  const phoneNumberId = cfg?.metaPhoneNumberId;
  if (!phoneNumberId || !cfg?.metaAccessTokenEnc) {
    return NextResponse.json({
      ok: false,
      status: "not_configured",
      message: "أكمل إعداد رقم الهاتف ورمز الوصول أولاً.",
    });
  }

  let token = "";
  try {
    token = decryptSecret(cfg.metaAccessTokenEnc);
  } catch {
    /* ignore */
  }
  if (!token)
    return NextResponse.json({
      ok: false,
      status: "token_invalid",
      message: "تعذّر قراءة رمز الوصول — أعد إدخاله.",
    });

  const r = await getPhoneNumberHealth({ phoneNumberId, token });
  if (!r.ok) {
    const detail = (r.errorDetail || "").toLowerCase();
    const status =
      detail.includes("token") || detail.includes("oauth") || detail.includes("190")
        ? "token_invalid"
        : "disconnected";
    return NextResponse.json({
      ok: false,
      status,
      message: r.errorDetail || "فشل الاتصال بـ Meta.",
    });
  }

  return NextResponse.json({
    ok: true,
    status: "connected",
    qualityRating: r.data?.quality_rating || null,
    messagingLimit: r.data?.messaging_limit_tier || null,
    displayPhone: r.data?.display_phone_number || null,
  });
}
