"use client";

import { useState, useEffect } from "react";
import { Search, Gift, Tag, Shield, ChevronRight, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import { useToast } from "@/components/ui/toast";

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface Override {
  id: string;
  baseSlug: string | null;
  addCaps: string;
  limitOverrides: string;
  reason: string;
  adminNotes: string;
  startsAt: string;
  expiresAt: string | null;
  createdBy: string | null;
  updatedAt: string;
}

interface Gift {
  id: string;
  type: string;
  amount: number;
  featureKey: string | null;
  planSlug: string | null;
  expiresAt: string | null;
  used: boolean;
  grantedBy: string;
  reason: string;
  createdAt: string;
}

interface Entitlements {
  tier: string;
  slug: string;
  planName: string;
  enforce: boolean;
  blocked: boolean;
  sources: string[];
  capabilities: Record<string, boolean>;
  limits: Record<string, number>;
  offReasons: Record<string, string | null>;
}

const GIFT_TYPES = [
  { value: "sms_credits",       label: "رصيد SMS" },
  { value: "ai_credits",        label: "رصيد ذكاء اصطناعي" },
  { value: "broadcast_credits", label: "رصيد الحملات" },
  { value: "days",              label: "أيام مجانية" },
  { value: "feature_unlock",    label: "فتح ميزة" },
  { value: "plan_upgrade",      label: "ترقية مؤقتة للباقة" },
];

const PUBLIC_TIERS = ["k_start", "k_growth", "k_pro", "k_enterprise"];

export default function CommercialControlPage() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [override, setOverride] = useState<Override | null>(null);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"plan" | "gifts" | "diagnostics">("plan");

  // Override form
  const [ovBaseSlug, setOvBaseSlug]       = useState("");
  const [ovAddCaps, setOvAddCaps]         = useState("");
  const [ovLimits, setOvLimits]           = useState("");
  const [ovNote, setOvNote]               = useState("");
  const [ovExpiresAt, setOvExpiresAt]     = useState("");

  // Gift form
  const [giftType, setGiftType]           = useState("sms_credits");
  const [giftAmount, setGiftAmount]       = useState("");
  const [giftFeatureKey, setGiftFeatureKey] = useState("");
  const [giftPlanSlug, setGiftPlanSlug]   = useState("");
  const [giftReason, setGiftReason]       = useState("");
  const [giftExpires, setGiftExpires]     = useState("");

  const { success: toastSuccess, error: toastError } = useToast();

  useEffect(() => {
    if (!search.trim() || search.length < 3) { setUsers([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(search)}&limit=8`).catch(() => null);
      if (!res?.ok) return;
      const data = await res.json();
      setUsers(data.users || []);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function selectUser(user: User) {
    setSelectedUser(user);
    setUsers([]);
    setSearch("");
    setLoading(true);
    try {
      const [ovRes, giftsRes, entRes] = await Promise.all([
        fetch(`/api/admin/users/${user.id}/override`),
        fetch(`/api/admin/users/${user.id}/gifts`),
        fetch(`/api/admin/users/${user.id}/entitlements`),
      ]);
      const ovData   = await ovRes.json();
      const giftData = await giftsRes.json();
      const entData  = await entRes.json();
      const ov = ovData.override || null;
      setOverride(ov);
      setGifts(giftData.gifts || []);
      setEntitlements(entData.entitlements || null);
      if (ov) {
        setOvBaseSlug(ov.baseSlug || "");
        try { setOvAddCaps(JSON.parse(ov.addCaps || "[]").join(", ")); } catch { setOvAddCaps(""); }
        try { setOvLimits(JSON.stringify(JSON.parse(ov.limitOverrides || "{}"), null, 2)); } catch { setOvLimits("{}"); }
        setOvNote(ov.reason || "");
        setOvExpiresAt(ov.expiresAt ? ov.expiresAt.slice(0, 10) : "");
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveOverride() {
    if (!selectedUser) return;
    let addCaps: string[] = [];
    try { addCaps = ovAddCaps.split(",").map(s => s.trim()).filter(Boolean); } catch {}
    let limitOverrides = {};
    try { limitOverrides = JSON.parse(ovLimits || "{}"); } catch {}
    const res = await fetch(`/api/admin/users/${selectedUser.id}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseSlug: ovBaseSlug || null,
        addCaps: JSON.stringify(addCaps),
        limitOverrides: JSON.stringify(limitOverrides),
        note: ovNote,
        expiresAt: ovExpiresAt || null,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setOverride(data.override);
      toastSuccess("تم حفظ الباقة المخصّصة");
    } else {
      toastError(data.error || "فشل الحفظ");
    }
  }

  async function removeOverride() {
    if (!selectedUser || !override) return;
    const res = await fetch(`/api/admin/users/${selectedUser.id}/override`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setOverride(null);
      setOvBaseSlug(""); setOvAddCaps(""); setOvLimits("{}"); setOvNote(""); setOvExpiresAt("");
      toastSuccess("تم إزالة الباقة المخصّصة");
    }
  }

  async function grantGift() {
    if (!selectedUser) return;
    const body: any = { type: giftType, reason: giftReason };
    if (giftAmount) body.amount = Number(giftAmount);
    if (giftFeatureKey) body.featureKey = giftFeatureKey;
    if (giftPlanSlug) body.planSlug = giftPlanSlug;
    if (giftExpires) body.expiresAt = giftExpires;
    const res = await fetch(`/api/admin/users/${selectedUser.id}/gifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      setGifts(prev => [data.gift, ...prev]);
      setGiftAmount(""); setGiftFeatureKey(""); setGiftPlanSlug(""); setGiftReason(""); setGiftExpires("");
      toastSuccess("تم منح الهدية");
    } else {
      toastError(data.error || "فشل المنح");
    }
  }

  async function revokeGift(giftId: string) {
    if (!selectedUser) return;
    const res = await fetch(`/api/admin/users/${selectedUser.id}/gifts/${giftId}`, { method: "DELETE" });
    const data = await res.json();
    if (data.ok) {
      setGifts(prev => prev.filter(g => g.id !== giftId));
      toastSuccess("تم إلغاء الهدية");
    } else {
      toastError(data.error || "فشل الإلغاء");
    }
  }

  const offCaps = entitlements
    ? Object.entries(entitlements.offReasons).filter(([, r]) => r)
    : [];

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">التحكم التجاري</h1>
        <p className="text-sm text-muted-foreground mt-1">
          باقات مخصّصة · هدايا · عروض · تشخيص حقوق العميل
        </p>
      </div>

      {/* Customer search */}
      <div className="relative">
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="ابحث عن عميل بالبريد أو الاسم..."
          className="w-full pr-9 border border-border rounded-lg px-3 py-2 text-sm bg-background focus:ring-2 ring-primary/20 outline-none"
        />
        {users.length > 0 && (
          <div className="absolute z-10 top-full mt-1 w-full border border-border rounded-lg bg-background shadow-lg overflow-hidden">
            {users.map(u => (
              <button key={u.id} onClick={() => selectUser(u)} className="w-full text-right px-4 py-2.5 hover:bg-muted text-sm flex items-center gap-2">
                <span className="font-medium text-foreground">{u.name || u.email}</span>
                <span className="text-muted-foreground text-xs">{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="space-y-4">
          {/* User badge */}
          <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-lg border border-border">
            <div className="flex-1">
              <div className="font-semibold text-foreground">{selectedUser.name || selectedUser.email}</div>
              <div className="text-xs text-muted-foreground">{selectedUser.email}</div>
            </div>
            {entitlements && (
              <div className="flex gap-2 items-center text-xs">
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {entitlements.planName}
                </span>
                {entitlements.sources.includes("override") && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">مخصّص</span>
                )}
                {entitlements.sources.includes("gift") && (
                  <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">هدايا</span>
                )}
                {entitlements.blocked && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">موقوف</span>
                )}
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border gap-1">
            {(["plan", "gifts", "diagnostics"] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t
                    ? "border-b-2 border-primary text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "plan" ? "الباقة المخصّصة" : t === "gifts" ? "الهدايا والمكافآت" : "تشخيص الحقوق"}
              </button>
            ))}
          </div>

          {loading && <div className="text-sm text-muted-foreground animate-pulse">جاري التحميل...</div>}

          {/* Plan override tab */}
          {tab === "plan" && !loading && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">الباقة الأساسية للعقد</label>
                  <select
                    value={ovBaseSlug}
                    onChange={e => setOvBaseSlug(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  >
                    <option value="">— نفس الباقة المشتركة —</option>
                    {PUBLIC_TIERS.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">تنتهي في (اختياري)</label>
                  <input
                    type="date"
                    value={ovExpiresAt}
                    onChange={e => setOvExpiresAt(e.target.value)}
                    className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  ميزات إضافية (مفاتيح مفصولة بفاصلة)
                </label>
                <input
                  value={ovAddCaps}
                  onChange={e => setOvAddCaps(e.target.value)}
                  placeholder="k1sms, api_access, multi_whatsapp"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">
                  تجاوز الحدود (JSON — مثال: {"{ \"team\": 10, \"broadcasts\": 1000 }"})
                </label>
                <textarea
                  value={ovLimits}
                  onChange={e => setOvLimits(e.target.value)}
                  rows={3}
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1">ملاحظة داخلية</label>
                <input
                  value={ovNote}
                  onChange={e => setOvNote(e.target.value)}
                  placeholder="صفقة مع الشركة XYZ — عقد سنوي"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                />
              </div>

              {override && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  آخر تحديث: {new Date(override.updatedAt).toLocaleDateString("ar-SA")} بواسطة {override.createdBy || "admin"}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={saveOverride}
                  className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
                >
                  حفظ الباقة المخصّصة
                </button>
                {override && (
                  <button
                    onClick={removeOverride}
                    className="border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    إزالة التخصيص
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Gifts tab */}
          {tab === "gifts" && !loading && (
            <div className="space-y-4">
              {/* Grant form */}
              <div className="border border-border rounded-lg p-4 space-y-3">
                <h3 className="font-medium text-sm text-foreground flex items-center gap-2">
                  <Gift className="h-4 w-4 text-purple-500" /> منح هدية جديدة
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">نوع الهدية</label>
                    <select
                      value={giftType}
                      onChange={e => setGiftType(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    >
                      {GIFT_TYPES.map(g => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                  {["sms_credits","ai_credits","broadcast_credits","days"].includes(giftType) && (
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">الكمية</label>
                      <input
                        type="number"
                        value={giftAmount}
                        onChange={e => setGiftAmount(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                        min={1}
                      />
                    </div>
                  )}
                  {giftType === "feature_unlock" && (
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">مفتاح الميزة</label>
                      <input
                        value={giftFeatureKey}
                        onChange={e => setGiftFeatureKey(e.target.value)}
                        placeholder="k1sms"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background font-mono"
                      />
                    </div>
                  )}
                  {giftType === "plan_upgrade" && (
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1">الباقة المؤقتة</label>
                      <select
                        value={giftPlanSlug}
                        onChange={e => setGiftPlanSlug(e.target.value)}
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                      >
                        <option value="">اختر...</option>
                        {PUBLIC_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">تنتهي في (اختياري)</label>
                    <input
                      type="date"
                      value={giftExpires}
                      onChange={e => setGiftExpires(e.target.value)}
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-muted-foreground mb-1">سبب / ملاحظة</label>
                    <input
                      value={giftReason}
                      onChange={e => setGiftReason(e.target.value)}
                      placeholder="تعويض، ترحيب، اتفاق..."
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background"
                    />
                  </div>
                </div>
                <button
                  onClick={grantGift}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700"
                >
                  منح الهدية
                </button>
              </div>

              {/* Existing gifts */}
              <div className="space-y-2">
                {gifts.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد هدايا بعد</p>
                )}
                {gifts.map(g => (
                  <div key={g.id} className={`flex items-center gap-3 p-3 rounded-lg border ${g.used ? "opacity-50 border-border" : "border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {GIFT_TYPES.find(t => t.value === g.type)?.label || g.type}
                        {g.amount ? ` — ${g.amount.toLocaleString()}` : ""}
                        {g.featureKey ? ` — ${g.featureKey}` : ""}
                        {g.planSlug ? ` — ${g.planSlug}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        بواسطة {g.grantedBy} · {new Date(g.createdAt).toLocaleDateString("ar-SA")}
                        {g.expiresAt ? ` · تنتهي ${new Date(g.expiresAt).toLocaleDateString("ar-SA")}` : ""}
                        {g.reason ? ` · ${g.reason}` : ""}
                      </div>
                    </div>
                    {g.used ? (
                      <span className="text-xs text-muted-foreground">مستخدمة</span>
                    ) : (
                      <button
                        onClick={() => revokeGift(g.id)}
                        className="text-xs text-red-500 hover:text-red-700 shrink-0"
                      >
                        إلغاء
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Diagnostics tab */}
          {tab === "diagnostics" && !loading && entitlements && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="border border-border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">الطبقات المفعّلة</div>
                  <div className="flex gap-1 flex-wrap">
                    {entitlements.sources.map(s => (
                      <span key={s} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">{s}</span>
                    ))}
                  </div>
                </div>
                <div className="border border-border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">الحدود</div>
                  <div className="space-y-0.5">
                    {Object.entries(entitlements.limits).map(([k, v]) => (
                      <div key={k} className="text-xs flex justify-between">
                        <span className="text-muted-foreground font-mono">{k}</span>
                        <span className="text-foreground">{v === 0 ? "∞" : v}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border border-border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground mb-1">حالة التطبيق</div>
                  <div className="space-y-1 text-xs">
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">تطبيق القيود:</span>
                      <span className={entitlements.enforce ? "text-amber-600" : "text-emerald-600"}>
                        {entitlements.enforce ? "نعم" : "لا"}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-muted-foreground">موقوف:</span>
                      <span className={entitlements.blocked ? "text-red-600" : "text-emerald-600"}>
                        {entitlements.blocked ? "نعم" : "لا"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {offCaps.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-foreground mb-2 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    الميزات المعطّلة وسببها
                  </h3>
                  <div className="space-y-1">
                    {offCaps.map(([key, reason]) => (
                      <div key={key} className="flex items-center gap-3 text-sm p-2 rounded-lg bg-muted/30">
                        <code className="text-xs font-mono text-muted-foreground shrink-0">{key}</code>
                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-foreground">{reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {offCaps.length === 0 && (
                <div className="flex items-center gap-2 text-emerald-600 text-sm p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  العميل يملك صلاحية وصول كاملة — لا ميزات معطّلة
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!selectedUser && (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">ابحث عن عميل للبدء</p>
        </div>
      )}
    </div>
  );
}
