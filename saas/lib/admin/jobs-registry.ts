// Admin Jobs/Cron registry — the REAL background jobs this platform runs.
//
// Source of truth: the two systemd timers on the production host
// (deploy/cron/run-qr-crons.sh @ every 60s, deploy/cron/run-hourly-crons.sh
// @ every 3600s). Each entry maps 1:1 to a real POST /api/cron/<endpoint>
// route guarded by x-internal-secret. This module fabricates NOTHING — it does
// not invent run history, durations, or results. Per-run history is not
// persisted by the current cron design, so the Jobs Center surfaces the real
// registry + real schedule + a real manual "Run now" trigger, and reports the
// result of that manual run only.
//
// Additive: no schema change, no new dependency.

export type CronCadence = "minutely" | "hourly";

export type CronJob = {
  /** The /api/cron/<endpoint> segment — also the stable id. */
  endpoint: string;
  /** Human label (Arabic). */
  label: string;
  /** What it does, one line. */
  description: string;
  cadence: CronCadence;
  /** Which systemd timer drives it. */
  timer: string;
};

// ── Minutely timer (run-qr-crons.sh, OnUnitActiveSec=60) ─────────────────────
const MINUTELY: CronJob[] = [
  { endpoint: "qr-queue", label: "طابور جلسات QR", description: "معالجة مهام ربط جلسات واتساب المجدولة.", cadence: "minutely", timer: "keyone-qrcron.timer" },
  { endpoint: "qr-scheduler", label: "مجدول QR", description: "جدولة فتحات ربط الجلسات القادمة.", cadence: "minutely", timer: "keyone-qrcron.timer" },
  { endpoint: "outgoing-messages", label: "الرسائل الصادرة", description: "تفريغ طابور الرسائل الصادرة إلى واتساب.", cadence: "minutely", timer: "keyone-qrcron.timer" },
  { endpoint: "broadcasts", label: "الحملات", description: "إرسال دفعات الحملات المجدولة.", cadence: "minutely", timer: "keyone-qrcron.timer" },
  { endpoint: "payments-reconcile", label: "تسوية المدفوعات", description: "مطابقة المدفوعات مع المحافظ والاشتراكات.", cadence: "minutely", timer: "keyone-qrcron.timer" },
];

// ── Hourly timer (run-hourly-crons.sh, OnUnitActiveSec=3600) ─────────────────
const HOURLY: CronJob[] = [
  { endpoint: "trial-expiry", label: "انتهاء التجارب", description: "تحويل التجارب المنتهية إلى منتهية.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "abandoned-cart", label: "السلات المتروكة", description: "متابعة العملاء الذين تركوا الطلب.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "daily-report", label: "التقرير اليومي", description: "توليد ملخص الأداء اليومي للتجار.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "automations", label: "الأتمتة", description: "تشغيل قواعد الأتمتة المستحقّة.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "follow-ups", label: "المتابعات", description: "إرسال رسائل المتابعة للمحادثات الخاملة.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "meta", label: "مزامنة Meta", description: "مزامنة حالة Meta Cloud.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "meta-webhook-processor", label: "معالج Webhook", description: "معالجة أحداث Meta المُخزّنة.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "meta-quality-monitor", label: "مراقبة جودة Meta", description: "متابعة تقييم جودة أرقام Meta.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "meta-template-sync", label: "مزامنة القوالب", description: "مزامنة قوالب رسائل Meta.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "catalog-sync", label: "مزامنة الكتالوج", description: "مزامنة كتالوج المنتجات.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "product-affinity", label: "تقارب المنتجات", description: "حساب اقتراحات المنتجات المرتبطة.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "provider-maintenance", label: "صيانة المزوّدين", description: "تنظيف وصيانة مزوّدي الذكاء.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "incident-scan", label: "فحص الحوادث", description: "الكشف الآلي عن الحوادث الجديدة.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "llm-prewarm", label: "تسخين النماذج", description: "تهيئة نماذج LLM لتقليل زمن أول رد.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "brain-learning", label: "تعلّم Brain", description: "تحديث قاعدة معرفة Brain من المحادثات.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "credits-monthly", label: "أرصدة شهرية", description: "تجديد الأرصدة الشهرية للاشتراكات.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "brain-credits-monthly", label: "أرصدة Brain الشهرية", description: "تجديد أرصدة Brain الشهرية.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "meta-cost", label: "تكلفة Meta", description: "تجميع تكاليف محادثات Meta.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
  { endpoint: "ai-catalog-guard", label: "حارس الكتالوج", description: "التحقق من سلامة بيانات الكتالوج للذكاء.", cadence: "hourly", timer: "keyone-hourlycron.timer" },
];

/** The full, real cron registry. Order: minutely first, then hourly. */
export const CRON_JOBS: CronJob[] = [...MINUTELY, ...HOURLY];

/** Set of valid endpoints — used to validate the manual "Run now" trigger. */
export const CRON_ENDPOINTS = new Set(CRON_JOBS.map((j) => j.endpoint));

export function cadenceLabel(c: CronCadence): string {
  return c === "minutely" ? "كل دقيقة" : "كل ساعة";
}
