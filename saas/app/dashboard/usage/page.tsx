/**
 * Business dashboard: plan + usage view.
 *
 * Shows:
 *   - Current plan tier + name + status
 *   - WhatsApp connection mode + status
 *   - Meta Cloud configuration state
 *   - Live usage counters (msgs / ai / broadcasts) with progress bars
 *   - Warnings when within 10% of any cap
 *   - Reset date
 *
 * All data is real — pulled from getUsageSnapshot() and the Bot row directly.
 */

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getUsageSnapshot } from "@/lib/membership/limits";
import { tierBadge } from "@/lib/membership/plan";
import { normalizeConnectionMode } from "@/lib/messaging/mode";
import { AlertTriangle, MessageSquare, Sparkles, Megaphone, Crown, ShieldAlert } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const user = await requireUser();
  const [snapshot, bot] = await Promise.all([
    getUsageSnapshot(user.id),
    prisma.bot.findUnique({
      where: { userId: user.id },
      select: {
        whatsappStatus: true,
        whatsappPhone: true,
        connectionMode: true,
        metaPhoneNumberId: true,
        metaQualityRating: true,
        metaVerifiedAt: true,
      } as any,
    }) as any,
  ]);

  const { plan, counters, resetAt } = snapshot;
  const badge = tierBadge(plan.tier);
  const mode = normalizeConnectionMode(bot?.connectionMode);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title mb-1">استخدام الباقة</h1>
          <p className="page-desc">حالة باقتك الفعلية وقيود الاستخدام لهذا الشهر.</p>
        </div>
        <Link href="/pricing" className="btn-primary">
          <Crown className="h-4 w-4" /> ترقية الباقة
        </Link>
      </div>

      {plan.blocked && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/8 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <div className="font-semibold text-rose-300">الحساب معلّق</div>
            <div className="mt-0.5 text-slate-400">السبب: {plan.reason}. تواصل مع الدعم لإعادة التفعيل.</div>
          </div>
        </div>
      )}

      {/* Plan banner */}
      <div className="card p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={`rounded-lg px-3 py-1 text-sm font-bold ${badge.color}`}>{badge.label}</span>
          <div>
            <div className="font-bold">{plan.planName}</div>
            <div className="text-xs text-slate-400">
              {plan.isFallback ? "بدون اشتراك نشط" : `يتجدد العداد: ${resetAt.toLocaleDateString("ar-EG")}`}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Pill label="Meta Access" value={plan.metaAccess} tone={plan.metaAccess === "full" ? "ok" : plan.metaAccess === "limited" ? "warn" : "muted"} />
          <Pill label="Analytics" value={plan.analyticsAccess} />
          <Pill label="WA Sessions" value={String(plan.whatsappSessions)} />
          <Pill label="Priority" value={String(plan.queuePriority)} />
        </div>
      </div>

      {/* Connection state */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="kpi-label">حالة واتساب</div>
          <div className="kpi-value mb-1">{mode === "meta_cloud" ? "Meta Cloud API" : "QR (whatsapp-web.js)"}</div>
          <div className="text-sm text-slate-400">{bot?.whatsappStatus || "—"} {bot?.whatsappPhone ? `· ${bot.whatsappPhone}` : ""}</div>
        </div>
        <div className="card p-5">
          <div className="kpi-label">Meta Cloud</div>
          {bot?.metaPhoneNumberId ? (
            <>
              <div className="kpi-value mb-1">
                {bot.metaVerifiedAt ? "مفعّل" : "قيد التفعيل"}
              </div>
              <div className="text-sm text-slate-400">
                Quality: <b className={
                  bot.metaQualityRating === "GREEN" ? "text-emerald-300" :
                  bot.metaQualityRating === "YELLOW" ? "text-amber-300" :
                  bot.metaQualityRating === "RED" ? "text-rose-300" : "text-slate-400"
                }>{bot.metaQualityRating || "—"}</b>
              </div>
            </>
          ) : (
            <>
              <div className="kpi-value mb-1 text-slate-500">غير مهيّأ</div>
              <Link href="/dashboard/settings/meta-cloud" className="text-sm text-brand-300 hover:underline">إعداد Meta Cloud →</Link>
            </>
          )}
        </div>
      </div>

      {/* Usage counters */}
      <div className="space-y-3">
        <h2 className="section-title">عدّادات هذا الشهر</h2>
        <Counter
          icon={<MessageSquare className="w-5 h-5" />}
          label="الرسائل"
          used={counters.messages.used}
          cap={counters.messages.cap}
        />
        <Counter
          icon={<Sparkles className="w-5 h-5" />}
          label="طلبات الذكاء الاصطناعي"
          used={counters.ai.used}
          cap={counters.ai.cap}
        />
        <Counter
          icon={<Megaphone className="w-5 h-5" />}
          label="حملات البث (Broadcasts)"
          used={counters.broadcast.used}
          cap={counters.broadcast.cap}
          disabled={plan.featureFlags?.broadcasts === false}
        />
      </div>

      {/* Feature flags */}
      <div className="card p-5">
        <h2 className="section-title mb-3">الميزات المتاحة في باقتك</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.keys(plan.featureFlags).length === 0
            ? <span className="text-slate-500">لا توجد ميزات إضافية مفعّلة</span>
            : Object.entries(plan.featureFlags).filter(([_, v]) => v).map(([k]) => (
                <span key={k} className="px-2 py-1 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                  ✓ {k}
                </span>
              ))
          }
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" | "muted" }) {
  const cls = tone === "ok" ? "bg-emerald-500/10 text-emerald-300" : tone === "warn" ? "bg-amber-500/10 text-amber-300" : tone === "muted" ? "bg-slate-500/10 text-slate-400" : "bg-white/5 text-slate-300";
  return (
    <div className={`px-3 py-1 rounded ${cls}`}>
      <span className="opacity-70">{label}: </span><b>{value}</b>
    </div>
  );
}

function Counter({ icon, label, used, cap, disabled }: { icon: React.ReactNode; label: string; used: number; cap: number; disabled?: boolean }) {
  const unlimited = cap === 0;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / cap) * 100));
  const near = !unlimited && pct >= 90;
  const exhausted = !unlimited && used >= cap;
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${disabled ? "bg-slate-500/10 text-slate-500" : "bg-brand-500/10 text-brand-300"}`}>
            {icon}
          </div>
          <div>
            <div className="font-bold text-sm">{label}</div>
            <div className="text-xs text-slate-400">
              {disabled ? <span className="text-rose-300">غير مفعّل في باقتك</span> :
                unlimited ? "غير محدود" :
                `${used.toLocaleString()} / ${cap.toLocaleString()}`}
            </div>
          </div>
        </div>
        {!disabled && !unlimited && (
          <span className={`text-sm font-bold ${exhausted ? "text-rose-300" : near ? "text-amber-300" : "text-slate-300"}`}>
            {pct}%
          </span>
        )}
      </div>
      {!disabled && !unlimited && (
        <div className="h-2 bg-white/5 rounded overflow-hidden">
          <div
            className={`h-full transition-all ${exhausted ? "bg-rose-500" : near ? "bg-amber-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {near && !exhausted && (
        <div className="text-xs text-amber-300 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> اقتربت من الحد الأقصى
        </div>
      )}
      {exhausted && (
        <div className="text-xs text-rose-300 mt-2 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> استنفدت الحد — قم بالترقية لزيادة الاستخدام
        </div>
      )}
    </div>
  );
}
