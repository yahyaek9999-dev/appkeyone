"use client";

// Customer 360 — premium slide-over CRM profile for the inbox.
//
// Additive only: this component is rendered alongside the existing inbox and
// reads from /api/customers/[id]/profile + /timeline. Mutations go through
// /api/customers/[id]/crm (and /api/recovery/action for safe follow-up sends).
// It never touches chat/realtime/queue logic.

import { useCallback, useEffect, useState } from "react";
import {
  X,
  Flame,
  Phone,
  Star,
  Ban,
  Archive,
  UserCog,
  TrendingUp,
  Repeat,
  AlertTriangle,
  Heart,
  Handshake,
  Target,
  ShoppingBag,
  MessageSquare,
  Send,
  Plus,
  Trash2,
  Loader2,
  Tag as TagIcon,
  StickyNote,
  CreditCard,
  MapPin,
  Languages,
  Clock,
  ArrowDownUp,
  Megaphone,
  LifeBuoy,
  PackagePlus,
  Bot as BotIcon,
  User as UserIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { formatCustomerPhone } from "@/lib/phone";
import { fmtMoney, fmtDate, timeAgo } from "@/lib/format";

type Profile = {
  customer: {
    id: string;
    name: string | null;
    phone: string;
    photoUrl: string | null;
    firstContactAt: string | null;
    lastMessageAt: string | null;
    inboundCount: number;
    outboundCount: number;
    totalMessages: number;
    orderCount: number;
    totalSpent: number;
    aov: number;
    city: string | null;
    preferredLanguage: string | null;
    tags: string[];
    notes: string;
    vip: boolean;
    blacklisted: boolean;
    archivedAt: string | null;
    assignedAdmin: string | null;
  };
  lastOrder: {
    id: string;
    product: string | null;
    status: string;
    paymentMethod: string | null;
    total: number;
    createdAt: string;
  } | null;
  intelligence: {
    leadScore: number;
    leadTemp: "hot" | "warm" | "cold";
    purchaseIntent: number;
    conversionScore: number;
    repeatBuyerProb: number;
    churnRisk: number;
    retentionScore: number;
    lastSentiment: string | null;
    lastIntent: string | null;
    negotiationTendency: number;
    frustrationScore: number;
  };
};

type TimelineEvent = {
  id: string;
  type: "message" | "order" | "order_status" | "escalation" | "follow_up" | "broadcast";
  at: string;
  title: string;
  subtitle?: string | null;
  tone: "neutral" | "brand" | "admin" | "success" | "warning" | "danger" | "info";
  meta?: Record<string, any>;
};

const ORDER_STATUS_AR: Record<string, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "تم التأكيد",
  preparing: "قيد التجهيز",
  shipped: "تم الشحن",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التوصيل",
  canceled: "أُلغي",
};

const PAYMENT_AR: Record<string, string> = {
  cod: "دفع عند الاستلام",
  instapay: "إنستا باي",
  vodafone_cash: "فودافون كاش",
  card: "بطاقة",
};

const SENTIMENT_AR: Record<string, string> = {
  positive: "إيجابي",
  neutral: "محايد",
  negative: "سلبي",
  angry: "غاضب",
};

const INTENT_AR: Record<string, string> = {
  buy: "نية شراء",
  inquiry: "استفسار",
  complaint: "شكوى",
  support: "دعم",
  refund: "استرجاع",
  escalation: "تصعيد",
  greeting: "تحية",
  other: "أخرى",
};


export default function Customer360({
  customerId,
  open,
  onClose,
  onMutated,
}: {
  customerId: string | null;
  open: boolean;
  onClose: () => void;
  onMutated?: () => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "activity">("overview");
  const [busy, setBusy] = useState<string | null>(null);

  // local editable drafts
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [assignDraft, setAssignDraft] = useState("");
  const [followUpText, setFollowUpText] = useState("");
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderItems, setOrderItems] = useState<{ name: string; quantity: number; unitPrice: number }[]>([
    { name: "", quantity: 1, unitPrice: 0 },
  ]);
  const [orderPayment, setOrderPayment] = useState("cod");
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const loadProfile = useCallback(async () => {
    if (!customerId) return;
    try {
      const r = await fetch(`/api/customers/${customerId}/profile`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Profile;
      setProfile(j);
      setNoteDraft(j.customer.notes || "");
      setAssignDraft(j.customer.assignedAdmin || "");
    } catch {}
  }, [customerId]);

  const loadTimeline = useCallback(async () => {
    if (!customerId) return;
    try {
      const r = await fetch(`/api/customers/${customerId}/timeline`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setTimeline(j.events || []);
    } catch {}
  }, [customerId]);

  // Fetch on open / when the customer changes. Timeline streams in after.
  useEffect(() => {
    if (!open || !customerId) return;
    setProfile(null);
    setTimeline(null);
    setTab("overview");
    setShowOrderForm(false);
    setLoading(true);
    loadProfile().finally(() => setLoading(false));
    loadTimeline();
  }, [open, customerId, loadProfile, loadTimeline]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  async function crm(action: string, payload: Record<string, any> = {}, opts: { refreshTimeline?: boolean } = {}) {
    if (!customerId) return null;
    setBusy(action);
    try {
      const r = await fetch(`/api/customers/${customerId}/crm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        flash(j.error || "تعذّر تنفيذ الإجراء");
        return null;
      }
      await loadProfile();
      if (opts.refreshTimeline) loadTimeline();
      onMutated?.();
      return j;
    } catch {
      flash("خطأ بالشبكة");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function sendFollowUp() {
    if (!customerId || !followUpText.trim()) return;
    setBusy("follow_up");
    try {
      const r = await fetch(`/api/recovery/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_now", customerId, kind: "manual_360", message: followUpText.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setFollowUpText("");
        flash("تم جدولة المتابعة عبر الطابور الآمن ✓");
      } else {
        flash(j.error || "تعذّر إرسال المتابعة");
      }
    } catch {
      flash("خطأ بالشبكة");
    } finally {
      setBusy(null);
    }
  }

  async function submitManualOrder() {
    const items = orderItems.filter((it) => it.name.trim());
    if (items.length === 0) {
      flash("أضف منتج واحد على الأقل");
      return;
    }
    const res = await crm("manual_order", { items, paymentMethod: orderPayment }, { refreshTimeline: true });
    if (res?.ok) {
      flash(`تم إنشاء الطلب (${fmtMoney(res.total)}) ✓`);
      setShowOrderForm(false);
      setOrderItems([{ name: "", quantity: 1, unitPrice: 0 }]);
    }
  }

  const c = profile?.customer;
  const intel = profile?.intelligence;
  const displayName = c?.name || c?.phone || "عميل";
  const phone = c ? formatCustomerPhone(c.phone) : null;

  return (
    <>
      {/* overlay */}
      <div
        onClick={onClose}
        aria-hidden={!open}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* slide-over panel (anchored to the inline-start / left edge in RTL) */}
      <aside
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-label="ملف العميل 360"
        className={`fixed inset-y-0 left-0 z-50 flex w-full max-w-[480px] flex-col border-l border-brand-500/15 bg-[#040b09]/95 shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl transition-transform duration-300 ease-premium ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* sticky header */}
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Target className="h-4 w-4 text-brand-400" />
            ملف العميل 360
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:bg-white/10"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && !profile ? (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : !c ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-500">تعذّر تحميل الملف.</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* ── identity header ── */}
            <div className="border-b border-white/[0.06] p-4">
              <div className="flex items-start gap-3">
                <Avatar name={displayName} src={c.photoUrl || undefined} size="xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-lg font-bold text-white">{displayName}</span>
                    {c.vip && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        <Star className="h-3 w-3 fill-amber-300" /> VIP
                      </span>
                    )}
                    {c.blacklisted && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold text-rose-300">
                        <Ban className="h-3 w-3" /> محظور
                      </span>
                    )}
                    {c.archivedAt && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                        <Archive className="h-3 w-3" /> مؤرشف
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                    <Phone className="h-3 w-3" />
                    {phone?.isLid ? (
                      <span className="italic text-slate-500" title={phone.raw}>
                        {phone.display}
                      </span>
                    ) : (
                      <bdi dir="ltr" className="font-mono">
                        {phone?.display}
                      </bdi>
                    )}
                  </div>
                  {c.assignedAdmin && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-brand-300">
                      <UserCog className="h-3 w-3" /> {c.assignedAdmin}
                    </div>
                  )}
                </div>
              </div>

              {/* quick stats strip */}
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniStat icon={<MessageSquare className="h-3.5 w-3.5" />} label="رسائل" value={String(c.totalMessages)} />
                <MiniStat icon={<ShoppingBag className="h-3.5 w-3.5" />} label="طلبات" value={String(c.orderCount)} />
                <MiniStat icon={<TrendingUp className="h-3.5 w-3.5" />} label="إجمالي الإنفاق" value={fmtMoney(c.totalSpent)} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> أول تواصل: {fmtDate(c.firstContactAt)}
                </span>
                <span>آخر رسالة: {c.lastMessageAt ? timeAgo(c.lastMessageAt) : "—"}</span>
              </div>
            </div>

            {/* ── tabs ── */}
            <div className="sticky top-0 z-10 flex gap-1 border-b border-white/[0.06] bg-[#040b09]/95 px-3 py-2 backdrop-blur">
              <TabBtn active={tab === "overview"} onClick={() => setTab("overview")}>
                نظرة عامة
              </TabBtn>
              <TabBtn active={tab === "activity"} onClick={() => setTab("activity")}>
                النشاط
              </TabBtn>
            </div>

            {tab === "overview" ? (
              <div className="space-y-5 p-4">
                {/* ── AI intelligence ── */}
                <Section title="ذكاء العميل" icon={<Target className="h-3.5 w-3.5" />}>
                  <LeadTempCard intel={intel!} />
                  <div className="grid grid-cols-2 gap-2">
                    <ScoreCard icon={<Target className="h-4 w-4" />} label="نية الشراء" value={intel!.purchaseIntent} tone="brand" />
                    <ScoreCard icon={<TrendingUp className="h-4 w-4" />} label="فرصة التحويل" value={intel!.conversionScore} tone="emerald" />
                    <ScoreCard icon={<Repeat className="h-4 w-4" />} label="احتمال التكرار" value={intel!.repeatBuyerProb} tone="sky" />
                    <ScoreCard icon={<AlertTriangle className="h-4 w-4" />} label="خطر الفقدان" value={intel!.churnRisk} tone="rose" invert />
                    <ScoreCard icon={<Handshake className="h-4 w-4" />} label="ميل التفاوض" value={intel!.negotiationTendency} tone="amber" />
                    <ScoreCard icon={<Heart className="h-4 w-4" />} label="الولاء/الاحتفاظ" value={intel!.retentionScore} tone="violet" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FactPill
                      label="آخر مشاعر"
                      value={intel!.lastSentiment ? SENTIMENT_AR[intel!.lastSentiment] || intel!.lastSentiment : "—"}
                      tone={
                        intel!.lastSentiment === "angry"
                          ? "danger"
                          : intel!.lastSentiment === "negative"
                            ? "warning"
                            : intel!.lastSentiment === "positive"
                              ? "success"
                              : "neutral"
                      }
                    />
                    <FactPill label="آخر نية" value={intel!.lastIntent ? INTENT_AR[intel!.lastIntent] || intel!.lastIntent : "—"} tone="neutral" />
                  </div>
                </Section>

                {/* ── key facts ── */}
                <Section title="بيانات أساسية" icon={<UserIcon className="h-3.5 w-3.5" />}>
                  <div className="grid grid-cols-2 gap-2">
                    <FactRow icon={<MessageSquare className="h-3.5 w-3.5" />} label="وارد / صادر" value={`${c.inboundCount} / ${c.outboundCount}`} />
                    <FactRow icon={<ArrowDownUp className="h-3.5 w-3.5" />} label="متوسط الطلب" value={c.aov ? fmtMoney(c.aov) : "—"} />
                    <FactRow icon={<MapPin className="h-3.5 w-3.5" />} label="المدينة/العنوان" value={c.city || "—"} />
                    <FactRow icon={<Languages className="h-3.5 w-3.5" />} label="اللغة المفضلة" value={c.preferredLanguage || "—"} />
                  </div>
                  {profile!.lastOrder && (
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                        <ShoppingBag className="h-3.5 w-3.5" /> آخر طلب
                      </div>
                      <div className="text-sm text-white">{profile!.lastOrder.product || "طلب"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                        <span>{ORDER_STATUS_AR[profile!.lastOrder.status] || profile!.lastOrder.status}</span>
                        {profile!.lastOrder.paymentMethod && (
                          <span className="inline-flex items-center gap-1">
                            <CreditCard className="h-3 w-3" />
                            {PAYMENT_AR[profile!.lastOrder.paymentMethod] || profile!.lastOrder.paymentMethod}
                          </span>
                        )}
                        <span>{fmtMoney(profile!.lastOrder.total)}</span>
                        <span>{fmtDate(profile!.lastOrder.createdAt)}</span>
                      </div>
                    </div>
                  )}
                </Section>

                {/* ── tags ── */}
                <Section title="الوسوم" icon={<TagIcon className="h-3.5 w-3.5" />}>
                  <div className="flex flex-wrap gap-1.5">
                    {c.tags.length === 0 && <span className="text-xs text-slate-500">لا توجد وسوم</span>}
                    {c.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] py-1 pe-1.5 ps-2.5 text-xs text-slate-200">
                        {t}
                        <button
                          onClick={() => crm("remove_tag", { tag: t })}
                          disabled={!!busy}
                          className="rounded-full p-0.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                          aria-label="حذف الوسم"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={tagDraft}
                      onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && tagDraft.trim()) {
                          crm("add_tag", { tag: tagDraft.trim() });
                          setTagDraft("");
                        }
                      }}
                      placeholder="أضف وسم..."
                      className="input flex-1 px-3 py-2 text-xs"
                    />
                    <button
                      onClick={() => {
                        if (tagDraft.trim()) {
                          crm("add_tag", { tag: tagDraft.trim() });
                          setTagDraft("");
                        }
                      }}
                      disabled={!!busy || !tagDraft.trim()}
                      className="ai-btn ai-btn-ghost shrink-0 px-3 py-2 text-xs"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </Section>

                {/* ── notes ── */}
                <Section title="ملاحظات داخلية" icon={<StickyNote className="h-3.5 w-3.5" />}>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={3}
                    placeholder="ملاحظات لا يراها العميل..."
                    className="input min-h-[80px] w-full resize-none p-2.5 text-xs"
                  />
                  <button
                    onClick={() => crm("set_note", { notes: noteDraft })}
                    disabled={busy === "set_note"}
                    className="ai-btn ai-btn-ghost w-full px-3 py-2 text-xs"
                  >
                    {busy === "set_note" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StickyNote className="h-3.5 w-3.5" />}
                    حفظ الملاحظات
                  </button>
                </Section>

                {/* ── admin controls ── */}
                <Section title="إجراءات الإدارة" icon={<UserCog className="h-3.5 w-3.5" />}>
                  <div className="grid grid-cols-2 gap-2">
                    <ActionToggle
                      active={c.vip}
                      onClick={() => crm("set_vip", { value: !c.vip })}
                      disabled={busy === "set_vip"}
                      icon={<Star className="h-3.5 w-3.5" />}
                      label={c.vip ? "إلغاء VIP" : "تمييز VIP"}
                      tone="amber"
                    />
                    <ActionToggle
                      active={c.blacklisted}
                      onClick={() => crm("set_blacklist", { value: !c.blacklisted })}
                      disabled={busy === "set_blacklist"}
                      icon={<Ban className="h-3.5 w-3.5" />}
                      label={c.blacklisted ? "رفع الحظر" : "حظر"}
                      tone="rose"
                    />
                    <ActionToggle
                      active={!!c.archivedAt}
                      onClick={() => crm(c.archivedAt ? "unarchive" : "archive")}
                      disabled={busy === "archive" || busy === "unarchive"}
                      icon={<Archive className="h-3.5 w-3.5" />}
                      label={c.archivedAt ? "إلغاء الأرشفة" : "أرشفة"}
                      tone="slate"
                    />
                    <ActionToggle
                      active={false}
                      onClick={() => crm("escalate", {}, { refreshTimeline: true }).then((r) => r?.ok && flash("تم فتح تذكرة تصعيد ✓"))}
                      disabled={busy === "escalate"}
                      icon={<LifeBuoy className="h-3.5 w-3.5" />}
                      label="فرض تصعيد"
                      tone="orange"
                    />
                  </div>

                  {/* assign */}
                  <div className="flex gap-2">
                    <input
                      value={assignDraft}
                      onChange={(e) => setAssignDraft(e.target.value)}
                      placeholder="إسناد لموظف..."
                      className="input flex-1 px-3 py-2 text-xs"
                    />
                    <button
                      onClick={() => crm("assign", { assignedAdmin: assignDraft })}
                      disabled={busy === "assign"}
                      className="ai-btn ai-btn-ghost shrink-0 px-3 py-2 text-xs"
                    >
                      <UserCog className="h-3.5 w-3.5" /> إسناد
                    </button>
                  </div>

                  {/* manual follow-up (routes through the protected queue) */}
                  <div className="rounded-xl border border-brand-500/15 bg-brand-500/[0.04] p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-brand-300">
                      <Send className="h-3.5 w-3.5" /> متابعة يدوية
                    </div>
                    <textarea
                      value={followUpText}
                      onChange={(e) => setFollowUpText(e.target.value)}
                      rows={2}
                      placeholder="رسالة متابعة تُرسل عبر الطابور الآمن..."
                      className="input min-h-[56px] w-full resize-none p-2.5 text-xs"
                    />
                    <button
                      onClick={sendFollowUp}
                      disabled={busy === "follow_up" || !followUpText.trim()}
                      className="ai-btn ai-btn-primary mt-2 w-full px-3 py-2 text-xs"
                    >
                      {busy === "follow_up" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      إرسال المتابعة
                    </button>
                  </div>

                  {/* manual order */}
                  {!showOrderForm ? (
                    <button onClick={() => setShowOrderForm(true)} className="ai-btn ai-btn-ghost w-full px-3 py-2 text-xs">
                      <PackagePlus className="h-3.5 w-3.5" /> إنشاء طلب يدوي
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                      <div className="text-[11px] font-semibold text-slate-300">طلب يدوي جديد</div>
                      {orderItems.map((it, i) => (
                        <div key={i} className="flex gap-1.5">
                          <input
                            value={it.name}
                            onChange={(e) => {
                              const next = [...orderItems];
                              next[i] = { ...it, name: e.target.value };
                              setOrderItems(next);
                            }}
                            placeholder="المنتج"
                            className="input flex-1 px-2 py-1.5 text-xs"
                          />
                          <input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => {
                              const next = [...orderItems];
                              next[i] = { ...it, quantity: Math.max(1, Number(e.target.value) || 1) };
                              setOrderItems(next);
                            }}
                            className="input w-14 px-2 py-1.5 text-xs"
                            aria-label="الكمية"
                          />
                          <input
                            type="number"
                            min={0}
                            value={it.unitPrice}
                            onChange={(e) => {
                              const next = [...orderItems];
                              next[i] = { ...it, unitPrice: Math.max(0, Number(e.target.value) || 0) };
                              setOrderItems(next);
                            }}
                            placeholder="السعر"
                            className="input w-20 px-2 py-1.5 text-xs"
                            aria-label="سعر الوحدة"
                          />
                          {orderItems.length > 1 && (
                            <button
                              onClick={() => setOrderItems(orderItems.filter((_, j) => j !== i))}
                              className="shrink-0 rounded-lg border border-white/10 px-2 text-slate-400 transition hover:text-rose-300"
                              aria-label="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => setOrderItems([...orderItems, { name: "", quantity: 1, unitPrice: 0 }])}
                        className="text-[11px] text-brand-300 hover:text-brand-200"
                      >
                        + إضافة منتج
                      </button>
                      <select
                        value={orderPayment}
                        onChange={(e) => setOrderPayment(e.target.value)}
                        className="input w-full px-2 py-1.5 text-xs"
                      >
                        <option value="cod">دفع عند الاستلام</option>
                        <option value="instapay">إنستا باي</option>
                        <option value="vodafone_cash">فودافون كاش</option>
                        <option value="card">بطاقة</option>
                      </select>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>الإجمالي</span>
                        <span className="font-semibold text-white">
                          {fmtMoney(orderItems.reduce((s, it) => s + (it.quantity || 0) * (it.unitPrice || 0), 0))}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={submitManualOrder}
                          disabled={busy === "manual_order"}
                          className="ai-btn ai-btn-primary flex-1 px-3 py-2 text-xs"
                        >
                          {busy === "manual_order" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackagePlus className="h-3.5 w-3.5" />}
                          حفظ الطلب
                        </button>
                        <button onClick={() => setShowOrderForm(false)} className="ai-btn ai-btn-ghost px-3 py-2 text-xs">
                          إلغاء
                        </button>
                      </div>
                    </div>
                  )}
                </Section>
              </div>
            ) : (
              /* ── activity timeline ── */
              <div className="p-4">
                {timeline === null ? (
                  <div className="flex items-center justify-center py-8 text-slate-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : timeline.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">لا يوجد نشاط بعد.</div>
                ) : (
                  <ol className="relative space-y-1 ps-5">
                    <span className="absolute bottom-2 right-[7px] top-2 w-px bg-white/[0.08]" aria-hidden />
                    {timeline.map((e) => (
                      <TimelineRow key={e.id} e={e} />
                    ))}
                  </ol>
                )}
              </div>
            )}
          </div>
        )}

        {/* toast */}
        {toast && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl border border-brand-500/30 bg-[#06100d] px-4 py-2 text-xs text-brand-200 shadow-lg">
            {toast}
          </div>
        )}
      </aside>
    </>
  );
}

// ────────────────────────── sub-components ──────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span className="text-brand-400">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
        active ? "bg-brand-500/15 text-brand-300" : "text-slate-400 hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 text-center">
      <div className="mx-auto mb-0.5 flex w-fit items-center gap-1 text-brand-400">{icon}</div>
      <div className="truncate text-sm font-bold text-white" title={value}>
        {value}
      </div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

const TONE_BAR: Record<string, string> = {
  brand: "bg-brand-400",
  emerald: "bg-emerald-400",
  sky: "bg-sky-400",
  rose: "bg-rose-400",
  amber: "bg-amber-400",
  violet: "bg-violet-400",
};
const TONE_TEXT: Record<string, string> = {
  brand: "text-brand-300",
  emerald: "text-emerald-300",
  sky: "text-sky-300",
  rose: "text-rose-300",
  amber: "text-amber-300",
  violet: "text-violet-300",
};

function ScoreCard({
  icon,
  label,
  value,
  tone,
  invert,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: keyof typeof TONE_BAR;
  invert?: boolean;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1 text-[10px] font-medium text-slate-400`}>
          <span className={TONE_TEXT[tone]}>{icon}</span>
          {label}
        </span>
        <span className={`text-xs font-bold ${TONE_TEXT[tone]}`}>{v}{invert ? "" : "%"}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function LeadTempCard({ intel }: { intel: Profile["intelligence"] }) {
  const map = {
    hot: { label: "ساخن 🔥", cls: "border-orange-500/40 bg-orange-500/10 text-orange-300", bar: "bg-orange-400" },
    warm: { label: "دافئ", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", bar: "bg-amber-400" },
    cold: { label: "بارد", cls: "border-slate-500/30 bg-slate-500/10 text-slate-400", bar: "bg-slate-500" },
  } as const;
  const m = map[intel.leadTemp];
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${m.cls}`}>
      <Flame className="h-6 w-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold">عميل {m.label}</span>
          <span className="text-lg font-black">{intel.leadScore}</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/30">
          <div className={`h-full rounded-full ${m.bar}`} style={{ width: `${Math.min(100, intel.leadScore)}%` }} />
        </div>
      </div>
    </div>
  );
}

const PILL_TONE: Record<string, string> = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  danger: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  neutral: "border-white/10 bg-white/[0.03] text-slate-300",
};

function FactPill({ label, value, tone }: { label: string; value: string; tone: keyof typeof PILL_TONE }) {
  return (
    <div className={`rounded-xl border p-2.5 ${PILL_TONE[tone]}`}>
      <div className="text-[10px] opacity-70">{label}</div>
      <div className="truncate text-sm font-semibold" title={value}>
        {value}
      </div>
    </div>
  );
}

function FactRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-1 text-[10px] text-slate-500">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium text-slate-100" title={value}>
        {value}
      </div>
    </div>
  );
}

const ACTION_TONE: Record<string, { on: string; off: string }> = {
  amber: { on: "border-amber-400/40 bg-amber-400/15 text-amber-300", off: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-amber-400/30 hover:text-amber-300" },
  rose: { on: "border-rose-500/40 bg-rose-500/15 text-rose-300", off: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-rose-500/30 hover:text-rose-300" },
  slate: { on: "border-slate-400/40 bg-slate-400/15 text-slate-200", off: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/20" },
  orange: { on: "border-orange-500/40 bg-orange-500/15 text-orange-300", off: "border-white/10 bg-white/[0.03] text-slate-300 hover:border-orange-500/30 hover:text-orange-300" },
};

function ActionToggle({
  active,
  onClick,
  disabled,
  icon,
  label,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tone: keyof typeof ACTION_TONE;
}) {
  const t = ACTION_TONE[tone];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
        active ? t.on : t.off
      }`}
    >
      {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

const TIMELINE_ICON: Record<TimelineEvent["type"], React.ReactNode> = {
  message: <MessageSquare className="h-3 w-3" />,
  order: <ShoppingBag className="h-3 w-3" />,
  order_status: <PackagePlus className="h-3 w-3" />,
  escalation: <LifeBuoy className="h-3 w-3" />,
  follow_up: <Send className="h-3 w-3" />,
  broadcast: <Megaphone className="h-3 w-3" />,
};

const TIMELINE_DOT: Record<string, string> = {
  neutral: "bg-slate-500 text-slate-200",
  brand: "bg-brand-500/30 text-brand-300",
  admin: "bg-emerald-500/30 text-emerald-300",
  success: "bg-emerald-500/30 text-emerald-300",
  warning: "bg-amber-500/30 text-amber-300",
  danger: "bg-rose-500/30 text-rose-300",
  info: "bg-sky-500/30 text-sky-300",
};

function TimelineRow({ e }: { e: TimelineEvent }) {
  const isBotMsg = e.type === "message" && e.meta?.role === "assistant";
  const isAdminMsg = e.type === "message" && e.meta?.role === "admin";
  const icon =
    e.type === "message" && (isBotMsg || isAdminMsg) ? (
      isAdminMsg ? <UserIcon className="h-3 w-3" /> : <BotIcon className="h-3 w-3" />
    ) : (
      TIMELINE_ICON[e.type]
    );
  return (
    <li className="relative flex gap-3 py-2">
      <span className={`relative z-10 mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full ${TIMELINE_DOT[e.tone] || TIMELINE_DOT.neutral}`}>
        <span className="scale-[0.7]">{icon}</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <span className="text-xs text-slate-200">{e.title}</span>
          <time className="shrink-0 text-[10px] text-slate-500">{timeAgo(e.at)}</time>
        </div>
        {e.subtitle && <div className="mt-0.5 text-[10px] text-slate-500">{e.subtitle}</div>}
      </div>
    </li>
  );
}
