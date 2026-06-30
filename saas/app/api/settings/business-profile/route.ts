// GET  /api/settings/business-profile  → current business profile (Area 1)
// PUT  /api/settings/business-profile  → upsert business profile fields
//
// Additive: backs the extended business-registration profile captured during
// onboarding and editable afterwards. All fields optional; gated by "settings".

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { enforceRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const PutBody = z.object({
  companyName: z.string().max(160).optional(),
  businessType: z.string().max(160).optional(),
  industry: z.string().max(160).optional(),
  country: z.string().max(160).optional(),
  city: z.string().max(160).optional(),
  whatsappNumber: z.string().max(30).optional(),
  phoneNumber: z.string().max(30).optional(),
  website: z.string().max(200).optional(),
  facebook: z.string().max(200).optional(),
  instagram: z.string().max(200).optional(),
  tiktok: z.string().max(200).optional(),
  linkedin: z.string().max(200).optional(),
  monthlyCustomers: z.string().max(40).optional(),
  currentWhatsappUsage: z.string().max(40).optional(),
  metaApiStatus: z.string().max(40).optional(),
  storePlatform: z.string().max(40).optional(),
});

export async function GET() {
  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const profile = await prisma.businessProfile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({ ok: true, profile: profile || null });
}

export async function PUT(req: Request) {
  let user;
  try {
    user = await requirePermission("settings");
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limited = enforceRateLimit(req, {
    name: "business-profile",
    identifier: user.id,
    ...RATE_LIMITS.api,
  });
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  const parsed = PutBody.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "bad_body", detail: parsed.error.message }, { status: 400 });

  // Normalize: trim, and convert empty strings to null so cleared fields persist.
  const data: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    const t = String(v).trim();
    data[k] = t.length ? t : null;
  }

  const profile = await prisma.businessProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  return NextResponse.json({ ok: true, profile });
}
