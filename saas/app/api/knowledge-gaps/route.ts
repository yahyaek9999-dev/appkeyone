import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserIdForPermission } from "@/lib/auth";
import { apiGate } from "@/lib/membership/gate";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await apiGate("knowledge_base");
  if (gate.response) return gate.response;
  const uid = await getUserIdForPermission("settings");
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const rows = await prisma.knowledgeGap.findMany({
    where: { userId: uid, resolved: false },
    orderBy: [{ occurrences: "desc" }, { updatedAt: "desc" }],
    take: 100,
  });
  const now = Date.now();
  const seen = new Set<string>();
  const items = rows
    .map((g: any) => rankGap(g, now))
    .filter((g: any) => {
      const key = normalizeQuestion(g.question).slice(0, 90);
      if (!key) return false;
      if (seen.has(key) && g.occurrences <= 1) return false;
      seen.add(key);
      return g.score >= 18;
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.occurrences - a.occurrences ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, 50);
  return NextResponse.json({ items });
}

function normalizeQuestion(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/[ة]/g, "ه")
    .replace(/[^\u0600-\u06ffa-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rankGap(g: any, now: number) {
  const ageHours = Math.max(
    1,
    (now - new Date(g.updatedAt || g.createdAt).getTime()) / 36e5,
  );
  const q = normalizeQuestion(g.question);
  const commerce =
    /سعر|بكام|كام|منتج|مقاس|لون|شحن|توصيل|دفع|اشتراك|باقة|باقه|price|product|shipping|delivery|payment|plan/.test(
      q,
    );
  const conversion =
    /اشتري|اطلب|احجز|اوردر|دفع|تحويل|buy|order|purchase|subscribe/.test(q);
  const supportRisk =
    /مش شغال|مشكله|مشكلة|غلط|مش فاهم|تاخير|تأخير|refund|استرجاع|شكوي|شكوى|problem|issue/.test(
      q,
    );
  const policy =
    /ضمان|استرجاع|استبدال|سياسه|سياسة|refund|warranty|return|policy/.test(q);
  const reasons = [
    g.occurrences > 1 ? "يتكرر كثيراً" : null,
    conversion ? "يؤثر على البيع" : null,
    commerce ? "سؤال تجاري/منتج" : null,
    policy ? "سياسة مهمة" : null,
    supportRisk ? "قد يسبب إحباط" : null,
    g.lastSentiment === "angry" ? "عميل غاضب" : null,
  ].filter(Boolean);

  const score = Math.round(
    Math.min(80, (g.occurrences || 1) * 18) +
      (conversion ? 30 : 0) +
      (commerce ? 22 : 0) +
      (policy ? 18 : 0) +
      (supportRisk ? 16 : 0) +
      Math.max(0, 48 - ageHours) * 0.8 +
      (g.lastSentiment === "angry"
        ? 22
        : g.lastSentiment === "negative"
          ? 12
          : 0),
  );

  const impactLabel =
    conversion || score >= 85
      ? "تأثير عالي على المبيعات"
      : supportRisk || policy
        ? "يقلل إحباط العملاء"
        : commerce
          ? "يحسن إجابات المنتج"
          : "تحسين معرفة عام";

  return {
    ...g,
    score,
    impactLabel,
    productHint:
      g.productHint || (commerce ? "commerce" : policy ? "policy" : null),
    reasons,
  };
}
