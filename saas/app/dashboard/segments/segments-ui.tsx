"use client";

// AI Sales OS — Customer Segmentation (premium, mobile responsive).

import { useEffect, useState } from "react";
import {
  Users,
  Loader2,
  Crown,
  Repeat,
  Flame,
  Sparkles,
  ShoppingCart,
  Tag,
  AlertTriangle,
  Snowflake,
  Ghost,
  Megaphone,
  ChevronDown,
  Send,
  X,
  Phone,
} from "lucide-react";
import { formatCustomerPhone } from "@/lib/phone";
import { fmtNumber, fmtMoney, timeAgo as taAgo } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

type Segment = {
  key: string;
  label: string;
  description: string;
  count: number;
  revenue: number;
  aov: number;
  lastActivity: string | null;
  conversionPct: number;
  suggestedAction: string;
};

const ICON: Record<string, React.ReactNode> = {
  vip: <Crown className="h-4 w-4" />,
  repeat_buyers: <Repeat className="h-4 w-4" />,
  high_intent: <Flame className="h-4 w-4" />,
  likely_again: <Sparkles className="h-4 w-4" />,
  abandoned_cart: <ShoppingCart className="h-4 w-4" />,
  discount_hunters: <Tag className="h-4 w-4" />,
  at_risk: <AlertTriangle className="h-4 w-4" />,
  cold_leads: <Snowflake className="h-4 w-4" />,
  ghost_customers: <Ghost className="h-4 w-4" />,
};

const TONE: Record<string, string> = {
  vip: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  repeat_buyers: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  high_intent: "border-orange-500/30 bg-orange-500/10 text-orange-300",
  likely_again: "border-teal-500/30 bg-teal-500/10 text-teal-300",
  abandoned_cart: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  discount_hunters: "border-gold-500/30 bg-gold-500/10 text-gold-300",
  at_risk: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  cold_leads: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  ghost_customers: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

export default function SegmentsUi() {
  const [data, setData] = useState<Segment[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [members, setMembers] = useState<Record<string, { id: string; name: string | null; phone: string }[]>>({});
  const [composeKey, setComposeKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/segments", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j?.error) {
          setData(j.segments || []);
          setTotal(j.totalCustomers || 0);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleOpen(key: string) {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    if (!members[key]) {
      const r = await fetch(`/api/segments?key=${key}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      setMembers((m) => ({ ...m, [key]: j.members || [] }));
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Users className="h-6 w-6 text-gold-400" />
          شرائح العملاء الذكية
        </h1>
        <p className="page-desc mt-1">
          تجميع تلقائي لعملائك إلى شرائح قابلة للتنفيذ — {fmtNumber(total)} عميل
        </p>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin" />
        </div>
      ) : !data ? (
        <div className="card p-10 text-center space-y-3">
          <Users className="h-8 w-8 mx-auto text-slate-600" />
          <div className="text-sm text-slate-400">تعذّر تحميل شرائح العملاء.</div>
          <button onClick={() => { setLoading(true); fetch("/api/segments", { cache: "no-store" }).then(r => r.json()).then(j => { if (!j?.error) { setData(j.segments || []); setTotal(j.totalCustomers || 0); } }).finally(() => setLoading(false)); }} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10">
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <div key={s.key} className="card-hover flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold ${TONE[s.key]}`}>
                  {ICON[s.key]}
                  {s.label}
                </div>
                <div className="text-2xl font-black text-white">{fmtNumber(s.count)}</div>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{s.description}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                <Mini label="الإيراد" value={fmtMoney(s.revenue)} />
                <Mini label="متوسط الطلب" value={s.aov ? fmtMoney(s.aov) : "—"} />
                <Mini label="نسبة الشراء" value={`${s.conversionPct}%`} />
                <Mini label="آخر نشاط" value={s.lastActivity ? taAgo(s.lastActivity) : "—"} />
              </div>

              <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 text-[11px] text-slate-300">
                <span className="text-brand-300">إجراء مقترح: </span>
                {s.suggestedAction}
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => toggleOpen(s.key)}
                  disabled={s.count === 0}
                  className="ai-btn ai-btn-ghost flex-1 px-3 py-2 text-xs disabled:opacity-40"
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition ${openKey === s.key ? "rotate-180" : ""}`} />
                  عرض
                </button>
                <button
                  onClick={() => setComposeKey(s.key)}
                  disabled={s.count === 0}
                  className="ai-btn ai-btn-primary flex-1 px-3 py-2 text-xs disabled:opacity-40"
                >
                  <Megaphone className="h-3.5 w-3.5" /> إرسال
                </button>
              </div>

              {openKey === s.key && (
                <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/20 p-2">
                  {!members[s.key] ? (
                    <div className="flex justify-center py-3 text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : members[s.key].length === 0 ? (
                    <EmptyState
                      icon={<Users className="h-full w-full" />}
                      title="لا يوجد عملاء"
                      size="sm"
                    />
                  ) : (
                    members[s.key].map((m) => {
                      const p = formatCustomerPhone(m.phone);
                      return (
                        <div key={m.id} className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 last:border-0">
                          <span className="truncate text-xs text-slate-200">{m.name || "بدون اسم"}</span>
                          <bdi dir="ltr" className="shrink-0 text-[10px] text-slate-500">
                            {p.display}
                          </bdi>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {composeKey && (
        <SegmentBroadcastModal
          segment={data?.find((s) => s.key === composeKey) || null}
          onClose={() => setComposeKey(null)}
        />
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] p-1.5">
      <div className="truncate text-xs font-bold text-white" title={value}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function SegmentBroadcastModal({ segment, onClose }: { segment: Segment | null; onClose: () => void }) {
  const [title, setTitle] = useState(segment ? `حملة: ${segment.label}` : "حملة");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!segment) return null;

  async function submit() {
    if (!text.trim()) return;
    setSending(true);
    setErr(null);
    try {
      const r = await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, template: text.trim(), audience: `segment:${segment!.key}` }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setDone(`تم إنشاء الحملة (${j.total ?? segment!.count} مستلم) عبر الطابور الآمن ✓`);
      } else {
        setErr(j.error || "تعذّر إنشاء الحملة");
      }
    } catch {
      setErr("خطأ بالشبكة");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="section-title flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-brand-400" /> إرسال إلى: {segment.label}
          </h3>
          <button onClick={onClose} className="rounded-lg border border-white/10 p-1 text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        {done ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">{done}</div>
        ) : (
          <>
            <p className="mb-3 text-xs text-slate-500">
              <Users className="mb-0.5 inline h-3 w-3" /> {fmtNumber(segment.count)} عميل · ترسل عبر نفس نظام البث المحمي
            </p>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="input mb-2 px-3 py-2 text-sm" placeholder="عنوان الحملة" />
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="نص الرسالة... استخدم {name} لاسم العميل"
              className="input min-h-[110px] w-full resize-none p-3 text-sm"
            />
            {err && <div className="mt-2 text-xs text-rose-300">{err}</div>}
            <button onClick={submit} disabled={sending || !text.trim()} className="ai-btn ai-btn-primary mt-3 w-full px-4 py-2.5 text-sm">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إنشاء الحملة
            </button>
          </>
        )}
      </div>
    </div>
  );
}
