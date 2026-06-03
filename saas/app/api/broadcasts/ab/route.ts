// Advanced Broadcast AI — A/B campaign creation.
//
// Creates TWO linked Broadcast rows (variant A / variant B) sharing an
// abGroupId. The resolved audience is shuffled and split 50/50. Both variants
// then drain through the EXISTING, untouched send pipeline (cron/worker). The
// winner is computed later by comparing each variant's replies/conversions.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/membership/limits";
import { buildAudienceWhere } from "@/lib/broadcasts/audience";
import { resolveSegmentCustomers } from "@/lib/analytics/segments";

export const dynamic = "force-dynamic";

function isReachable(ph: string | null | undefined): boolean {
  const v = (ph || "").trim();
  if (!v || v.startsWith("lid:") || v.includes("@lid")) return false;
  const digits = v.replace(/^\+/, "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 13;
}

export async function POST(req: Request) {
  const uid = await getUserIdForPermission("broadcasts");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  const templateA = String(body.templateA || "").trim();
  const templateB = String(body.templateB || "").trim();
  const audience = String(body.audience || "all");
  const baseTitle = String(body.title || "اختبار A/B").trim().slice(0, 110);
  const couponCode = body.couponCode ? String(body.couponCode).trim().slice(0, 60) : null;
  const imageUrl =
    typeof body.imageUrl === "string" && /^https?:\/\/\S+$/i.test(body.imageUrl.trim()) ? body.imageUrl.trim().slice(0, 500) : null;

  if (!templateA || !templateB) {
    return NextResponse.json({ error: "نص النسختين (A و B) مطلوب" }, { status: 400 });
  }

  // Membership gate (one check for the A/B test).
  const decision = await checkLimit(uid, "broadcast");
  if (!decision.allowed) {
    return NextResponse.json({ error: "البث غير متاح في باقتك الحالية أو استُنفد الحد", reason: decision.reason }, { status: 403 });
  }

  // Resolve audience → reachable recipients.
  let matched: { id: string; phone: string | null; name: string | null }[];
  if (audience.startsWith("segment:")) {
    matched = await resolveSegmentCustomers(uid, audience.slice("segment:".length), { reachableOnly: false });
  } else {
    const where: any = buildAudienceWhere(uid, audience, {
      inactiveDays: body.inactiveDays != null ? Number(body.inactiveDays) : undefined,
      from: body.from || null,
      to: body.to || null,
    });
    matched = await prisma.customer.findMany({ where, select: { id: true, phone: true, name: true } });
  }
  const reachable = matched.filter((c) => isReachable(c.phone));
  if (reachable.length < 2) {
    return NextResponse.json({ error: "تحتاج عميلين على الأقل قابلين للمراسلة لتشغيل اختبار A/B" }, { status: 400 });
  }

  // Shuffle (Fisher–Yates) then split 50/50.
  for (let i = reachable.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [reachable[i], reachable[j]] = [reachable[j], reachable[i]];
  }
  const mid = Math.ceil(reachable.length / 2);
  const groupA = reachable.slice(0, mid);
  const groupB = reachable.slice(mid);
  const abGroupId = `ab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const mk = (variant: "A" | "B", template: string, group: typeof reachable) =>
    prisma.broadcast.create({
      data: {
        userId: uid,
        title: `${baseTitle} — ${variant}`,
        template: template.slice(0, 4000),
        audience,
        personalize: false,
        couponCode,
        imageUrl,
        abGroupId,
        abVariant: variant,
        total: group.length,
        items: { create: group.map((c) => ({ customerId: c.id, phone: c.phone as string, name: c.name })) },
      } as any,
    });

  const [a, b] = await Promise.all([mk("A", templateA, groupA), mk("B", templateB, groupB)]);

  // Count the A/B test as one campaign against the monthly cap (best-effort).
  await incrementUsage(uid, "broadcast", 1).catch(() => {});

  return NextResponse.json({
    ok: true,
    abGroupId,
    a: { id: a.id, total: groupA.length },
    b: { id: b.id, total: groupB.length },
  });
}
