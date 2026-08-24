/**
 * POST /api/testing-arena/run — REAL business + AI readiness test.
 * (1) Readiness audit: deterministic checks across AI / Knowledge / Products /
 *     WhatsApp+Meta / Broadcasts / Orders / Automations -> score + recommendations.
 * (2) Scenario runner: pushes 5 real customer scenarios (angry / refund / purchase /
 *     pricing / shipping) through the SAME reply pipeline the bot uses, scores each
 *     answer, flags weaknesses, and suggests a fix. No new AI system — reuses the
 *     existing buildMessages + retrieveRelevantKb + llmChat path from /api/chat.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { chat as llmChat, buildMessages } from "@/lib/llm";
import { botProviderOverride } from "@/lib/providers/bot-provider";
import { retrieveRelevantKb } from "@/lib/kb-cache";
import { getEntitlements } from "@/lib/membership/entitlements";
import { normalizeConnectionMode } from "@/lib/messaging/mode";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Check = { key: string; label: string; status: "ok" | "warn" | "fail"; detail: string; recommendation: string; fixHref?: string };

const SCENARIOS = [
  { key: "angry", label: "عميل غاضب", msg: "الخدمة سيئة جدًا وأنا غاضب! الطلب وصل متأخر وتالف.", expect: ["أسف", "اعتذ", "نعوّض", "نحل", "فهمت", "نأسف"] },
  { key: "refund", label: "طلب استرجاع", msg: "أريد استرجاع مبلغ المنتج لأنه لا يعمل. كيف أسترجع فلوسي؟", expect: ["استرجاع", "استرداد", "سياسة", "المبلغ", "تعويض"] },
  { key: "purchase", label: "نية شراء", msg: "حابب أشتري المنتج ده، متاح؟ وكيف أطلب؟", expect: ["متاح", "الطلب", "السعر", "اطلب", "تمام"] },
  { key: "pricing", label: "استفسار سعر", msg: "بكام المنتج؟ وفيه خصم؟", expect: ["سعر", "ج", "جنيه", "خصم", "العرض"] },
  { key: "shipping", label: "استفسار شحن", msg: "الشحن بياخد كام يوم؟ وللإسكندرية بكام؟", expect: ["شحن", "يوم", "توصيل", "التوصيل", "الشحن"] },
];

const FALLBACK = "عذراً، يبدو أن هناك خلل تقني مؤقت";

export async function POST() {
  // Internal diagnostic surface — platform-admin only, matching the page guard.
  let user;
  try { user = await requireAdmin(); }
  catch { return NextResponse.json({ error: "unauthorized" }, { status: 401 }); }
  const uid = user.id;

  const [bot, docCount, productCount, orderCount, autoCount, ent] = await Promise.all([
    prisma.bot.findUnique({ where: { userId: uid } }),
    prisma.document.count({ where: { userId: uid } }).catch(() => 0),
    prisma.product.count({ where: { userId: uid } }).catch(() => 0),
    prisma.order.count({ where: { userId: uid } }).catch(() => 0),
    (prisma as any).commerceAutomation?.count?.({ where: { integration: { userId: uid } } }).catch(() => 0) ?? Promise.resolve(0),
    getEntitlements(uid).catch(() => null),
  ]);

  // ── (1) Readiness audit ────────────────────────────────────────────────────
  const checks: Check[] = [];
  const hasProvider = !!botProviderOverride(bot);
  checks.push({
    key: "ai", label: "مزوّد الذكاء الاصطناعي",
    status: hasProvider ? "ok" : "warn",
    detail: hasProvider ? "مزوّد خاص مهيّأ" : "يعمل بمزوّد KEYONE الافتراضي",
    recommendation: hasProvider ? "" : "أضِف مفتاح OpenAI/Claude/Gemini للتحكم الكامل في الردود.",
    fixHref: "/dashboard/settings/ai-provider",
  });
  checks.push({
    key: "knowledge", label: "قاعدة المعرفة",
    status: docCount > 0 ? "ok" : "fail",
    detail: `${docCount} مستند`,
    recommendation: docCount > 0 ? "" : "أضِف مستندات (سياسات، أسئلة شائعة) ليجيب البوت بدقة بدل ردود عامة.",
    fixHref: "/dashboard/knowledge",
  });
  checks.push({
    key: "products", label: "المنتجات",
    status: productCount > 0 ? "ok" : "warn",
    detail: `${productCount} منتج`,
    recommendation: productCount > 0 ? "" : "أضِف منتجاتك ليعرضها البوت ويجاوب على الأسعار.",
    fixHref: "/dashboard/products",
  });
  const mode = normalizeConnectionMode((bot as any)?.connectionMode);
  const waConnected = (bot as any)?.whatsappStatus === "connected" || (mode === "meta_cloud" && !!(bot as any)?.metaAccessTokenEnc);
  checks.push({
    key: "whatsapp", label: mode === "meta_cloud" ? "اتصال Meta" : "اتصال واتساب",
    status: waConnected ? "ok" : "fail",
    detail: waConnected ? "متصل" : "غير متصل",
    recommendation: waConnected ? "" : "اربط واتساب لاستقبال محادثات العملاء فعليًا.",
    fixHref: mode === "meta_cloud" ? "/dashboard/meta-health" : "/dashboard/whatsapp",
  });
  const canBroadcast = !!ent && (!ent.enforce || ent.capabilities["broadcasts"]);
  checks.push({
    key: "broadcasts", label: "الحملات (Broadcasts)",
    status: canBroadcast ? "ok" : "warn",
    detail: canBroadcast ? "متاحة في باقتك" : "غير متضمّنة في باقتك",
    recommendation: canBroadcast ? "" : "رقّ باقتك لتفعيل حملات البثّ.",
    fixHref: "/dashboard/billing",
  });
  checks.push({
    key: "orders", label: "تدفّق الطلبات",
    status: orderCount > 0 ? "ok" : "warn",
    detail: `${orderCount} طلب`,
    recommendation: orderCount > 0 ? "" : "اربط متجرك أو فعّل رصد الطلبات ليبدأ تتبّع المبيعات.",
    fixHref: "/dashboard/integrations",
  });
  checks.push({
    key: "automations", label: "الأتمتة والمتابعة",
    status: ((bot as any)?.followUpsEnabled || autoCount > 0) ? "ok" : "warn",
    detail: (bot as any)?.followUpsEnabled ? "متابعة تلقائية مفعّلة" : `${autoCount} أتمتة`,
    recommendation: ((bot as any)?.followUpsEnabled || autoCount > 0) ? "" : "فعّل المتابعة التلقائية لاسترجاع العملاء المتردّدين.",
    fixHref: "/dashboard/automations",
  });

  const auditScore = Math.round((checks.filter((c) => c.status === "ok").length / checks.length) * 100);

  // ── (2) Scenario runner ─────────────────────────────────────────────────────
  const scenarios: any[] = [];
  for (const s of SCENARIOS) {
    let reply = "";
    let aiError = false;
    if (bot) {
      try {
        const kb = await retrieveRelevantKb(uid, s.msg, { k: 5, charBudget: 4000, minScore: 0.08 }).catch(() => []);
        const messages = buildMessages({
          systemPrompt: (bot as any).systemPrompt,
          botName: bot.name,
          persona: (bot as any).persona,
          welcomeMessage: (bot as any).welcomeMessage,
          knowledgeBase: kb,
          history: [],
          newUserMsg: s.msg,
          customerName: "عميل تجريبي",
          customerPhone: "+200000000000",
        } as any);
        reply = await llmChat(messages, { provider: botProviderOverride(bot), meterUserId: uid });
      } catch {
        aiError = true;
      }
    }
    const text = String(reply || "").trim();
    const responded = !!text && !text.includes(FALLBACK) && !aiError;
    const lc = text.toLowerCase();
    const addressed = s.expect.some((k) => lc.includes(k.toLowerCase()));
    let score = 0;
    if (responded) score += 45;
    if (responded && text.length >= 40) score += 20;
    if (responded && addressed) score += 25;
    if (responded && !lc.includes("سعر") && s.key !== "pricing") score += 10; else if (responded) score += 10;
    score = Math.min(100, score);

    const weaknesses: string[] = [];
    const suggestions: string[] = [];
    if (!responded) {
      weaknesses.push("لم يردّ الذكاء الاصطناعي (المزوّد غير مهيّأ أو غير متاح).");
      suggestions.push("أضِف مفتاح مزوّد ذكاء اصطناعي من الإعدادات ليبدأ البوت بالرد.");
    } else {
      if (!addressed) { weaknesses.push(`لم يعالج الرد جوهر «${s.label}» بوضوح.`); suggestions.push(`أضِف إلى قاعدة المعرفة محتوى يخصّ ${s.label} (سياسة/أسئلة شائعة).`); }
      if (text.length < 40) { weaknesses.push("الرد قصير جدًا."); suggestions.push("وسّع شخصية البوت ووجّهه لردود أوضح."); }
    }

    scenarios.push({ key: s.key, label: s.label, message: s.msg, reply: text || "—", score, addressed, responded, weaknesses, suggestions });
  }

  const avgScenario = scenarios.length ? Math.round(scenarios.reduce((a, b) => a + b.score, 0) / scenarios.length) : 0;
  const overall = Math.round((auditScore + avgScenario) / 2);

  // Top recommendations = failing/warn checks + scenario suggestions, deduped.
  const recommendations = [
    ...checks.filter((c) => c.status !== "ok" && c.recommendation).map((c) => ({ priority: c.status === "fail" ? "high" : "medium", text: c.recommendation, fixHref: c.fixHref })),
    ...Array.from(new Set(scenarios.flatMap((s: any) => s.suggestions))).map((t) => ({ priority: "medium", text: t as string })),
  ].slice(0, 8);

  return NextResponse.json({ ok: true, overall, auditScore, scenarioScore: avgScenario, checks, scenarios, recommendations });
}
