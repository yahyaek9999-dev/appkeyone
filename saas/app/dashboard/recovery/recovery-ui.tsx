"use client";

import { useEffect, useState } from "react";
import {
  HeartHandshake,
  RefreshCw,
  Loader2,
  Send,
  CalendarClock,
  X,
  CheckCircle2,
  UserX,
  HelpCircle,
} from "lucide-react";
import { formatCustomerPhone } from "@/lib/phone";

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

const KIND_META: Record<Kind, { label: string; icon: any; color: string }> = {
  lost_customer: { label: "عميل مفقود", icon: UserX, color: "text-rose-400" },
  follow_up_op: { label: "فرصة متابعة", icon: HelpCircle, color: "text-sky-400" },
};

export default function RecoveryUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/recovery", { cache: "no-store" });
      if (!r.ok) throw new Error("فشل تحميل البيانات");
      setData((await r.json()) as Resp);
    } catch (e: any) {
      setError(e?.message || "خطأ غير متوقع");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function removeItem(id: string) {
    setData((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id), count: d.count - 1 } : d));
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HeartHandshake className="w-6 h-6 text-emerald-400" />
            استعادة العملاء
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            عملاء اهتموا ثم اختفوا، سألوا عن السعر ولم يطلبوا، أو غابوا طويلاً. الرسالة جاهزة — أرسلها الآن أو جدولها. كل إرسال يمر عبر نفس نظام الحماية.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm inline-flex items-center gap-2 disabled:opacity-50"
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          تحديث
        </button>
      </div>

      {data && (
        <div className="text-xs text-slate-400">
          {data.count} فرصة استعادة حالياً · آخر تحديث{" "}
          {new Date(data.generatedAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
        </div>
      )}

      {loading && (
        <div className="text-slate-400 text-sm py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline-block me-2" />
          جاري التحميل...
        </div>
      )}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl p-4 text-sm">{error}</div>
      )}

      {!loading && !error && data && data.items.length === 0 && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
          <div className="text-slate-300 font-medium">لا توجد فرص استعادة الآن 🎉</div>
          <div className="text-xs text-slate-500 mt-1">ارجع لاحقاً لمّا تتجمع إشارات جديدة.</div>
        </div>
      )}

      {!loading && data && data.items.length > 0 && (
        <div className="space-y-3">
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
  const [busy, setBusy] = useState<null | "send_now" | "schedule" | "dismiss">(null);
  const [scheduling, setScheduling] = useState(false);
  const [when, setWhen] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const meta = KIND_META[item.kind] || KIND_META.lost_customer;
  const Icon = meta.icon;

  async function act(action: "send_now" | "schedule" | "dismiss") {
    setBusy(action);
    try {
      const payload: any = { action, customerId: item.customerId, kind: item.kind, message };
      if (action === "schedule") {
        if (!when) {
          setBusy(null);
          return;
        }
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
          setDone(action === "schedule" ? "تمت الجدولة ✓" : "تم الإرسال للطابور ✓");
          setTimeout(onResolved, 1400);
        }
      } else {
        alert(j.error || "تعذّر تنفيذ الإجراء");
      }
    } catch {
      alert("خطأ بالشبكة");
    } finally {
      setBusy(null);
    }
  }

  const urgencyTone = item.urgency >= 75 ? "from-rose-500 to-orange-400" : item.urgency >= 55 ? "from-amber-500 to-yellow-400" : "from-sky-500 to-sky-400";
  const p = formatCustomerPhone(item.customerPhone);

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-white flex items-center gap-2">
            <Icon className={`w-4 h-4 ${meta.color}`} />
            {item.title}
          </div>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{item.customerName || "—"}</span>
            <span>·</span>
            {p.isLid ? (
              <span className="text-slate-500 italic" title={p.raw}>{p.display}</span>
            ) : (
              <bdi dir="ltr" className="font-mono">{p.display}</bdi>
            )}
            <span className="text-slate-600">· {meta.label}</span>
          </div>
          <div className="text-xs text-slate-300 mt-1.5">{item.reason}</div>
        </div>
        <div className="shrink-0 text-left">
          <div className="text-[10px] uppercase text-slate-500 tracking-wider">إلحاح</div>
          <div className="flex items-center gap-2 min-w-[110px] mt-0.5">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className={`h-full bg-gradient-to-r ${urgencyTone}`} style={{ width: `${item.urgency}%` }} />
            </div>
            <span className="text-xs font-mono tabular-nums w-8 text-right">{item.urgency}</span>
          </div>
        </div>
      </div>

      {done ? (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm px-3 py-2 inline-flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {done}
        </div>
      ) : (
        <>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:border-brand-500 resize-none"
          />

          {scheduling && (
            <div className="flex items-center gap-2">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm" />
              <button
                onClick={() => act("schedule")}
                disabled={busy !== null || !when}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/30 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
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
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white disabled:opacity-50"
            >
              {busy === "send_now" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              إرسال الآن
            </button>
            <button
              onClick={() => setScheduling((s) => !s)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
            >
              <CalendarClock className="w-3.5 h-3.5" />
              جدولة
            </button>
            <button
              onClick={() => act("dismiss")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-slate-400 disabled:opacity-50"
            >
              {busy === "dismiss" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              تجاهل
            </button>
          </div>
        </>
      )}
    </div>
  );
}
