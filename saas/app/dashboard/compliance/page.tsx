/**
 * Compliance + delivery dashboard.
 *
 * All numbers come from real Prisma queries — no mock data. Cards show the
 * last 24 hours so a degraded health signal is immediately visible.
 *
 * Sections:
 *   1. Provider status (QR | Meta Cloud) + quality rating + tier
 *   2. Delivery state — counts per status from WaMessage
 *   3. Compliance — recent blocks/warns/critical from WaComplianceAudit
 *   4. Webhook health — pending vs processed vs dead-lettered from WaWebhookEvent
 *   5. Template registry — APPROVED / PENDING / REJECTED counts
 */

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { metaCloudAllowedForUser } from "@/lib/messaging/feature-flags";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CompliancePage() {
  const user = await requireUser();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const bot = await prisma.bot.findUnique({ where: { userId: user.id } }) as any;
  const mode = normalizeConnectionMode(bot?.connectionMode);
  const eligibility = await metaCloudAllowedForUser(user.id);

  // Delivery state counts — last 24h.
  const [delivered, sent, queued, failed, blocked24h] = await Promise.all([
    (prisma as any).waMessage.count({ where: { userId: user.id, status: "delivered", queuedAt: { gte: since } } }),
    (prisma as any).waMessage.count({ where: { userId: user.id, status: "sent",      queuedAt: { gte: since } } }),
    (prisma as any).waMessage.count({ where: { userId: user.id, status: "queued",    queuedAt: { gte: since } } }),
    (prisma as any).waMessage.count({ where: { userId: user.id, status: "failed",    queuedAt: { gte: since } } }),
    (prisma as any).waComplianceAudit.count({ where: { userId: user.id, action: "blocked", createdAt: { gte: since } } }),
  ]);

  // Webhook health
  const [whPending, whProcessed, whDead] = await Promise.all([
    (prisma as any).waWebhookEvent.count({ where: { userId: user.id, processed: false, attempts: { lt: 5 } } }),
    (prisma as any).waWebhookEvent.count({ where: { userId: user.id, processed: true, receivedAt: { gte: since } } }),
    (prisma as any).waWebhookEvent.count({ where: { userId: user.id, processed: false, attempts: { gte: 5 } } }),
  ]);

  // Template counts
  const tpls = await (prisma as any).waTemplate.findMany({
    where: { userId: user.id },
    select: { status: true },
  });
  const tplCounts = tpls.reduce((acc: any, t: any) => { acc[t.status] = (acc[t.status] || 0) + 1; return acc; }, {});

  // Recent compliance events (latest 10)
  const audits = await (prisma as any).waComplianceAudit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold mb-2">صحة الإرسال والامتثال</h1>
        <p className="text-slate-400 text-sm">كل الأرقام تأتي من قاعدة البيانات مباشرةً. آخر 24 ساعة.</p>
      </div>

      {/* Provider card */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-sm">
            <div className="text-slate-400">وضع الاتصال</div>
            <div className="text-xl font-bold">{mode === "meta_cloud" ? "Meta Cloud API" : "ربط QR Code"}</div>
          </div>
          {mode === "meta_cloud" && (
            <>
              <Stat label="جودة الرقم" value={qualityLabel(bot?.metaQualityRating)} tone={ratingTone(bot?.metaQualityRating)} />
              <Stat label="حد المراسلة" value={bot?.metaMessagingLimit || "—"} />
              <Stat label="حالة التفعيل" value={bot?.metaVerifiedAt ? "مفعّل" : "غير مفعّل"} tone={bot?.metaVerifiedAt ? "ok" : "warn"} />
            </>
          )}
          {mode === "meta_cloud" && !eligibility.allowed && (
            <div className="text-xs text-amber-300">
              ملاحظة: رسائلك تُرسل حالياً عبر QR Code. أكمل إعداد Meta Cloud لتفعيل الإرسال الرسمي.
            </div>
          )}
        </div>
      </div>

      {/* Delivery state */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="مُسلّمة" value={delivered} tone="ok" />
        <Stat label="مُرسلة" value={sent} />
        <Stat label="في الطابور" value={queued} tone={queued > 50 ? "warn" : "ok"} />
        <Stat label="فاشلة" value={failed} tone={failed > 5 ? "danger" : "ok"} />
        <Stat label="رُفضت (الامتثال)" value={blocked24h} tone={blocked24h > 0 ? "warn" : "ok"} />
      </div>

      {/* Webhook health */}
      {mode === "meta_cloud" && (
        <div className="card p-5">
          <h2 className="text-lg font-bold mb-3">صحة استقبال الأحداث</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="بانتظار المعالجة" value={whPending} tone={whPending > 20 ? "warn" : "ok"} />
            <Stat label="معالجة (24س)" value={whProcessed} />
            <Stat label="فشلت نهائيًا" value={whDead} tone={whDead > 0 ? "danger" : "ok"} />
          </div>
        </div>
      )}

      {/* Templates */}
      {mode === "meta_cloud" && (
        <div className="card p-5">
          <h2 className="text-lg font-bold mb-3">القوالب المعتمدة</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="معتمدة" value={tplCounts.APPROVED || 0} tone="ok" />
            <Stat label="قيد المراجعة" value={tplCounts.PENDING || 0} />
            <Stat label="مرفوضة" value={tplCounts.REJECTED || 0} tone={(tplCounts.REJECTED || 0) > 0 ? "warn" : "ok"} />
            <Stat label="معطّلة" value={tplCounts.DISABLED || 0} />
          </div>
        </div>
      )}

      {/* Audit log */}
      <div className="card p-5">
        <h2 className="text-lg font-bold mb-3">آخر أحداث الامتثال</h2>
        {audits.length === 0 ? (
          <EmptyState
            size="sm"
            icon={<ShieldCheck className="h-5 w-5" />}
            title="لا توجد أحداث امتثال"
            description="كل رسائلك متوافقة مع سياسات واتساب. ستظهر هنا أي تنبيهات أو حجوبات مستقبلية."
          />
        ) : (
          <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead className="text-slate-400">
              <tr className="text-right">
                <th className="p-2">التاريخ</th>
                <th className="p-2">الفئة</th>
                <th className="p-2">الإجراء</th>
                <th className="p-2">العنوان</th>
                <th className="p-2">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a: any) => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="p-2 text-slate-500 whitespace-nowrap">{new Date(a.createdAt).toLocaleString("ar-EG")}</td>
                  <td className="p-2">{auditCategoryLabel(a.category)}</td>
                  <td className="p-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] ${a.severity === "critical" ? "bg-rose-500/20 text-rose-300" : a.severity === "block" ? "bg-amber-500/20 text-amber-300" : a.severity === "warn" ? "bg-yellow-500/20 text-yellow-200" : "bg-slate-500/20 text-slate-300"}`}>{auditActionLabel(a.action)}</span>
                  </td>
                  <td className="p-2">{a.title}</td>
                  <td className="p-2 text-slate-400 max-w-md truncate">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ratingTone(rating?: string | null): "ok" | "warn" | "danger" | undefined {
  if (!rating) return undefined;
  if (rating === "GREEN") return "ok";
  if (rating === "YELLOW") return "warn";
  if (rating === "RED") return "danger";
  return undefined;
}

function qualityLabel(q?: string | null): string {
  switch (q) {
    case "GREEN": return "ممتازة";
    case "YELLOW": return "متوسطة";
    case "RED": return "ضعيفة";
    default: return "—";
  }
}

function auditCategoryLabel(c?: string | null): string {
  const map: Record<string, string> = {
    consent: "الموافقة",
    template: "القوالب",
    rate_limit: "حدود الإرسال",
    quality: "الجودة",
    optout: "إلغاء الاشتراك",
    window: "نافذة المراسلة",
    content: "المحتوى",
  };
  return (c && map[c]) || c || "—";
}

function auditActionLabel(a?: string | null): string {
  const map: Record<string, string> = {
    blocked: "محجوب",
    warned: "تحذير",
    allowed: "مسموح",
    critical: "حرج",
    skipped: "تم التخطي",
  };
  return (a && map[a]) || a || "—";
}

function Stat({ label, value, tone }: { label: string; value: any; tone?: "ok" | "warn" | "danger" }) {
  const cls =
    tone === "ok" ? "text-emerald-300" :
    tone === "warn" ? "text-amber-300" :
    tone === "danger" ? "text-rose-300" :
    "text-slate-100";
  return (
    <div className="card p-3 bg-white/5">
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-xl font-bold ${cls}`}>{value}</div>
    </div>
  );
}
