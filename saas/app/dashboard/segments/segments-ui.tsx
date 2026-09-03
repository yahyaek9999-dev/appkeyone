"use client";

// AI Sales OS — Customer Segmentation (premium, mobile responsive).

import { useEffect, useState } from "react";
import {
  Users,
  Loader2,
  Crown,
  Repeat,
  Flame,
  TrendingUp,
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
import { PageHeader, HeaderFact } from "@/components/ui/page-header";

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
  likely_again: <TrendingUp className="h-4 w-4" />,
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
      <PageHeader
        eyebrow="النمو"
        title="شرائح العملاء"
        description="المساعد يصنّف عملاءك تلقائياً حسب سلوكهم وقيمتهم — عشان تعرف تبعت لمين، وبإيه."
        meta={total > 0 ? [<HeaderFact key="t" value={fmtNumber(total)} label="عميل مصنَّف" />] : undefined}
      />

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
        /* Evidence (Phase 11, screenshot 12): this page rendered nine identical
           cards, each wrapping four *more* bordered mini-boxes plus a bordered
           suggestion panel — roughly fifty independent borders competing on one
           screen, with every segment at equal weight regardless of whether it
           held 400 customers or zero. It read as a component demo, not a book
           of business.

           Now: ONE surface, one row per segment, hairline dividers. Rows sort
           by size so the biggest audience leads, the metrics run inline as
           quiet facts instead of nested boxes, and empty segments dim out
           instead of shouting four zeros each. */
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          <div className="hidden grid-cols-[minmax(0,1fr)_92px_110px_92px_150px] items-center gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 lg:grid">
            <span>الشريحة</span>
            <span className="text-center">العملاء</span>
            <span className="text-center">الإيراد</span>
            <span className="text-center">نسبة الشراء</span>
            <span></span>
          </div>

          <div className="divide-y divide-white/[0.04]">
            {[...data]
              .sort((a, b) => b.count - a.count)
              .map((s) => {
                const empty = s.count === 0;
                return (
                  <div key={s.key}>
                    <div
                      className={`grid grid-cols-1 items-center gap-4 px-4 py-3.5 transition-colors lg:grid-cols-[minmax(0,1fr)_92px_110px_92px_150px] ${
                        empty ? "opacity-45" : "hover:bg-white/[0.015]"
                      }`}
                    >
                      {/* Identity + why it matters */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${TONE[s.key]}`}>
                            {ICON[s.key]}
                          </span>
                          <span className="truncate text-[14px] font-semibold text-white">{s.label}</span>
                        </div>
                        <p className="mt-1 line-clamp-1 text-[12px] text-slate-500">{s.description}</p>
                        {!empty && (
                          <p className="mt-1.5 line-clamp-1 text-[12px] text-slate-400">
                            <span className="text-brand-300">الخطوة التالية: </span>
                            {s.suggestedAction}
                          </p>
                        )}
                      </div>

                      {/* Facts — inline, no nested boxes */}
                      <div className="flex items-center gap-4 lg:block lg:text-center">
                        <span className="text-[11px] text-slate-500 lg:hidden">العملاء</span>
                        <span className="text-[15px] font-semibold tabular-nums text-white">{fmtNumber(s.count)}</span>
                      </div>
                      <div className="flex items-center gap-4 lg:block lg:text-center">
                        <span className="text-[11px] text-slate-500 lg:hidden">الإيراد</span>
                        <span className="text-[13px] tabular-nums text-slate-300">{s.revenue ? fmtMoney(s.revenue) : "—"}</span>
                      </div>
                      <div className="flex items-center gap-4 lg:block lg:text-center">
                        <span className="text-[11px] text-slate-500 lg:hidden">نسبة الشراء</span>
                        <span className="text-[13px] tabular-nums text-slate-300">{s.conversionPct}%</span>
                      </div>

                      {/* Next action — primary only where it can actually run */}
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => toggleOpen(s.key)}
                          disabled={empty}
                          aria-expanded={openKey === s.key}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ChevronDown className={`h-3.5 w-3.5 transition ${openKey === s.key ? "rotate-180" : ""}`} />
                          عرض
                        </button>
                        <button
                          onClick={() => setComposeKey(s.key)}
                          disabled={empty}
                          className="btn-primary px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Megaphone className="h-3.5 w-3.5" /> إرسال
                        </button>
                      </div>
                    </div>

                    {openKey === s.key && (
                      <div className="max-h-56 overflow-y-auto border-t border-white/[0.05] bg-black/20 px-4 py-2">
                        {!members[s.key] ? (
                          <div className="flex justify-center py-3 text-slate-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : members[s.key].length === 0 ? (
                          <EmptyState icon={<Users className="h-full w-full" />} title="لا يوجد عملاء" size="sm" />
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
                );
              })}
          </div>
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
            <button onClick={submit} disabled={sending || !text.trim()} className="btn-primary mt-3 w-full px-4 py-2.5 text-sm">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إنشاء الحملة
            </button>
          </>
        )}
      </div>
    </div>
  );
}
