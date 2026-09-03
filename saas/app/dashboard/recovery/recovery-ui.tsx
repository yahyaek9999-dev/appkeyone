"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  Loader2,
  Send,
  CalendarClock,
  X,
  CheckCircle2,
  UserX,
  HelpCircle,
  ArrowUpRight,
  BarChart2,
} from "lucide-react";
import { formatCustomerPhone } from "@/lib/phone";
import { useToast } from "@/components/ui/toast";
import { EmptyState } from "@/components/ui/empty-state";

interface Outcomes {
  sentLast30: number;
  repliedWithin7d: number;
  orderedWithin7d: number;
  replyRate: number;
  orderRate: number;
}

type Kind = "lost_customer" | "follow_up_op";

interface RecItem {
  id: string;
  kind: Kind;
  customerId: string;
  customerName: string | null;
  customerPhone: string;
  urgency: number;
  title: string;
  reason: string;
  suggestedMessage: string;
  daysSinceLastMsg?: number;
}

interface Resp {
  generatedAt: string;
  count: number;
  items: RecItem[];
}

const KIND_META: Record<Kind, { label: string; icon: any; dot: string; border: string }> = {
  lost_customer: {
    label: "عميل مفقود",
    icon: UserX,
    dot: "bg-rose-500",
    border: "border-rose-500/25",
  },
  follow_up_op: {
    label: "فرصة متابعة",
    icon: HelpCircle,
    dot: "bg-sky-500",
    border: "border-sky-500/20",
  },
};

// Urgency → simple label
function urgencyLabel(u: number): { text: string; cls: string } {
  if (u >= 75) return { text: "عاجل", cls: "text-rose-300 bg-rose-500/10 border-rose-500/25" };
  if (u >= 55) return { text: "متوسط", cls: "text-amber-300 bg-amber-500/10 border-amber-500/25" };
  return { text: "منخفض", cls: "text-slate-400 bg-white/[0.04] border-white/[0.08]" };
}

export default function RecoveryUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [outcomes, setOutcomes] = useState<Outcomes | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [r, o] = await Promise.all([
        fetch("/api/recovery", { cache: "no-store" }),
        fetch("/api/recovery/outcomes", { cache: "no-store" }),
      ]);
      if (!r.ok) throw new Error("فشل تحميل البيانات");
      setData((await r.json()) as Resp);
      if (o.ok) setOutcomes((await o.json()) as Outcomes);
    } catch (e: any) {
      setError(e?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  function removeItem(id: string) {
    setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id), count: d.count - 1 } : d));
  }

  // Group by priority
  const urgent = data?.items.filter((i) => i.urgency >= 75) || [];
  const medium = data?.items.filter((i) => i.urgency >= 55 && i.urgency < 75) || [];
  const low = data?.items.filter((i) => i.urgency < 55) || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-5">
        <div>
          <h1 className="page-title">استعادة العملاء</h1>
          <p className="page-desc mt-1">
            {data
              ? data.count > 0
                ? `${data.count} فرصة استعادة — الرسائل جاهزة للإرسال`
                : "لا توجد فرص استعادة الآن"
              : "فرص استعادة العملاء المفقودين"}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[12px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          تحديث
        </button>
      </div>

      {/* Recovery outcomes — 30-day attribution band */}
      {outcomes && outcomes.sentLast30 > 0 && (
        <div className="overflow-hidden rounded-xl border border-white/[0.07]">
          <div className="flex items-center gap-2 border-b border-white/[0.05] px-4 py-2.5">
            <BarChart2 className="h-3.5 w-3.5 text-slate-600" />
            <span className="text-[11px] font-medium text-slate-500">نتائج آخر 30 يوم</span>
            <span className="mr-auto text-[10px] text-slate-600">نافذة الإسناد: 7 أيام بعد الإرسال</span>
          </div>
          <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/[0.05]">
            <div className="px-4 py-3 text-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">أُرسلت</div>
              <div className="mt-1.5 text-2xl font-bold tabular-nums text-white">{outcomes.sentLast30}</div>
              <div className="text-[10px] text-slate-600">رسالة استعادة</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">استجاب</div>
              <div className={`mt-1.5 text-2xl font-bold tabular-nums ${outcomes.repliedWithin7d > 0 ? "text-brand-300" : "text-slate-600"}`}>
                {outcomes.replyRate}%
              </div>
              <div className="text-[10px] text-slate-600">{outcomes.repliedWithin7d} عميل</div>
            </div>
            <div className="px-4 py-3 text-center">
              <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">طلب بعدها</div>
              <div className={`mt-1.5 text-2xl font-bold tabular-nums ${outcomes.orderedWithin7d > 0 ? "text-emerald-400" : "text-slate-600"}`}>
                {outcomes.orderRate}%
              </div>
              <div className="text-[10px] text-slate-600">{outcomes.orderedWithin7d} طلب</div>
            </div>
          </div>
        </div>
      )}

      {/* Priority summary band */}
      {data && data.count > 0 && (
        <div className="grid grid-cols-3 divide-x divide-x-reverse divide-white/[0.05] overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">عاجل</div>
            <div className={`mt-1.5 text-2xl font-bold tabular-nums ${urgent.length > 0 ? "text-rose-400" : "text-slate-600"}`}>{urgent.length}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">متوسط</div>
            <div className={`mt-1.5 text-2xl font-bold tabular-nums ${medium.length > 0 ? "text-amber-400" : "text-slate-600"}`}>{medium.length}</div>
          </div>
          <div className="px-4 py-3 text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-600">منخفض</div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums text-slate-500">{low.length}</div>
          </div>
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="text-slate-400 text-sm py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline-block me-2" />
          جاري التحميل...
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 p-4 text-sm">{error}</div>
      )}

      {!loading && !error && data && data.items.length === 0 && (
        <EmptyState
          variant="page"
          tone="clear"
          icon={<CheckCircle2 className="h-full w-full" />}
          title="مفيش عميل محتاج استعادة دلوقتي"
          description="المساعد بيراقب مين وقف فجأة بعد ما كان بيسأل، ومين اتأخر عن معاده المعتاد. أول ما يرصد إشارة، بيحطّه هنا ومعاه سبب الترشيح ورسالة جاهزة."
          hint="الإشارات بتتجمع مع الوقت — كل ما محادثاتك تزيد، الترشيحات تبقى أدق."
          steps={[
            { title: "توقّف مفاجئ", body: "كان يسأل بانتظام ثم صمت فترة أطول من معتاده." },
            { title: "سلة متروكة", body: "وصل لمرحلة الطلب ولم يكملها." },
            { title: "تأخّر عن دورته", body: "عميل متكرر تجاوز الفترة التي يشتري فيها عادةً." },
          ]}
        />
      )}

      {/* Recovery queue */}
      {!loading && data && data.items.length > 0 && (
        <div className="space-y-2">
          {data.items.map((it) => (
            <RecoveryCard key={it.id} item={it} onResolved={() => removeItem(it.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecoveryCard({ item, onResolved }: { item: RecItem; onResolved: () => void }) {
  const [message, setMessage] = useState(item.suggestedMessage);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<null | "send_now" | "schedule" | "dismiss">(null);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const meta = KIND_META[item.kind] || KIND_META.lost_customer;
  const Icon = meta.icon;
  const urg = urgencyLabel(item.urgency);
  const { error } = useToast();
  const p = formatCustomerPhone(item.customerPhone);

  async function act(action: "send_now" | "schedule" | "dismiss") {
    setBusy(action);
    try {
      const payload: any = { action, customerId: item.customerId, kind: item.kind, message };
      if (action === "schedule") {
        if (!when) { setBusy(null); return; }
        payload.scheduledAt = new Date(when).toISOString();
      }
      const r = await fetch("/api/recovery/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (r.ok) {
        if (action === "dismiss") {
          onResolved();
        } else {
          setDone(action === "schedule" ? "تمت الجدولة ✓" : "أُرسل للطابور ✓");
          setTimeout(onResolved, 1400);
        }
      } else {
        error(j.error || "تعذّر تنفيذ الإجراء");
      }
    } catch {
      error("خطأ بالشبكة");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`overflow-hidden rounded-xl border ${item.urgency >= 75 ? "border-rose-500/25" : "border-white/[0.07]"} bg-white/[0.015]`}>
      {/* Summary row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Kind dot */}
        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />

        {/* Identity + signal */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/dashboard/customers/${item.customerId}`}
              className="text-[13px] font-semibold text-white hover:text-brand-300 transition-colors"
            >
              {item.customerName || "—"}
            </Link>
            <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${urg.cls}`}>
              {urg.text}
            </span>
            <span className="rounded-md border border-white/[0.07] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-slate-500">
              {meta.label}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500 truncate">{item.reason}</div>
        </div>

        {/* Customer phone (small) */}
        {!p.isLid && (
          <bdi dir="ltr" className="shrink-0 text-[11px] font-mono text-slate-600">{p.display}</bdi>
        )}

        {/* View customer */}
        <Link
          href={`/dashboard/inbox?c=${item.customerId}`}
          className="shrink-0 inline-flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          المحادثة <ArrowUpRight className="h-3 w-3" />
        </Link>

        {/* Expand/collapse message */}
        <button
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 py-1 text-[11px] text-slate-400 hover:text-white transition-colors"
        >
          {expanded ? "طيّ" : "إرسال"}
        </button>
      </div>

      {/* Expandable message + actions */}
      {expanded && (
        <div className="border-t border-white/[0.04] px-4 py-3 space-y-3">
          {done ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm px-3 py-2 inline-flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> {done}
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-[13px] text-slate-200 focus:outline-none focus:border-brand-400 resize-none"
              />

              {scheduling && (
                <div className="flex items-center gap-2">
                  <input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-sm text-white"
                  />
                  <button
                    onClick={() => act("schedule")}
                    disabled={busy !== null || !when}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 disabled:opacity-50"
                  >
                    {busy === "schedule" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    تأكيد الجدولة
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => act("send_now")}
                  disabled={busy !== null || !message.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                >
                  {busy === "send_now" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  إرسال الآن
                </button>
                <button
                  onClick={() => setScheduling((s) => !s)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-slate-200 hover:bg-white/[0.06]"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  جدولة
                </button>
                <button
                  onClick={() => act("dismiss")}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] px-3 py-2 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50"
                >
                  {busy === "dismiss" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                  تجاهل
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
