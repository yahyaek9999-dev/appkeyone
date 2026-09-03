"use client";

import { useState } from "react";
import { Download, Users, ShoppingBag, Megaphone, MessageSquare, FileText, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";

const EXPORTS = [
  {
    type: "customers",
    label: "العملاء",
    desc: "الاسم، الهاتف، درجة العميل، التاجز، تاريخ الإضافة",
    icon: Users,
    color: "text-blue-400",
    border: "border-blue-500/20",
    bg: "bg-blue-500/[0.06]",
  },
  {
    type: "orders",
    label: "الطلبات",
    desc: "رقم الطلب، العميل، الحالة، الإجمالي، طريقة الدفع، كود الشحن",
    icon: ShoppingBag,
    color: "text-brand-400",
    border: "border-brand-500/20",
    bg: "bg-brand-500/[0.06]",
  },
  {
    type: "broadcasts",
    label: "الحملات الجماعية",
    desc: "عنوان الحملة، الجمهور، الحالة، عدد المُرسَل",
    icon: Megaphone,
    color: "text-gold-400",
    border: "border-gold-500/20",
    bg: "bg-gold-500/[0.06]",
  },
  {
    type: "conversations",
    label: "المحادثات",
    desc: "كل الرسائل مع العميل، الدور، النية، المشاعر",
    icon: MessageSquare,
    color: "text-emerald-400",
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.06]",
  },
] as const;

type ExportType = (typeof EXPORTS)[number]["type"];

export function ExportUi({
  counts,
}: {
  counts: { customers: number; orders: number; broadcasts: number; conversations: number };
}) {
  const [downloading, setDownloading] = useState<ExportType | null>(null);
  const { error } = useToast();

  async function doExport(type: ExportType) {
    setDownloading(type);
    try {
      const res = await fetch(`/api/export?type=${type}&format=csv`);
      if (!res.ok) { error("فشل التصدير"); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match ? match[1] : `keyone_${type}_export.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(null);
    }
  }

  const countFor = (type: ExportType) => counts[type];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border-b border-white/[0.05] pb-5">
        <p className="eyebrow mb-2">البيانات</p>
        <h1 className="page-title">مركز التصدير</h1>
        <p className="page-desc mt-2">
          خذ بياناتك معك في أي وقت — ملفات CSV بترميز UTF-8 تفتح مباشرةً في Excel وجداول Google
          بنص عربي سليم.
        </p>
      </div>

      {/* Evidence (Phase 11, screenshot 57): four tinted cards, each with its
          own icon tile and a full-width emerald button, three of them reading
          "لا توجد بيانات" — four loud, identical CTAs for a job that is really
          one short list of "how many rows do I have, and can I take them?".
          Rendered as a table: the record count is the deciding fact, so it
          leads, and the action stays quiet until it can actually run. */}
      <div className="overflow-hidden rounded-xl border border-white/[0.07]">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_150px] items-center gap-4 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500 sm:grid">
          <span>البيانات</span>
          <span className="text-center">السجلات</span>
          <span></span>
        </div>
        <div className="divide-y divide-white/[0.04]">
          {EXPORTS.map(({ type, label, desc, icon: Icon, color }) => {
            const count = countFor(type);
            const busy = downloading === type;
            const empty = count === 0;
            return (
              <div
                key={type}
                className={`grid grid-cols-1 items-center gap-3 px-4 py-3.5 transition-colors sm:grid-cols-[minmax(0,1fr)_110px_150px] ${
                  empty ? "opacity-50" : "hover:bg-white/[0.015]"
                }`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-white">{label}</div>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:block sm:text-center">
                  <span className="text-[11px] text-slate-500 sm:hidden">السجلات</span>
                  <span className="text-[15px] font-semibold tabular-nums text-white">
                    {count.toLocaleString("ar-EG")}
                  </span>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => doExport(type)}
                    disabled={busy || empty}
                    className="btn-ghost h-8 justify-center px-3 text-[12px] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    {busy ? "جارٍ التصدير…" : empty ? "لا بيانات" : "تصدير CSV"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-4 text-sm text-slate-400 space-y-1.5">
        <div className="font-semibold text-slate-300 mb-2">ملاحظات التصدير</div>
        <div>• الحد الأقصى للتصدير: 10,000 عميل · 10,000 طلب · 5,000 حملة · 50,000 رسالة</div>
        <div>• البيانات مرتبة من الأحدث إلى الأقدم</div>
        <div>• صيغة التاريخ: ISO 8601 (UTC)</div>
        <div>• الملفات لا تُحفظ على خوادمنا — تُنزَّل مباشرة</div>
      </div>
    </div>
  );
}
