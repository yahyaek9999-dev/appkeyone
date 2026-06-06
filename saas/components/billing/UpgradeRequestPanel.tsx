"use client";

/**
 * Self-serve upgrade request widget (Phase 4). Lets a logged-in merchant pick a
 * target plan; we record an UpgradeRequest for an admin to activate. Falls back
 * gracefully to the WhatsApp contact flow. Additive — no existing flow changes.
 */

import { useEffect, useState } from "react";
import { Crown, Loader2, Check, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { TIERS } from "@/lib/pricing/catalog";

export default function UpgradeRequestPanel({ locale = "ar" }: { locale?: "ar" | "en" }) {
  const lang = locale === "ar" ? "ar" : "en";
  const { success, error, info } = useToast();
  const [toSlug, setToSlug] = useState("k_pro");
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [current, setCurrent] = useState<{ toSlug: string; status: string } | null>(null);

  async function loadCurrent() {
    try {
      const r = await fetch("/api/upgrade-request", { cache: "no-store" });
      const j = await r.json();
      if (j.request) setCurrent({ toSlug: j.request.toSlug, status: j.request.status });
    } catch {}
  }
  useEffect(() => { loadCurrent(); }, []);

  async function submit() {
    setSubmitting(true);
    try {
      const r = await fetch("/api/upgrade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toSlug, billingCycle: cycle }),
      });
      const j = await r.json();
      if (r.ok) {
        success(locale === "ar" ? "تم إرسال طلب الترقية — سيفعّله فريقنا قريباً." : "Upgrade request sent — our team will activate it shortly.");
        loadCurrent();
      } else if (j.pending || r.status === 503) {
        info(locale === "ar" ? "الميزة جاهزة — تحتاج تفعيل قاعدة البيانات على الخادم." : "Feature ready — needs DB activation on the server.");
      } else {
        error(j.error || (locale === "ar" ? "تعذّر الإرسال" : "Failed to send"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  const sel = "rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

  return (
    <div className="card p-5">
      <h3 className="section-title mb-1 flex items-center gap-2">
        <Crown className="h-4 w-4 text-brand-400" />
        {locale === "ar" ? "ترقية الباقة" : "Upgrade your plan"}
      </h3>
      <p className="page-desc mb-4">
        {locale === "ar"
          ? "اختر الباقة المطلوبة وأرسل الطلب — يفعّله فريقنا فوراً بعد تأكيد الدفع."
          : "Pick a plan and request it — our team activates it after payment confirmation."}
      </p>

      {current && current.status === "pending" && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200">
          <Clock className="h-3.5 w-3.5" />
          {locale === "ar" ? `طلب ترقية معلّق إلى ${current.toSlug}` : `Pending upgrade to ${current.toSlug}`}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="label mb-1">{locale === "ar" ? "الباقة" : "Plan"}</div>
          <select value={toSlug} onChange={(e) => setToSlug(e.target.value)} className={`${sel} w-full`}>
            {TIERS.filter((t) => !t.contactSales).map((t) => (
              <option key={t.slug} value={t.slug} className="bg-canvas">
                {t.name[lang]} — ${t.priceUsdMonthly}/{locale === "ar" ? "شهر" : "mo"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="label mb-1">{locale === "ar" ? "الفوترة" : "Billing"}</div>
          <select value={cycle} onChange={(e) => setCycle(e.target.value as any)} className={sel}>
            <option value="monthly" className="bg-canvas">{locale === "ar" ? "شهري" : "Monthly"}</option>
            <option value="yearly" className="bg-canvas">{locale === "ar" ? "سنوي" : "Yearly"}</option>
          </select>
        </div>
        <button onClick={submit} disabled={submitting} className="btn-primary inline-flex items-center gap-2">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {locale === "ar" ? "إرسال الطلب" : "Request"}
        </button>
      </div>
    </div>
  );
}
