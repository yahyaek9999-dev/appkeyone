// Testing Arena 2.0 — AI Agent Auditor.
//
// Deterministic, rule-based audit of a tenant's AI setup (NO LLM, no external
// keys). Reads the tenant's real configuration — assistant prompt, knowledge
// base, conflicts/gaps, quick replies, catalog, business profile, escalation —
// and returns scored, actionable issues. Pure function of current state, so two
// runs on unchanged data return the identical result.
import { prisma } from "@/lib/db";

export type Severity = "critical" | "high" | "medium" | "low";

export interface AuditIssue {
  area: string; // prompts | brain | conflicts | automations | catalog | profile | escalation | whatsapp
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  href?: string; // where the merchant fixes it
}

export interface AuditResult {
  score: number; // 0-100
  counts: { critical: number; high: number; medium: number; low: number; total: number };
  issues: AuditIssue[];
  checkedAt: string;
}

const WEIGHT: Record<Severity, number> = { critical: 30, high: 15, medium: 7, low: 3 };
const DEFAULT_PROMPT_PREFIX = "أنت مساعد المبيعات الرسمي للشركة";

/** Pure analysis — computes the issue list from current tenant state. */
export async function computeAudit(userId: string): Promise<AuditResult> {
  const bot = await prisma.bot.findUnique({ where: { userId } });
  const botId = bot?.id;
  const [docs, gaps, conflicts, quickReplies, products, profile] = await Promise.all([
    prisma.document.count({ where: { userId } }),
    (prisma as any).knowledgeGap.count({ where: { userId, resolved: false } }).catch(() => 0),
    (prisma as any).knowledgeConflict.count({ where: { userId, resolved: false } }).catch(() => 0),
    botId ? prisma.quickReply.count({ where: { botId } }) : Promise.resolve(0),
    prisma.product.count({ where: { userId } }),
    (prisma as any).businessProfile.findUnique({ where: { userId } }).catch(() => null),
  ]);

  const issues: AuditIssue[] = [];
  const add = (i: AuditIssue) => issues.push(i);

  // --- Prompts / assistant ---
  if (!bot) {
    add({
      area: "prompts",
      severity: "critical",
      title: "لا يوجد مساعد ذكي مُهيّأ",
      detail: "لم يتم إنشاء مساعد ذكي لهذا الحساب بعد.",
      fix: "أنشئ المساعد الذكي من صفحة المساعد.",
      href: "/dashboard/bot",
    });
  } else {
    const sp = (bot.systemPrompt || "").trim();
    if (sp.length < 40) {
      add({
        area: "prompts",
        severity: "high",
        title: "برومبت المساعد ضعيف",
        detail: "برومبت النظام قصير جداً وقد يؤدي لإجابات غير دقيقة.",
        fix: "اكتب برومبت أوضح يشرح نبرة الردود وحدود المعرفة.",
        href: "/dashboard/bot",
      });
    } else if (sp.startsWith(DEFAULT_PROMPT_PREFIX)) {
      add({
        area: "prompts",
        severity: "low",
        title: "برومبت افتراضي غير مُخصّص",
        detail: "ما زلت تستخدم البرومبت الافتراضي دون تخصيص لنشاطك.",
        fix: "خصّص البرومبت بمعلومات نشاطك ونبرتك.",
        href: "/dashboard/bot",
      });
    }
    if ((bot as any).whatsappStatus && (bot as any).whatsappStatus !== "connected") {
      add({
        area: "whatsapp",
        severity: "medium",
        title: "واتساب غير متصل",
        detail: "المساعد لن يستقبل أو يرد على رسائل واتساب وهو غير متصل.",
        fix: "اربط رقم واتساب من صفحة التكاملات.",
        href: "/dashboard/integrations",
      });
    }
    if (!(bot as any).escalationEmailEnabled && !(bot as any).escalationAutoPause) {
      add({
        area: "escalation",
        severity: "low",
        title: "لا توجد قناة تصعيد",
        detail: "لا يوجد تنبيه بريد ولا إيقاف تلقائي عند الحالات الصعبة.",
        fix: "فعّل التصعيد التلقائي أو تنبيه البريد.",
        href: "/dashboard/safety",
      });
    }
  }

  // --- Knowledge brain ---
  if (docs === 0) {
    add({
      area: "brain",
      severity: "high",
      title: "لا توجد مستندات معرفية",
      detail: "المساعد بلا قاعدة معرفة، وسيعجز عن الإجابة بدقة.",
      fix: "ارفع مستندات أو أسئلة شائعة في عقل المعرفة.",
      href: "/dashboard/knowledge",
    });
  } else if (docs < 3) {
    add({
      area: "brain",
      severity: "medium",
      title: "معرفة محدودة",
      detail: `يوجد ${docs} مستند فقط — تغطية المعرفة ضعيفة.`,
      fix: "أضف مزيداً من المستندات لتغطية أسئلة العملاء.",
      href: "/dashboard/knowledge",
    });
  }
  if (conflicts > 0) {
    add({
      area: "conflicts",
      severity: "high",
      title: "تعارضات معرفة غير محلولة",
      detail: `${conflicts} تعارض في الأسعار بين الكتالوج والمصادر.`,
      fix: "راجع وحُلّ التعارضات من صفحة تعارضات المعرفة.",
      href: "/dashboard/knowledge/conflicts",
    });
  }
  if (gaps > 5) {
    add({
      area: "brain",
      severity: "medium",
      title: "فجوات معرفية متكررة",
      detail: `${gaps} سؤال بدون إجابة في قاعدة المعرفة.`,
      fix: "أجب على الفجوات المتكررة لتقليل التصعيد.",
      href: "/dashboard/knowledge",
    });
  }

  // --- Automations / quick replies ---
  if (bot && quickReplies === 0) {
    add({
      area: "automations",
      severity: "medium",
      title: "لا توجد ردود سريعة",
      detail: "لا توجد ردود جاهزة للأسئلة المتكررة.",
      fix: "أضف ردوداً سريعة لتسريع الإجابات الشائعة.",
      href: "/dashboard/bot",
    });
  }

  // --- Catalog ---
  if (products === 0) {
    add({
      area: "catalog",
      severity: "medium",
      title: "الكتالوج فارغ",
      detail: "لا توجد منتجات — المساعد لن يعرض أسعاراً أو منتجات.",
      fix: "أضف منتجاتك في صفحة المنتجات.",
      href: "/dashboard/products",
    });
  }

  // --- Business profile ---
  const profileMissing =
    !profile || (!profile.companyName && !profile.businessType && !profile.industry);
  if (profileMissing) {
    add({
      area: "profile",
      severity: "medium",
      title: "ملف النشاط غير مكتمل",
      detail: "بيانات النشاط ناقصة، ما يضعف جودة ردود المساعد.",
      fix: "أكمل ملف النشاط من الإعدادات.",
      href: "/dashboard/settings/business-profile",
    });
  }

  const counts = {
    critical: issues.filter((i) => i.severity === "critical").length,
    high: issues.filter((i) => i.severity === "high").length,
    medium: issues.filter((i) => i.severity === "medium").length,
    low: issues.filter((i) => i.severity === "low").length,
    total: issues.length,
  };
  const deduction = issues.reduce((s, i) => s + WEIGHT[i.severity], 0);
  const score = Math.max(0, 100 - deduction);
  const order: Severity[] = ["critical", "high", "medium", "low"];
  issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return { score, counts, issues, checkedAt: new Date().toISOString() };
}

/** Run an audit AND persist a normalized AiAuditRun row (history). */
export async function runAudit(userId: string): Promise<AuditResult & { runId: string }> {
  const r = await computeAudit(userId);
  const run = await prisma.aiAuditRun.create({
    data: { userId, score: r.score, ...r.counts },
  });
  return { ...r, runId: run.id };
}
