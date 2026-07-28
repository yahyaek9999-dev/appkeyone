"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Brain,
  Flame,
  UserX,
  Gift,
  HelpCircle,
  MessageSquare,
  Copy,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCustomerPhone } from "@/lib/phone";

type Kind = "lost_customer" | "upsell" | "hot_lead" | "follow_up_op";

interface IntelItem {
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
  leadScore?: number;
  conversionScore?: number;
  hesitationScore?: number;
  insightLabel?: string;
  lastIntent?: string | null;
  orderId?: string;
  orderTotal?: number;
}

interface Resp {
  generatedAt: string;
  counts: Record<Kind, number>;
  items: Record<Kind, IntelItem[]>;
}

const TABS: { key: Kind; label: string; icon: any; color: string }[] = [
  {
    key: "hot_lead",
    label: "عملاء ساخنين",
    icon: Flame,
    color: "text-orange-400",
  },
  {
    key: "follow_up_op",
    label: "متابعة فرص",
    icon: HelpCircle,
    color: "text-sky-400",
  },
  {
    key: "lost_customer",
    label: "عملاء مفقودين",
    icon: UserX,
    color: "text-rose-400",
  },
  {
    key: "upsell",
    label: "فرص بيع إضافي",
    icon: Gift,
    color: "text-emerald-400",
  },
];

export default function IntelUi() {
  const [data, setData] = useState<Resp | null>(null);
  const [active, setActive] = useState<Kind>("hot_lead");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/intel", { cache: "no-store" });
      if (!r.ok) throw new Error("فشل تحميل البيانات");
      const j = (await r.json()) as Resp;
      setData(j);
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

  const items = data?.items[active] || [];
  const total = useMemo(
    () => (data ? Object.values(data.counts).reduce((a, b) => a + b, 0) : 0),
    [data],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-teal-400" />
            ذكاء المبيعات
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            اقتراحات يومية مبنية على محادثاتك وطلباتك. الرسائل جاهزة للنسخ — أنت
            اللي تقرر تبعت ولا لأ.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm inline-flex items-center gap-2 disabled:opacity-50"
          title="تحديث"
        >
          {refreshing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          تحديث
        </button>
      </div>

      {/* Counts summary */}
      {data && (
        <div className="text-xs text-slate-400">
          إجمالي {total} اقتراح حالياً · آخر تحديث{" "}
          {new Date(data.generatedAt).toLocaleTimeString("ar-EG", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const n = data?.counts[t.key] ?? 0;
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm border transition ${
                isActive
                  ? "bg-white/10 border-white/20 text-white"
                  : "bg-white/[0.02] border-white/10 text-slate-300 hover:bg-white/5"
              }`}
            >
              <Icon className={`w-4 h-4 ${t.color}`} />
              <span>{t.label}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                  n > 0 ? "bg-white/10" : "bg-white/[0.03] text-slate-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      {loading && (
        <div className="text-slate-400 text-sm py-12 text-center">
          <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
          جاري التحميل...
        </div>
      )}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-200 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <EmptyState
            icon={<Brain className="h-full w-full" />}
            title="لا توجد اقتراحات في هذه الفئة الآن"
            description="جرّب تاب آخر — أو ارجع بعد ساعات لمّا تتجمع إشارات جديدة."
            size="md"
          />
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="space-y-3">
          {items.map((it) => (
            <IntelCard key={it.id} item={it} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-slate-300">
      {children}
    </span>
  );
}

function IntelCard({ item }: { item: IntelItem }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(item.suggestedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const urgencyTone =
    item.urgency >= 75
      ? "from-rose-500 to-orange-400"
      : item.urgency >= 55
        ? "from-amber-500 to-yellow-400"
        : "from-sky-500 to-sky-400";

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-white">{item.title}</div>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1 flex-wrap">
            <span>{item.customerName || "—"}</span>
            <span>·</span>
            {(() => {
              const p = formatCustomerPhone(item.customerPhone);
              return p.isLid ? (
                <span className="text-slate-500 italic" title={p.raw}>
                  {p.display}
                </span>
              ) : (
                <bdi dir="ltr" className="font-mono">
                  {p.display}
                </bdi>
              );
            })()}
          </div>
          <div className="text-xs text-slate-300 mt-1.5">{item.reason}</div>
          {(item.insightLabel ||
            item.conversionScore ||
            item.hesitationScore) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {item.insightLabel && <Chip>{item.insightLabel}</Chip>}
              {!!item.conversionScore && (
                <Chip>تحويل {item.conversionScore}%</Chip>
              )}
              {!!item.hesitationScore && item.hesitationScore >= 50 && (
                <Chip>تردد {item.hesitationScore}%</Chip>
              )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-left">
          <div className="text-[10px] uppercase text-slate-500 tracking-wider">
            إلحاح
          </div>
          <div className="flex items-center gap-2 min-w-[110px] mt-0.5">
            <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r ${urgencyTone}`}
                style={{ width: `${item.urgency}%` }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums w-8 text-right">
              {item.urgency}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-sm text-slate-200 whitespace-pre-wrap">
        {item.suggestedMessage}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={copy}
          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition ${
            copied
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : "bg-brand-500 hover:bg-brand-600 text-white border border-transparent"
          }`}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? "تم النسخ" : "نسخ الرسالة"}
        </button>
        <Link
          href={`/dashboard/inbox?c=${item.customerId}`}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          فتح المحادثة
        </Link>
        {item.orderId && (
          <Link
            href={`/dashboard/orders/${item.orderId}`}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-white/5 border border-white/10 hover:bg-white/10 text-slate-200"
          >
            عرض الطلب
          </Link>
        )}
      </div>
    </div>
  );
}
