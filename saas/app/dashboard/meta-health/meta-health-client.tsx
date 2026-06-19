"use client";
import { useState } from "react";
import Link from "next/link";
import HealthHero from "@/components/ui/health-hero";

const QUALITY: Record<string, string> = { GREEN: "ممتازة", YELLOW: "متوسطة", RED: "ضعيفة" };

function fmt(d?: string | null) { if (!d) return "—"; try { return new Date(d).toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" }); } catch { return "—"; } }

function Stat({ label, value, good }: { label: string; value: string; good?: boolean | null }) {
  return (
    <div className="card p-4">
      <div className="text-slate-400 text-xs mb-1">{label}</div>
      <div className={`text-sm font-bold ${good === true ? "text-emerald-300" : good === false ? "text-rose-300" : ""}`}>{value}</div>
    </div>
  );
}

export default function MetaHealthClient({ data, issues }: { data: any; issues: any[] }) {
  const [verifying, setVerifying] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);

  async function testNow() {
    setVerifying(true); setRes(null);
    try {
      const r = await fetch("/api/settings/meta-cloud/verify", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (j?.ok) setRes({ ok: true, text: `✓ الاتصال يعمل — الجودة: ${j.quality ? (QUALITY[j.quality] ?? j.quality) : "—"}` });
      else setRes({ ok: false, text: j?.message || j?.detail || "فشل التحقّق." });
      setTimeout(() => window.location.reload(), 900);
    } catch { setRes({ ok: false, text: "تعذّر الاتصال بالخادم." }); }
    finally { setVerifying(false); }
  }

  if (data.mode !== "meta_cloud") {
    return (
      <div className="card p-6 max-w-2xl">
        <p className="text-sm text-slate-400">أنت تستخدم وضع الربط بـ QR وليس Meta Cloud. لمراقبة Meta Cloud، فعّل الوضع الرسمي من <Link href="/dashboard/settings/meta-cloud" className="text-brand-300 underline">إعدادات Meta Cloud</Link>.</p>
      </div>
    );
  }

  // ---- Health 2.0 score from configuration + quality + verification ----
  let score = 100;
  const recs: string[] = [], warns: string[] = [];
  if (!data.hasToken) { score -= 30; warns.push("لا يوجد رمز وصول (Token) محفوظ — الإرسال عبر Meta لن يعمل."); recs.push("أدخل رمز الوصول من إعدادات Meta Cloud."); }
  if (!data.connected) { score -= 40; if (data.configured) { warns.push("لم يُتحقَّق من الاتصال بعد."); recs.push("شغّل «اختبار الاتصال الآن» للتأكد من صحة البيانات."); } }
  if (!data.hasWebhookToken) { score -= 15; recs.push("اضبط رمز التحقق للويبهوك لاستقبال تحديثات الحالة من Meta."); }
  if (data.qualityRating === "RED") { score -= 35; warns.push("جودة الرقم ضعيفة (RED) — خطر تقييد الإرسال."); recs.push("قلّل الرسائل غير المرغوبة وحسّن جودة المحتوى لرفع التقييم."); }
  else if (data.qualityRating === "YELLOW") { score -= 15; recs.push("جودة الرقم متوسطة — راقبها وتجنّب الرسائل المزعجة."); }
  const ageDays = data.verifiedAt ? Math.floor((Date.now() - new Date(data.verifiedAt).getTime()) / 86400000) : null;
  if (ageDays !== null && ageDays > 50) recs.push(`آخر تحقق ناجح قبل ${ageDays} يومًا — قد يقترب التوكن من الانتهاء (~٦٠ يومًا)، جدّده.`);
  for (const i of issues.filter((x) => x.severity === "critical").slice(0, 2)) warns.push(i.title);
  score = Math.max(0, Math.min(100, score));
  const trend = issues.some((i) => i.severity === "critical") ? "down" : data.connected ? "up" : "flat";
  const trendLabel = issues.some((i) => i.severity === "critical") ? "تنبيهات حرجة" : data.connected ? "متصل" : "بانتظار التحقق";
  const summary = `الحالة: ${data.connected ? "متصل" : data.configured ? "غير مُتحقَّق" : "غير مُهيّأ"} · جودة الرقم: ${data.qualityRating ? (QUALITY[data.qualityRating] ?? data.qualityRating) : "—"} · آخر تحقق: ${fmt(data.verifiedAt)}.`;

  return (
    <div className="space-y-4 max-w-3xl">
      <HealthHero
        title="صحة اتصال Meta Cloud"
        score={score}
        summary={summary}
        trend={trend as any}
        trendLabel={trendLabel}
        warnings={warns}
        recommendations={recs}
        actions={<>
          <button onClick={testNow} disabled={verifying} className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-400 disabled:opacity-50">{verifying ? "جاري الاختبار..." : "🔌 اختبار الاتصال الآن"}</button>
          <Link href="/dashboard/settings/meta-cloud" className="rounded-lg bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10">إعادة الربط / تدوير التوكن</Link>
        </>}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="الحالة" value={data.connected ? "متصل" : data.configured ? "غير مُتحقَّق" : "غير مُهيّأ"} good={data.connected ? true : data.configured ? null : false} />
        <Stat label="رمز الوصول (Token)" value={data.hasToken ? "محفوظ" : "غير مُدخل"} good={data.hasToken} />
        <Stat label="الويبهوك (Webhook)" value={data.hasWebhookToken ? "مُهيّأ" : "غير مُهيّأ"} good={data.hasWebhookToken} />
        <Stat label="جودة الرقم" value={data.qualityRating ? (QUALITY[data.qualityRating] ?? data.qualityRating) : "—"} good={data.qualityRating === "GREEN" ? true : data.qualityRating === "RED" ? false : null} />
        <Stat label="حد المراسلة" value={data.messagingLimit || "—"} />
        <Stat label="آخر تحقق ناجح" value={fmt(data.verifiedAt)} good={data.verifiedAt ? true : null} />
      </div>

      <div className="card p-4 flex flex-wrap items-center gap-3">
        <button onClick={testNow} disabled={verifying} className="rounded bg-brand-500/15 text-brand-300 px-4 py-2 text-sm disabled:opacity-50">{verifying ? "جاري الاختبار..." : "🔌 اختبار الاتصال الآن"}</button>
        <Link href="/dashboard/settings/meta-cloud" className="rounded bg-white/5 px-4 py-2 text-sm hover:bg-white/10">إعادة الربط / تدوير التوكن</Link>
        {res && <span className={res.ok ? "text-emerald-300 text-sm" : "text-rose-300 text-sm"}>{res.text}</span>}
      </div>
      <p className="text-xs text-slate-500">ملاحظة: توكنات Meta طويلة الأجل تنتهي عادة بعد ~٦٠ يومًا. شغّل «اختبار الاتصال» دوريًا؛ إذا فشل، أعد إدخال التوكن من صفحة الإعدادات.</p>

      <div className="card p-5">
        <h2 className="font-bold mb-2 text-sm">آخر التنبيهات</h2>
        {issues.length === 0 ? <p className="text-slate-500 text-sm">لا توجد تنبيهات. ✓</p> : (
          <ul className="space-y-1 text-xs">
            {issues.map((i, n) => (
              <li key={n} className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${i.severity === "critical" ? "bg-rose-400" : i.severity === "warn" ? "bg-amber-400" : "bg-slate-400"}`} />
                <span className="text-slate-300">{i.title}</span>
                <span className="text-slate-600">{fmt(i.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
