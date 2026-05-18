import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { checkLimit, incrementUsage } from "@/lib/membership/limits";

export const dynamic = "force-dynamic";

export async function GET() {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const items = await prisma.broadcast.findMany({
    where: { userId: uid },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  let body: any = {};
  try { body = await req.json(); } catch {}

  const title = String(body.title || "حملة بدون عنوان").trim().slice(0, 120);
  const template = String(body.template || "").trim();
  const audience = String(body.audience || "all");
  // Safe-by-default: only personalize when the merchant explicitly opts in.
  // Previously this defaulted to `true` which silently rewrote every message
  // through the LLM — confusing merchants who expected their exact text.
  const personalize = body.personalize === true;

  if (!template) {
    return NextResponse.json({ error: "نص الرسالة مطلوب" }, { status: 400 });
  }

  // ---- Membership gate -------------------------------------------------------
  // Suspended accounts and plans without broadcast access (or with the monthly
  // cap exhausted) are blocked here. We never let a broadcast be created when
  // the merchant can't actually send it. Plan-level featureFlags.broadcasts=false
  // turns this into a clean "feature_disabled" error instead of a quota miss.
  const decision = await checkLimit(uid, "broadcast");
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error:
          decision.reason === "suspended"        ? "الحساب معلّق" :
          decision.reason === "expired"          ? "اشتراكك منتهي — قم بالتجديد" :
          decision.reason === "feature_disabled" ? "البث الجماعي غير متاح في باقتك الحالية" :
          decision.reason === "exhausted"        ? `استنفدت حد البث الشهري (${decision.cap}) — يتجدد ${decision.resetAt?.toLocaleDateString("ar-EG")}` :
                                                   "البث غير متاح حالياً",
        reason: decision.reason,
        used: decision.used,
        cap: decision.cap,
      },
      { status: 403 }
    );
  }

  // Build audience filter
  const where: any = { userId: uid };
  if (audience === "hot") where.leadScore = { gte: 70 };
  else if (audience === "warm") where.leadScore = { gte: 40, lt: 70 };
  else if (audience.startsWith("tag:")) {
    const tag = audience.slice(4);
    if (tag) where.tags = { contains: JSON.stringify(tag).slice(1, -1) };
  }

  const allMatched = await prisma.customer.findMany({
    where,
    select: { id: true, phone: true, name: true },
  });

  // Exclude unreachable contacts: rows whose stored phone is actually a
  // WhatsApp LID (privacy id, not a dialable number). We can never initiate
  // a broadcast to them — the wa-service would just throw "cannot initiate
  // send to WhatsApp LID". Filtering here keeps the broadcast counters
  // honest and lets the merchant know upfront how many were skipped.
  const isReachable = (ph: string | null | undefined) => {
    const v = (ph || "").trim();
    if (!v) return false;
    if (v.startsWith("lid:")) return false;
    if (v.includes("@lid")) return false;
    const digits = v.replace(/^\+/, "").replace(/[^\d]/g, "");
    return digits.length >= 8 && digits.length <= 13;
  };
  const customers = allMatched.filter((c) => isReachable(c.phone));
  const skipped = allMatched.length - customers.length;

  if (customers.length === 0) {
    return NextResponse.json(
      {
        error:
          allMatched.length === 0
            ? "لا يوجد عملاء يطابقون هذه الجمهور"
            : `كل العملاء (${skipped}) لا يملكون رقم هاتف يمكن المراسلة عليه (معرّفات واتساب فقط).`,
      },
      { status: 400 }
    );
  }

  const bc = await prisma.broadcast.create({
    data: {
      userId: uid,
      title,
      template: template.slice(0, 4000),
      audience,
      personalize,
      total: customers.length,
      items: {
        create: customers.map((c: any) => ({
          customerId: c.id,
          phone: c.phone,
          name: c.name,
        })),
      },
    },
  });

  // Membership: count this broadcast against the monthly cap. Best-effort —
  // a counter write failure must never undo a successful broadcast creation.
  await incrementUsage(uid, "broadcast", 1);

  return NextResponse.json({ ok: true, broadcast: bc, skipped });
}
