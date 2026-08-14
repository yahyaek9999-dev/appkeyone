"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, Save, Phone, Wifi, WifiOff, Clock, Bot, Users, Bell, Info } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/toast";

interface Props {
  number: {
    id: string;
    displayName: string;
    phone: string;
    connectionMethod: string;
    status: string;
    isPrimary: boolean;
  };
  settings: {
    businessName: string;
    greetingMessage: string;
    awayMessage: string;
    workingHours: string;
    timezone: string;
    defaultLanguage: string;
    botEnabled: boolean;
    routingStrategy: string;
    defaultTeam: string | null;
    notifyOnOrders: boolean;
    notifyOnShipping: boolean;
    notifyOnOtp: boolean;
    maxConcurrentConvs: number;
  } | null;
}

type TabId = "identity" | "messages" | "hours" | "bot" | "routing" | "notifications";

const TABS: { id: TabId; label: string; icon: typeof Phone }[] = [
  { id: "identity", label: "هوية الرقم", icon: Phone },
  { id: "messages", label: "رسائل تلقائية", icon: Info },
  { id: "bot", label: "البوت", icon: Bot },
  { id: "routing", label: "التوجيه", icon: Users },
  { id: "notifications", label: "الإشعارات", icon: Bell },
];

export function NumberDetailClient({ number, settings }: Props) {
  const router = useRouter();
  const { success: toastSuccess, error: toastError } = useToast();
  const [tab, setTab] = useState<TabId>("identity");
  const [saving, setSaving] = useState(false);

  const s = settings;
  const [displayName, setDisplayName] = useState(number.displayName);
  const [businessName, setBusinessName] = useState(s?.businessName ?? "");
  const [greeting, setGreeting] = useState(s?.greetingMessage ?? "");
  const [away, setAway] = useState(s?.awayMessage ?? "");
  const [botEnabled, setBotEnabled] = useState(s?.botEnabled ?? true);
  const [strategy, setStrategy] = useState(s?.routingStrategy ?? "round_robin");
  const [defaultTeam, setDefaultTeam] = useState(s?.defaultTeam ?? "");
  const [notifyOrders, setNotifyOrders] = useState(s?.notifyOnOrders ?? true);
  const [notifyShipping, setNotifyShipping] = useState(s?.notifyOnShipping ?? true);
  const [notifyOtp, setNotifyOtp] = useState(s?.notifyOnOtp ?? false);

  async function save() {
    setSaving(true);
    try {
      const [numRes, settRes] = await Promise.all([
        fetch(`/api/numbers/${number.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName }),
        }),
        fetch(`/api/numbers/${number.id}/settings`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            businessName,
            greetingMessage: greeting,
            awayMessage: away,
            botEnabled,
            routingStrategy: strategy,
            defaultTeam: defaultTeam || null,
            notifyOnOrders: notifyOrders,
            notifyOnShipping: notifyShipping,
            notifyOnOtp: notifyOtp,
          }),
        }),
      ]);
      if (!numRes.ok || !settRes.ok) throw new Error("save failed");
      toastSuccess("تم حفظ الإعدادات");
      router.refresh();
    } catch {
      toastError("حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  }

  const statusCfg = number.status === "active"
    ? { label: "متصل", cls: "text-emerald-400", Icon: Wifi }
    : { label: "غير متصل", cls: "text-slate-400", Icon: WifiOff };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-white/[0.05] pb-5">
        <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
          <Link href="/dashboard/settings/numbers" className="flex items-center gap-1 hover:text-slate-300">
            <ChevronLeft className="h-3.5 w-3.5" />
            أرقام واتساب
          </Link>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="page-title mb-1">{number.displayName}</h1>
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{number.phone || "لم يُضَف الرقم"}</span>
              <span className={`flex items-center gap-1 text-sm ${statusCfg.cls}`}>
                <statusCfg.Icon className="h-3.5 w-3.5" />
                {statusCfg.label}
              </span>
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/[0.05]">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-b-2 border-brand-400 text-brand-300"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-4">
        {tab === "identity" && (
          <>
            <Field label="الاسم المعروض">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input w-full"
                placeholder="مثال: دعم العملاء"
              />
            </Field>
            <Field label="اسم النشاط التجاري">
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="input w-full"
                placeholder="مثال: متجر الأناقة"
              />
            </Field>
            <Field label="طريقة الاتصال">
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm text-slate-300">
                {number.connectionMethod === "bridge" ? "KEYONE Bridge (الجسر المثبت على الجهاز)" : "Meta Cloud API"}
              </div>
            </Field>
          </>
        )}

        {tab === "messages" && (
          <>
            <Field label="رسالة الترحيب" hint="تُرسل عند أول تواصل من عميل جديد">
              <textarea
                value={greeting}
                onChange={(e) => setGreeting(e.target.value)}
                className="input w-full resize-none"
                rows={3}
                placeholder="مرحباً بك! كيف يمكنني مساعدتك؟"
              />
            </Field>
            <Field label="رسالة الغياب" hint="تُرسل خارج ساعات العمل">
              <textarea
                value={away}
                onChange={(e) => setAway(e.target.value)}
                className="input w-full resize-none"
                rows={3}
                placeholder="شكراً لتواصلك. سنرد عليك خلال ساعات العمل."
              />
            </Field>
          </>
        )}

        {tab === "bot" && (
          <>
            <Field label="تفعيل البوت">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={botEnabled}
                  onChange={(e) => setBotEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-white/20 bg-white/5 text-brand-500"
                />
                <span className="text-sm text-slate-300">
                  {botEnabled ? "البوت مفعّل لهذا الرقم" : "البوت معطّل لهذا الرقم"}
                </span>
              </label>
            </Field>
            <p className="text-sm text-slate-500">
              لإدارة تدفقات البوت، اذهب إلى{" "}
              <Link href="/dashboard/bot-builder" className="text-brand-400 underline">
                منشئ المحادثات
              </Link>
            </p>
          </>
        )}

        {tab === "routing" && (
          <>
            <Field label="استراتيجية التعيين">
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                className="input w-full"
              >
                <option value="round_robin">توزيع دوري (Round Robin)</option>
                <option value="least_loaded">الأقل تحميلاً</option>
                <option value="manual">يدوي</option>
              </select>
            </Field>
            <Field label="الفريق الافتراضي" hint="اسم الفريق أو القسم لهذا الرقم">
              <input
                value={defaultTeam}
                onChange={(e) => setDefaultTeam(e.target.value)}
                className="input w-full"
                placeholder="مثال: الدعم الفني"
              />
            </Field>
          </>
        )}

        {tab === "notifications" && (
          <>
            <p className="text-sm text-slate-400">اختر الإشعارات التي تُرسل تلقائياً عبر هذا الرقم:</p>
            <ToggleField label="تأكيد الطلبات" checked={notifyOrders} onChange={setNotifyOrders} />
            <ToggleField label="تحديثات الشحن" checked={notifyShipping} onChange={setNotifyShipping} />
            <ToggleField label="رسائل OTP" checked={notifyOtp} onChange={setNotifyOtp} />
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-200">{label}</label>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-white/20 bg-white/5 text-brand-500"
      />
    </label>
  );
}
