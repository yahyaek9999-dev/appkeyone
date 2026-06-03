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
    color: "text-purple-400",
    border: "border-purple-500/20",
    bg: "bg-purple-500/[0.06]",
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
      <div>
        <h1 className="page-title mb-1">مركز التصدير</h1>
        <p className="page-desc">صدّر بياناتك بصيغة CSV — متوافق مع Excel وجداول Google.</p>
      </div>

      <div className="card p-4 border-sky-500/20 bg-sky-500/[0.04] flex items-start gap-3">
        <FileText className="h-4 w-4 shrink-0 text-sky-400 mt-0.5" />
        <p className="text-sm text-sky-200/80">
          الملفات تُصدَّر بصيغة <b>CSV</b> مع ترميز UTF-8 BOM لضمان ظهور النص العربي بشكل صحيح في Excel.
          يمكنك فتحها مباشرة في Excel أو Google Sheets.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {EXPORTS.map(({ type, label, desc, icon: Icon, color, border, bg }) => {
          const count = countFor(type);
          const busy = downloading === type;
          return (
            <div key={type} className={`card p-5 ${border} ${bg}`}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06]`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div>
                    <div className="font-semibold text-white">{label}</div>
                    <div className="text-[11px] text-slate-500">{count.toLocaleString("ar-EG")} سجل</div>
                  </div>
                </div>
              </div>
              <p className="mb-4 text-xs text-slate-400 leading-relaxed">{desc}</p>
              <button
                onClick={() => doExport(type)}
                disabled={busy || count === 0}
                className="btn-primary w-full justify-center text-sm disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {busy ? "جارٍ التصدير..." : count === 0 ? "لا توجد بيانات" : `تصدير ${label} (CSV)`}
              </button>
            </div>
          );
        })}
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
