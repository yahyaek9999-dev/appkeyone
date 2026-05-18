"use client";
import { useState } from "react";
import { Save, CheckCircle, Sparkles, ShoppingCart, User, MessageSquare, Bell, Zap } from "lucide-react";

const PERSONAS = [
  { id: "ودود ومحترف", label: "ودود ومحترف", desc: "مناسب لمعظم الشركات" },
  { id: "رسمي وحازم", label: "رسمي وحازم", desc: "للقطاع القانوني/المالي" },
  { id: "مرح ولطيف", label: "مرح ولطيف", desc: "لمتاجر الموضة والترفيه" },
  { id: "خبير تقني", label: "خبير تقني", desc: "للشركات التقنية" },
];

type Tab = "identity" | "instructions" | "humanize" | "sales" | "performance" | "alerts";

export default function BotForm({ initial, userPhone }: { initial: any; userPhone: string }) {
  const [tab, setTab] = useState<Tab>("identity");
  const [data, setData] = useState({
    name: initial.name || "",
    persona: initial.persona || "ودود ومحترف",
    systemPrompt: initial.systemPrompt || "",
    welcomeMessage: initial.welcomeMessage || "",
    notifyPhone: initial.notifyPhone || "",
    orderKeywords: initial.orderKeywords || "",
    humanizeReplies: !!initial.humanizeReplies,
    typingSpeedCps: initial.typingSpeedCps ?? 25,
    preReplyDelayMs: initial.preReplyDelayMs ?? 800,
    dynamicEmojis: initial.dynamicEmojis !== false,
    replyVariations: initial.replyVariations !== false,
    persuasionEnabled: initial.persuasionEnabled !== false,
    negotiationEnabled: !!initial.negotiationEnabled,
    negotiationFloorPct: initial.negotiationFloorPct ?? 10,
    cacheEnabled: initial.cacheEnabled !== false,
    cacheTtlHours: initial.cacheTtlHours ?? 24,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function update<K extends keyof typeof data>(k: K, v: any) {
    setData((d) => ({ ...d, [k]: v }));
  }

  async function save() {
    setSaving(true); setSaved(false);
    const res = await fetch("/api/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: "identity", label: "الهوية", icon: User },
    { id: "instructions", label: "التعليمات", icon: MessageSquare },
    { id: "humanize", label: "المحاكاة البشرية", icon: Sparkles },
    { id: "sales", label: "البيع والتفاوض", icon: ShoppingCart },
    { id: "performance", label: "الأداء", icon: Zap },
    { id: "alerts", label: "إشعارات الأوردر", icon: Bell },
  ];

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-white/10 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-sm border inline-flex items-center gap-1.5 transition ${
                active
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                  : "bg-white/5 text-slate-300 border-white/10 hover:bg-white/10"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* IDENTITY */}
      {tab === "identity" && (
        <div className="card p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">اسم البوت</label>
              <input
                className="input"
                value={data.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="المساعد الذكي"
              />
            </div>
            <div>
              <label className="label">الشخصية</label>
              <select
                className="input"
                value={data.persona}
                onChange={(e) => update("persona", e.target.value)}
              >
                {PERSONAS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="label">رسالة الترحيب (تُرسل لأول مرة فقط لكل عميل جديد)</label>
            <textarea
              className="input min-h-[80px]"
              value={data.welcomeMessage}
              onChange={(e) => update("welcomeMessage", e.target.value)}
              placeholder="أهلاً بك! كيف يمكنني مساعدتك؟"
            />
          </div>
        </div>
      )}

      {/* INSTRUCTIONS */}
      {tab === "instructions" && (
        <div className="card p-6 space-y-2">
          <h2 className="font-bold text-lg">التعليمات (System Prompt)</h2>
          <p className="text-sm text-slate-400 mb-3">قواعد سلوك البوت. خلي التعليمات واضحة عشان يلتزم.</p>
          <textarea
            className="input min-h-[220px] font-mono text-sm leading-relaxed"
            value={data.systemPrompt}
            onChange={(e) => update("systemPrompt", e.target.value)}
          />
        </div>
      )}

      {/* HUMANIZE */}
      {tab === "humanize" && (
        <div className="space-y-4">
          <div className={`card p-6 border-2 transition ${data.humanizeReplies ? "border-cyan-500/40" : "border-white/10"}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.humanizeReplies}
                onChange={(e) => update("humanizeReplies", e.target.checked)}
                className="mt-1 w-5 h-5 accent-cyan-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-lg">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  محاكاة الموظف البشري
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  يجعل ردود البوت تبدو طبيعية مثل موظف حقيقي: تأخير الكتابة المتغير، تنويع البدايات، إيموجي بسياق مناسب.
                </p>
              </div>
            </label>
          </div>

          {data.humanizeReplies && (
            <div className="card p-6 space-y-5">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label !mb-0">سرعة الكتابة (حرف/ثانية)</label>
                  <span className="text-sm font-mono text-cyan-300">{data.typingSpeedCps}</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={60}
                  value={data.typingSpeedCps}
                  onChange={(e) => update("typingSpeedCps", parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                  <span>بطيء (يوحي باهتمام أكثر)</span>
                  <span>سريع (محترف)</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label !mb-0">تأخير القراءة قبل البدء (ms)</label>
                  <span className="text-sm font-mono text-cyan-300">{data.preReplyDelayMs}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2500}
                  step={100}
                  value={data.preReplyDelayMs}
                  onChange={(e) => update("preReplyDelayMs", parseInt(e.target.value))}
                  className="w-full accent-cyan-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  وقت الانتظار قبل ظهور "يكتب الآن..." (يحاكي قراءة الموظف للرسالة).
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.dynamicEmojis}
                  onChange={(e) => update("dynamicEmojis", e.target.checked)}
                  className="mt-1 w-4 h-4 accent-cyan-500"
                />
                <div className="flex-1">
                  <div className="font-medium">إيموجي ديناميكي</div>
                  <p className="text-xs text-slate-400">
                    أضف إيموجي واحد مناسب للسياق في نهاية بعض الردود (يقرأها كموظف ودود).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={data.replyVariations}
                  onChange={(e) => update("replyVariations", e.target.checked)}
                  className="mt-1 w-4 h-4 accent-cyan-500"
                />
                <div className="flex-1">
                  <div className="font-medium">تنويع أساليب الرد</div>
                  <p className="text-xs text-slate-400">
                    يرفع درجة الإبداع قليلاً + يستبدل البدايات المكررة بصيغ متنوعة (تمام، ماشي، حاضر…).
                  </p>
                </div>
              </label>
            </div>
          )}
        </div>
      )}

      {/* SALES */}
      {tab === "sales" && (
        <div className="space-y-4">
          <div className="card p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.persuasionEnabled}
                onChange={(e) => update("persuasionEnabled", e.target.checked)}
                className="mt-1 w-5 h-5 accent-emerald-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-lg">
                  <ShoppingCart className="w-5 h-5 text-emerald-400" />
                  مساعد الإقناع البيعي
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  لما يلاحظ نية شراء عند العميل، يثبّت قراره ويقترح خطوة عملية واحدة (دون مبالغة).
                </p>
              </div>
            </label>
          </div>

          <div className={`card p-6 border-2 ${data.negotiationEnabled ? "border-amber-500/40" : "border-white/10"}`}>
            <label className="flex items-start gap-3 cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={data.negotiationEnabled}
                onChange={(e) => update("negotiationEnabled", e.target.checked)}
                className="mt-1 w-5 h-5 accent-amber-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-lg">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  التفاوض الذكي على الأسعار
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  يسمح للبوت بالتلميح إلى مرونة في السعر ضمن حد أقصى تحدّده. لن يذكر النسبة صراحة.
                </p>
              </div>
            </label>

            {data.negotiationEnabled && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label !mb-0">الحد الأقصى للخصم المسموح به (%)</label>
                  <span className="text-sm font-mono text-amber-300">{data.negotiationFloorPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={30}
                  value={data.negotiationFloorPct}
                  onChange={(e) => update("negotiationFloorPct", parseInt(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <p className="text-xs text-slate-500 mt-1">
                  لو طلب العميل خصماً أكبر، سيعتذر بلطف ويوجّهه للإدارة.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PERFORMANCE — caching for identical questions */}
      {tab === "performance" && (
        <div className="space-y-4">
          <div className={`card p-6 border-2 transition ${data.cacheEnabled ? "border-yellow-500/40" : "border-white/10"}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={data.cacheEnabled}
                onChange={(e) => update("cacheEnabled", e.target.checked)}
                className="mt-1 w-5 h-5 accent-yellow-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2 font-bold text-lg">
                  <Zap className="w-5 h-5 text-yellow-400" />
                  تخزين الردود المتكررة مؤقتاً
                </div>
                <p className="text-sm text-slate-400 mt-1">
                  لو عميل سأل نفس السؤال حرفياً، البوت يرجع ردّه السابق فوراً
                  بدلاً من إعادة استخدام الموديل. <strong className="text-yellow-300">نفس جودة الرد، في أجزاء
                  من الثانية بدل 5-10 ثوانٍ.</strong>
                </p>
                <p className="text-xs text-slate-500 mt-2">
                  يعمل فقط على الأسئلة المتطابقة بالحرف (بعد تطبيع بسيط للمسافات).
                  لا يصلح لردود الصور/الصوت، ولا يصلح لأول رسالة مع عميل جديد.
                </p>
              </div>
            </label>
          </div>

          {data.cacheEnabled && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-2">
                <label className="label !mb-0">مدة صلاحية الإجابة المخزّنة</label>
                <span className="text-sm font-mono text-yellow-300">{data.cacheTtlHours}س</span>
              </div>
              <input
                type="range"
                min={1}
                max={168}
                step={1}
                value={data.cacheTtlHours}
                onChange={(e) => update("cacheTtlHours", parseInt(e.target.value))}
                className="w-full accent-yellow-500"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>ساعة</span>
                <span>24س (فتراضي)</span>
                <span>أسبوع</span>
              </div>
              <p className="text-xs text-slate-500 mt-3">
                بعد انقضاء المدة، السؤال نفسه يروح للموديل من جديد. خليها قصيرة
                لو بياناتك تتغير باستمرار (أسعار، عروض).
              </p>
            </div>
          )}
        </div>
      )}

      {/* ALERTS */}
      {tab === "alerts" && (
        <div className="card p-6 space-y-4">
          <h2 className="font-bold text-lg">إشعارات الأوردر</h2>
          <p className="text-sm text-slate-400">
            لما العميل يكتب رسالة فيها كلمة من الكلمات دي, البوت يبعتلك إشعار على الرقم اللي تختاره.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="label">رقم استقبال الإشعارات</label>
              <input
                className="input"
                dir="ltr"
                value={data.notifyPhone}
                onChange={(e) => update("notifyPhone", e.target.value)}
                placeholder={userPhone || "+201234567890"}
              />
            </div>
            <div>
              <label className="label">كلمات تشغيل التنبيه (مفصولة بفاصلة)</label>
              <input
                className="input"
                value={data.orderKeywords}
                onChange={(e) => update("orderKeywords", e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 sticky bottom-2">
        {saved && (
          <span className="flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-1.5">
            <CheckCircle className="w-4 h-4" />
            تم الحفظ
          </span>
        )}
        <button onClick={save} disabled={saving} className="btn-primary">
          <Save className="w-4 h-4" />
          {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
        </button>
      </div>
    </div>
  );
}
