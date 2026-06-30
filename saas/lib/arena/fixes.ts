// Testing Arena 2.1 — TA-2 Auto Fix Engine.
//
// Generates fixes from real arena weaknesses. Applying a fix creates a REAL
// editable knowledge document (starter content for that gap), re-indexes the
// brain, and re-runs the arena so the before→after score improvement is
// MEASURED, not asserted. Approve = apply; Reject = dismiss.
import { prisma } from "@/lib/db";
import { reindex } from "@/lib/knowledge-brain/search";
import { runArena, getLatestArena } from "./runner";

interface FixTemplate {
  type: string;
  title: string;
  detail: string;
  docTitle: string;
  docContent: string;
}

const FIX_TEMPLATES: Record<string, FixTemplate> = {
  pricing: {
    type: "knowledge",
    title: "إضافة معرفة: الأسعار والخصومات",
    detail: "العملاء يسألون عن الأسعار ولا توجد معرفة كافية.",
    docTitle: "الأسعار والخصومات",
    docContent:
      "أسعار منتجاتنا موضّحة في الكتالوج. السعر شامل الضريبة. يتوفر خصم على الكميات الكبيرة عند الطلب من خمس قطع فأكثر. الشحن يُحسب حسب المحافظة.",
  },
  refund: {
    type: "knowledge",
    title: "إضافة معرفة: سياسة الاسترجاع",
    detail: "أسئلة الاسترجاع بدون إجابة في المعرفة.",
    docTitle: "سياسة الاسترجاع والاستبدال",
    docContent:
      "يمكن استرجاع أو استبدال المنتج خلال 14 يوماً من الاستلام بشرط أن يكون بحالته الأصلية. يتم رد المبلغ خلال 3 إلى 5 أيام عمل بعد استلام المنتج المرتجع. الاسترجاع بسبب عيب مصنعي مجاني.",
  },
  order_tracking: {
    type: "knowledge",
    title: "إضافة معرفة: تتبع الطلب",
    detail: "أسئلة تتبع الطلب بدون إجابة.",
    docTitle: "تتبع الطلب",
    docContent:
      "يمكنك تتبع طلبك عبر رقم الشحنة الذي يصلك برسالة بعد شحن الطلب. حالة الطلب تتغير من: مؤكد، ثم تم الشحن، ثم خرج للتوصيل، ثم تم التسليم. لأي استفسار عن طلبك تواصل مع خدمة العملاء برقم الطلب.",
  },
  delivery_delay: {
    type: "knowledge",
    title: "إضافة معرفة: مواعيد التوصيل",
    detail: "أسئلة تأخير التوصيل بدون إجابة.",
    docTitle: "مواعيد التوصيل",
    docContent:
      "التوصيل يستغرق من 2 إلى 5 أيام عمل داخل القاهرة والجيزة، ومن 3 إلى 7 أيام لباقي المحافظات. في حال التأخير عن الموعد المتوقع نعتذر ونتابع الشحنة فوراً مع شركة الشحن.",
  },
  faq: {
    type: "knowledge",
    title: "إضافة معرفة: الأسئلة الشائعة",
    detail: "أسئلة شائعة بدون إجابة.",
    docTitle: "الأسئلة الشائعة",
    docContent:
      "طرق الدفع: فيزا، انستاباي، فودافون كاش، والدفع عند الاستلام. نوصل لجميع المحافظات. المنتجات أصلية وعليها ضمان. مواعيد العمل من 9 صباحاً حتى 9 مساءً.",
  },
  upsell: {
    type: "knowledge",
    title: "إضافة معرفة: المنتجات المتقدمة",
    detail: "لا توجد معلومات تتيح الترقية.",
    docTitle: "المنتجات المتقدمة والبدائل",
    docContent:
      "تتوفر إصدارات أعلى من منتجاتنا بمواصفات أفضل وضمان أطول. اسأل خدمة العملاء عن الموديل الاحترافي المناسب لاحتياجك.",
  },
  cross_sell: {
    type: "knowledge",
    title: "إضافة معرفة: المنتجات المكمّلة",
    detail: "لا توجد معلومات للبيع المتقاطع.",
    docTitle: "المنتجات المكمّلة",
    docContent:
      "نوفّر إكسسوارات ومنتجات مكمّلة تناسب مشترياتك، مع عروض عند شراء أكثر من منتج معاً.",
  },
  abandoned_cart: {
    type: "knowledge",
    title: "إضافة معرفة: استكمال السلة",
    detail: "لا توجد معالجة لتعثّر الدفع.",
    docTitle: "استكمال الشراء",
    docContent:
      "لو تعثّر الدفع أو توقفت السلة، نحتفظ بمشترياتك ويمكنك استكمال الطلب في أي وقت. طرق الدفع المتاحة: فيزا، انستاباي، فودافون كاش، والدفع عند الاستلام.",
  },
  complaint: {
    type: "knowledge",
    title: "إضافة معرفة: معالجة الشكاوى",
    detail: "لا توجد معالجة موثّقة للشكاوى.",
    docTitle: "معالجة الشكاوى",
    docContent:
      "نأسف لأي تجربة غير مرضية. يتم تسجيل الشكوى ومعالجتها خلال 24 إلى 48 ساعة، ويتم التعويض المناسب في حال وجود خطأ من طرفنا.",
  },
  escalation: {
    type: "knowledge",
    title: "إضافة معرفة: التصعيد لمسؤول",
    detail: "لا توجد قناة تصعيد واضحة.",
    docTitle: "التواصل مع مسؤول",
    docContent:
      "للتواصل مع مسؤول خدمة العملاء أو تصعيد مشكلة عاجلة، يتم تحويلك مباشرة لأحد أعضاء الفريق خلال ساعات العمل، أو تترك رقمك ليتم التواصل معك في أقرب وقت.",
  },
};
const GENERIC: FixTemplate = {
  type: "knowledge",
  title: "إضافة معرفة",
  detail: "فجوة معرفية مكتشفة.",
  docTitle: "معلومة إضافية",
  docContent: "أضف هنا المعلومة المطلوبة للرد على هذه الفئة من الأسئلة.",
};

/** Create queued fixes from the latest arena weaknesses (idempotent per category). */
export async function generateFixes(userId: string) {
  const latest = await getLatestArena(userId);
  const existing = await prisma.arenaFix.findMany({
    where: { userId, status: { in: ["queued", "applied"] } },
    select: { category: true },
  });
  const seen = new Set(existing.map((e) => e.category));
  let created = 0;
  for (const w of latest.weaknesses) {
    if (seen.has(w.category)) continue;
    const t = FIX_TEMPLATES[w.category] || GENERIC;
    await prisma.arenaFix.create({
      data: {
        userId,
        type: t.type,
        category: w.category,
        title: t.title,
        detail: `${w.label}: ${w.fail} فاشل · ${w.weak} ضعيف`,
      },
    });
    created++;
  }
  return { created, weaknesses: latest.weaknesses.length };
}

/** Apply a fix: create the artifact, reindex, re-run arena, record before/after. */
export async function applyFix(userId: string, id: string) {
  const fix = await prisma.arenaFix.findFirst({ where: { id, userId } });
  if (!fix) return null;
  if (fix.status !== "queued") return { ok: false as const, reason: "not_queued" };

  const before =
    (await prisma.arenaRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }))
      ?.score || 0;
  const t = FIX_TEMPLATES[fix.category] || GENERIC;
  // Create the artifact, reindex, re-run arena — atomic-ish: if any step throws,
  // roll back the orphan document and leave the fix re-applyable (no duplicate
  // documents on retry). Fixes the CRITICAL flagged by silent-failure review.
  let doc: { id: string } | null = null;
  try {
    doc = await prisma.document.create({
      data: { userId, title: t.docTitle, content: t.docContent, source: "suggestion" },
    });
    await reindex(userId);
    const run = await runArena(userId);
    const after = run.score;
    const improvement = after - before;
    await prisma.arenaFix.update({
      where: { id },
      data: {
        status: "applied",
        beforeScore: before,
        afterScore: after,
        improvement,
        artifactType: "document",
        artifactId: doc.id,
        resolvedAt: new Date(),
      },
    });
    return { ok: true as const, before, after, improvement, documentId: doc.id };
  } catch (e) {
    if (doc) await prisma.document.delete({ where: { id: doc.id } }).catch(() => {});
    throw e; // fix stays "queued" → safe to retry without duplicating
  }
}

export async function rejectFix(userId: string, id: string) {
  const upd = await prisma.arenaFix.updateMany({
    where: { id, userId, status: "queued" },
    data: { status: "rejected", resolvedAt: new Date() },
  });
  return { ok: upd.count > 0 };
}

export async function listFixes(userId: string) {
  const [queued, history] = await Promise.all([
    prisma.arenaFix.findMany({
      where: { userId, status: "queued" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.arenaFix.findMany({
      where: { userId, status: { in: ["applied", "rejected"] } },
      orderBy: { resolvedAt: "desc" },
      take: 30,
    }),
  ]);
  return { queued, history };
}
