// AI Copilot — per-context inline strip data (read-only).
//
// Powers the reusable <AiCopilotStrip context="..."/> component. For each page
// context we COMPOSE the existing intelligence libs (forecast, revenue copilot,
// lost-customer detector, order rollup) into ONE compact payload:
//   { insight, recommendation, action }
//
// THE CONTRACT: this endpoint must NEVER 500 and must NEVER block a page. Every
// composed call is individually try/caught and degrades to a safe, generic-but-
// truthful insight. Worst case the strip shows a neutral "keep going" nudge.
//
// Pure derivation over scores the pipeline already wrote — recomputes nothing on
// the hot path, writes nothing. Mirrors app/api/revenue-copilot/route.ts style.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { computeForecast } from "@/lib/analytics/forecast";
import { buildRevenueCopilot } from "@/lib/intelligence/revenue-opportunity";
import { getOrderRollup } from "@/lib/analytics/order-rollup";
import { detectLostCustomers } from "@/lib/intel/lost-customers";

export const dynamic = "force-dynamic";

// The page contexts the strip can be dropped into. Anything else degrades to
// the generic dashboard treatment rather than erroring.
const CONTEXTS = [
  "dashboard",
  "customers",
  "orders",
  "broadcasts",
  "revenue",
  "automations",
  "integrations",
] as const;
type CopilotContext = (typeof CONTEXTS)[number];

type CopilotAction = { label: string; href: string } | null;

interface CopilotPayload {
  context: CopilotContext;
  insight: string;
  recommendation: string;
  action: CopilotAction;
  generatedAt: string;
}

// Whole-EGP money — matches the money convention used across the app.
function egp(n: number): string {
  return `${Math.round(n || 0).toLocaleString("ar-EG")} ج.م`;
}

// Safe generic fallback so a single failing detector never blanks the strip.
function genericInsight(context: CopilotContext): CopilotPayload {
  return {
    context,
    insight: "نراقب نشاط حسابك لاكتشاف أفضل الفرص.",
    recommendation: "راجع لوحة الفرص لمعرفة أعلى الخطوات قيمةً اليوم.",
    action: { label: "افتح كوبايلوت الإيرادات", href: "/dashboard/revenue-copilot" },
    generatedAt: new Date().toISOString(),
  };
}

// ── Per-context builders ────────────────────────────────────────────────────
// Each is independently try/caught by the dispatcher below; if it throws we fall
// back to genericInsight(context).

async function buildRevenueOrDashboard(uid: string, context: CopilotContext): Promise<CopilotPayload> {
  const now = new Date();
  const [forecast, copilot] = await Promise.all([
    computeForecast(uid).catch(() => null),
    buildRevenueCopilot(uid, { now, limit: 12 }).catch(() => null),
  ]);

  let insight = "نراقب أداء مبيعاتك لاكتشاف الاتجاه القادم.";
  if (forecast) {
    const dir = forecast.growthPct >= 0 ? "ارتفاعاً" : "انخفاضاً";
    insight =
      `الإيرادات المتوقعة خلال 7 أيام ${egp(forecast.next7Revenue)} ` +
      `(${dir} ${Math.abs(Math.round(forecast.growthPct))}% عن الأسبوع الماضي).`;
    // Prefer a concrete insight line emitted by the forecast engine if present.
    if (forecast.insights && forecast.insights.length > 0 && forecast.insights[0].text) {
      insight = forecast.insights[0].text;
    }
  }

  let recommendation = "راجع لوحة الفرص لتحديد أعلى خطوة قيمةً اليوم.";
  let action: CopilotAction = { label: "افتح كوبايلوت الإيرادات", href: "/dashboard/revenue-copilot" };
  if (copilot && copilot.opportunityCount > 0) {
    const top = copilot.opportunities[0];
    recommendation =
      `لديك ${copilot.opportunityCount} فرصة بقيمة تقديرية ${egp(copilot.totalPipelineValue)}. ` +
      (top ? `الأولوية: ${top.title} — ${top.customerName || "عميل"}.` : "");
  }

  return { context, insight, recommendation, action, generatedAt: new Date().toISOString() };
}

async function buildCustomers(uid: string): Promise<CopilotPayload> {
  const now = new Date();
  const [lost, copilot] = await Promise.all([
    detectLostCustomers(uid, now).catch(() => [] as Awaited<ReturnType<typeof detectLostCustomers>>),
    buildRevenueCopilot(uid, { now, limit: 12 }).catch(() => null),
  ]);

  let insight = "نتابع عملاءك لاكتشاف من يحتاج لمتابعة الآن.";
  if (lost.length > 0) {
    const top = lost[0];
    insight =
      `${lost.length} عميل أبدى اهتماماً ثم اختفى. ` +
      `الأعلى أولوية: ${top.customerName || "عميل"} منذ ${top.daysSinceLastMsg ?? "—"} يوم.`;
  }

  let recommendation = "راجع لوحة الفرص لاستعادة العملاء قبل أن يضيعوا.";
  let action: CopilotAction = { label: "افتح كوبايلوت الإيرادات", href: "/dashboard/revenue-copilot" };
  if (copilot && copilot.opportunityCount > 0) {
    const top = copilot.opportunities[0];
    recommendation = top
      ? `ابدأ بـ ${top.customerName || "عميل"}: ${top.title} (قيمة تقديرية ${egp(top.estimatedValue)}).`
      : recommendation;
  } else if (lost.length > 0) {
    recommendation = "أرسل رسالة استعادة للعملاء الذين اختفوا للحفاظ على الإيراد المحتمل.";
    action = { label: "افتح العملاء", href: "/dashboard/customers" };
  }

  return { context: "customers", insight, recommendation, action, generatedAt: new Date().toISOString() };
}

async function buildOrders(uid: string): Promise<CopilotPayload> {
  const now = new Date();
  const rollup = await getOrderRollup(uid, { now }).catch(() => null);

  let insight = "نراقب طلباتك لاكتشاف فرص النمو وتكرار الشراء.";
  let recommendation = "راجع لوحة الفرص لزيادة متوسط قيمة الطلب والإيراد.";
  if (rollup) {
    const t = rollup.totals;
    insight =
      `${t.orders.toLocaleString("ar-EG")} طلب بإيراد ${egp(t.revenue)} · ` +
      `متوسط قيمة الطلب ${egp(t.aov)}.`;
    if (t.repeatCustomers > 0) {
      recommendation =
        `${t.repeatCustomers.toLocaleString("ar-EG")} عميل اشترى أكثر من مرة — ` +
        `استهدفهم بعرض مكمّل لرفع متوسط قيمة الطلب.`;
    } else if (t.customersWithOrders > 0) {
      recommendation = "حوّل المشترين لمرة واحدة إلى عملاء متكررين عبر متابعة بعد البيع.";
    }
  }

  return {
    context: "orders",
    insight,
    recommendation,
    action: { label: "افتح كوبايلوت الإيرادات", href: "/dashboard/revenue-copilot" },
    generatedAt: new Date().toISOString(),
  };
}

// broadcasts / automations / integrations: derive a revenue-framed nudge from
// the copilot pipeline + forecast, with a context-appropriate action target.
async function buildDerived(uid: string, context: CopilotContext): Promise<CopilotPayload> {
  const now = new Date();
  const [copilot, forecast] = await Promise.all([
    buildRevenueCopilot(uid, { now, limit: 12 }).catch(() => null),
    computeForecast(uid).catch(() => null),
  ]);

  const reachable = copilot?.opportunityCount ?? 0;
  const pipeline = copilot?.totalPipelineValue ?? 0;

  if (context === "broadcasts") {
    const insight =
      reachable > 0
        ? `${reachable} عميل ضمن فرص نشطة بقيمة ${egp(pipeline)} — شريحة جاهزة لرسالة موجّهة.`
        : "ابدأ حملة موجّهة للعملاء النشطين لتحويل الاهتمام إلى مبيعات.";
    return {
      context,
      insight,
      recommendation: "وجّه البث للشرائح عالية القيمة بدل الإرسال العام لرفع معدل الرد.",
      action: { label: "أنشئ بثاً جديداً", href: "/dashboard/broadcasts" },
      generatedAt: new Date().toISOString(),
    };
  }

  if (context === "automations") {
    const insight =
      reachable > 0
        ? `${reachable} فرصة متابعة متكررة يمكن أتمتتها لتوفير الوقت وعدم تفويت الإيراد.`
        : "أتمتة المتابعة تضمن عدم تفويت أي عميل مهتم دون رد.";
    return {
      context,
      insight,
      recommendation: "فعّل متابعة تلقائية للعملاء الذين أبدوا اهتماماً ثم توقفوا.",
      action: { label: "افتح الأتمتة", href: "/dashboard/automations" },
      generatedAt: new Date().toISOString(),
    };
  }

  // integrations
  const next7 = forecast?.next7Revenue ?? 0;
  const insight =
    next7 > 0
      ? `ربط متجرك ومصادر الطلبات يجعل توقعات الإيراد (${egp(next7)} خلال 7 أيام) أدق.`
      : "اربط قنواتك ومصادر الطلبات لتحصل على رؤى وفرص أدق.";
  return {
    context: "integrations",
    insight,
    recommendation: "تأكد من ربط مصادر الطلبات والقنوات لتغذية محرك الفرص بالبيانات.",
    action: { label: "افتح التكاملات", href: "/dashboard/integrations" },
    generatedAt: new Date().toISOString(),
  };
}

export async function GET(req: Request) {
  const uid = await getUserId();
  if (!uid) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const raw = new URL(req.url).searchParams.get("context") || "dashboard";
  const context: CopilotContext = (CONTEXTS as readonly string[]).includes(raw)
    ? (raw as CopilotContext)
    : "dashboard";

  try {
    let payload: CopilotPayload;
    switch (context) {
      case "revenue":
      case "dashboard":
        payload = await buildRevenueOrDashboard(uid, context);
        break;
      case "customers":
        payload = await buildCustomers(uid);
        break;
      case "orders":
        payload = await buildOrders(uid);
        break;
      case "broadcasts":
      case "automations":
      case "integrations":
        payload = await buildDerived(uid, context);
        break;
      default:
        payload = genericInsight(context);
    }
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Last-resort guard: even if a builder throws past its inner catches, the
    // strip must still render something useful rather than a 500.
    return NextResponse.json(genericInsight(context), { headers: { "Cache-Control": "no-store" } });
  }
}
