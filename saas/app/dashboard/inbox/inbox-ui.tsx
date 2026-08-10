"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send,
  Pause,
  Play,
  Search,
  MessageSquare,
  Flame,
  Bot as BotIcon,
  User,
  Loader2,
  StickyNote,
  ChevronRight,
  TrendingUp,
  X,
  Inbox as InboxIcon,
  ArrowRight,
  IdCard,
  FileText,
} from "lucide-react";
import Customer360 from "./customer-360";
import { Avatar } from "@/components/ui/avatar";
import { StatusDot } from "@/components/ui/status-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { TypingIndicator } from "@/components/ui/typing-indicator";
import { AiActivityPill, LiveBadge } from "@/components/ui/live-badge";
import { useRealtimeSnapshot } from "@/hooks/use-realtime";
import {
  ConversationListItemSkeleton,
  MessageBubbleSkeleton,
} from "@/components/ui/skeleton";
import { formatCustomerPhone } from "@/lib/phone";
import { useToast } from "@/components/ui/toast";

type Conv = {
  customerId: string;
  name: string | null;
  phone: string;
  leadScore: number;
  lastIntent: string | null;
  lastSentiment: string | null;
  botPaused: boolean;
  lastMessage: string;
  lastRole: string;
  lastAt: string;
  msgCount: number;
};

type Msg = {
  id: string;
  role: "user" | "assistant" | "admin" | "system";
  content: string;
  mediaType?: string | null;
  mediaUrl?: string | null;
  intent?: string | null;
  sentiment?: string | null;
  createdAt: string;
};

const POLL_MS = 20000;

export default function InboxUi({
  initialCustomerId,
}: {
  initialCustomerId: string | null;
}) {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(initialCustomerId);
  const [active, setActive] = useState<{
    customer: any;
    conversation: { id: string; botPaused: boolean; messages: Msg[] } | null;
  } | null>(null);
  const [loadingActive, setLoadingActive] = useState(false);
  const [search, setSearch] = useState("");
  // Server-verified search results (full customer set + full message
  // history), replacing the instant client-side filter of the loaded page
  // once the debounced server round-trip resolves. null = not searching.
  const [searchResults, setSearchResults] = useState<Conv[] | null>(null);
  const [reply, setReply] = useState("");
  const { error: toastError } = useToast();
  const [sending, setSending] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [profileOpen, setProfileOpen] = useState(false); // Customer 360 drawer
  // ---- Growth Suite: team inbox (assign + internal notes thread) ----
  const [assignDraft, setAssignDraft] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [thread, setThread] = useState<{ id: string; body: string; authorName: string | null; createdAt: string }[]>([]);
  const [noteThreadDraft, setNoteThreadDraft] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { state: liveState, snapshot } = useRealtimeSnapshot({
    activeCustomerId: activeId,
    fallbackMs: POLL_MS,
    onChange: (next, prev) => {
      // The SSE payload is a compact DB-derived sequence. When it changes,
      // refresh the real API data instead of inventing client-side state.
      if (!prev || prev.seq !== next.seq) {
        loadConversations();
        if (activeId) loadConversation(activeId, { silent: true });
      }
    },
  });

  // ----- Wave 6: AI suggestions panel -----
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<
    { label: string; text: string }[] | null
  >(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  async function loadSuggestions() {
    if (!activeId) return;
    setSuggesting(true);
    setSuggestError(null);
    setSuggestions(null);
    try {
      const r = await fetch(
        `/api/inbox/conversation/${activeId}/suggest-reply`,
        { method: "POST" },
      );
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.suggestions) && j.suggestions.length > 0) {
        setSuggestions(j.suggestions);
      } else {
        setSuggestError(
          j.error === "no inbound message"
            ? "لا توجد رسالة واردة للاقتراح عليها."
            : "تعذر جلب الاقتراحات. حاول تاني.",
        );
      }
    } catch {
      setSuggestError("خطأ بالشبكة.");
    } finally {
      setSuggesting(false);
    }
  }
  function useSuggestion(text: string) {
    setReply(text);
    setSuggestions(null);
  }

  // ----- list polling -----
  useEffect(() => {
    let alive = true;
    async function tick() {
      await loadConversations(alive);
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  // ----- single-conv polling -----
  useEffect(() => {
    if (!activeId) {
      setActive(null);
      return;
    }
    let alive = true;
    setLoadingActive(true);
    const idForEffect = activeId;
    async function tick() {
      await loadConversation(idForEffect, { alive });
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [activeId]);

  // ----- auto-scroll to bottom on new messages -----
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [active?.conversation?.messages.length]);

  async function loadConversations(alive: boolean = true) {
    try {
      const r = await fetch("/api/inbox/conversations", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (alive) setConvs(j.conversations || []);
    } catch {
    } finally {
      if (alive) setLoadingConvs(false);
    }
  }

  async function loadConversation(
    id: string,
    opts: { alive?: boolean; silent?: boolean } = {},
  ) {
    const alive = opts.alive ?? true;
    if (!opts.silent) setLoadingActive(true);
    try {
      const r = await fetch(`/api/inbox/conversation/${id}`, {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = await r.json();
      if (alive) {
        setActive(j);
        setNotesDraft((cur) => cur || j.customer?.notes || "");
        if (!opts.silent) {
          setAssignDraft(j.customer?.assignedAdmin || "");
          loadInternalNotes(id);
        }
      }
    } catch {
    } finally {
      if (alive) setLoadingActive(false);
    }
  }

  async function send() {
    if (!activeId || !reply.trim()) return;
    setSending(true);
    try {
      const r = await fetch(`/api/inbox/conversation/${activeId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: reply.trim() }),
      });
      if (r.ok) {
        setReply("");
        // optimistic refresh
        const fresh = await fetch(`/api/inbox/conversation/${activeId}`, {
          cache: "no-store",
        });
        if (fresh.ok) setActive(await fresh.json());
      } else {
        const j = await r.json().catch(() => ({}));
        toastError(j.error || "تعذر الإرسال — تأكد من اتصال واتساب.");
      }
    } finally {
      setSending(false);
    }
  }

  async function togglePause() {
    if (!active?.conversation || !activeId) return;
    const next = !active.conversation.botPaused;
    await fetch(`/api/inbox/conversation/${activeId}/pause`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paused: next }),
    });
    const fresh = await fetch(`/api/inbox/conversation/${activeId}`, {
      cache: "no-store",
    });
    if (fresh.ok) setActive(await fresh.json());
  }

  async function saveNotes() {
    if (!activeId) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/inbox/conversation/${activeId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
    } finally {
      setSavingNotes(false);
    }
  }

  async function assignAdmin() {
    if (!activeId) return;
    setAssignSaving(true);
    try {
      await fetch(`/api/customers/${activeId}/crm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", assignedAdmin: assignDraft.trim() }),
      });
      loadConversations();
    } finally {
      setAssignSaving(false);
    }
  }

  async function loadInternalNotes(id: string) {
    try {
      const r = await fetch(`/api/inbox/conversation/${id}/internal-notes`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setThread(j.notes || []);
    } catch {}
  }

  async function addInternalNote() {
    if (!activeId || !noteThreadDraft.trim()) return;
    setPostingNote(true);
    try {
      const r = await fetch(`/api/inbox/conversation/${activeId}/internal-notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: noteThreadDraft.trim() }),
      });
      if (r.ok) {
        setNoteThreadDraft("");
        loadInternalNotes(activeId);
      }
    } finally {
      setPostingNote(false);
    }
  }

  // Debounced server-side search: covers every conversation (not just the
  // 200 most-recently-active) and full message history (not just each
  // conversation's last message). Falls back to instant client-side
  // filtering of the already-loaded page while the round-trip is in flight.
  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/inbox/conversations?q=${encodeURIComponent(q)}`, {
          cache: "no-store",
        });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setSearchResults(j.conversations || []);
      } catch {
        // Keep the instant client-side filter as the fallback on network error.
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [search]);

  const filtered = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return convs;
    if (searchResults) return searchResults;
    return convs.filter(
      (c) =>
        (c.name || "").toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.lastMessage.toLowerCase().includes(q),
    );
  })();

  return (
    <div className="-m-4 flex h-[calc(100dvh_-_4rem_-_env(safe-area-inset-top))] min-w-0 overflow-hidden bg-canvas/80 md:-m-6 md:h-[calc(100vh_-_3rem)] lg:-m-10">
      {/* ----- conversation list (full width on mobile when no conv selected, fixed width on md+) ----- */}
      <aside
        className={`${
          activeId ? "hidden md:flex" : "flex"
        } w-full shrink-0 flex-col border-l border-white/[0.06] bg-canvas/80 backdrop-blur-xl md:w-80`}
      >
        <div className="border-b border-brand-500/10 bg-white/[0.025] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-brand-400" />
              الواردات
            </h2>
            <LiveBadge state={liveState} />
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث..."
              type="search"
              inputMode="search"
              autoComplete="off"
              className="input pr-10"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConvs && convs.length === 0 && (
            <div className="divide-y divide-white/5">
              {Array.from({ length: 6 }).map((_, i) => (
                <ConversationListItemSkeleton key={i} />
              ))}
            </div>
          )}
          {!loadingConvs && filtered.length === 0 && (
            <EmptyState
              icon={<InboxIcon className="w-full h-full" />}
              title={search.trim() ? "لا توجد نتائج" : "لا توجد محادثات بعد"}
              description={
                search.trim()
                  ? "جرّب كلمة بحث مختلفة."
                  : "المحادثات الواردة هتظهر هنا أول ما العملاء يكلّموك."
              }
              size="md"
            />
          )}
          {filtered.map((c) => {
            const isActive = c.customerId === activeId;
            const hot = c.leadScore >= 70;
            const displayName = c.name || c.phone;
            return (
              <button
                key={c.customerId}
                onClick={() => {
                  setActiveId(c.customerId);
                  setNotesDraft("");
                }}
                className={`mx-2 my-1 flex w-[calc(100%-1rem)] items-start gap-3 rounded-xl border border-transparent p-3 text-right transition-colors hover:border-white/[0.08] hover:bg-white/[0.03] ${isActive ? "border-brand-500/30 bg-brand-500/[0.08]" : ""}`}
              >
                <div className="relative shrink-0">
                  <Avatar name={displayName} size="md" />
                  {hot && (
                    <span className="absolute -top-0.5 -left-0.5">
                      <StatusDot
                        tone="busy"
                        pulse
                        size="sm"
                        label="عميل ساخن"
                      />
                    </span>
                  )}
                  {c.botPaused && !hot && (
                    <span className="absolute -top-0.5 -left-0.5">
                      <StatusDot tone="warning" size="sm" label="تحتاج متابعة" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between items-start mb-1 gap-2">
                    <span className="font-medium text-sm truncate">
                      {displayName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">
                      {timeShort(c.lastAt)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {c.lastRole === "assistant"
                      ? "🤖 "
                      : c.lastRole === "admin"
                        ? "👤 "
                        : ""}
                    {c.lastMessage.slice(0, 60)}
                  </div>
                  {c.leadScore >= 40 && (
                    <div className="mt-1.5">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
                        hot
                          ? "border-orange-500/30 bg-orange-500/10 text-orange-300"
                          : "border-brand-500/25 bg-brand-500/[0.08] text-brand-300"
                      }`}>
                        {hot ? "عميل ساخن" : "اهتمام عالٍ"}
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* ----- conversation pane (hidden on mobile when no conv selected) ----- */}
      <main
        className={`${
          activeId ? "flex" : "hidden md:flex"
        } min-w-0 flex-1 flex-col bg-black/10`}
      >
        {!active ? (
          <div className="flex flex-1 items-center justify-center">
            <EmptyState
              icon={<MessageSquare className="w-full h-full" />}
              title="اختر محادثة"
              description="اختر عميل من القائمة على اليمين لتبدأ المحادثة."
              size="lg"
            />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-500/10 bg-[#06100d]/78 p-3 backdrop-blur-xl sm:p-4">
              <div className="min-w-0 flex items-center gap-3">
                <button
                  onClick={() => {
                    setActiveId(null);
                    setActive(null);
                  }}
                  className="-m-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 transition hover:bg-white/10 md:hidden"
                  aria-label="الرجوع للقائمة"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
                <Avatar
                  name={active.customer.name || active.customer.phone}
                  size="lg"
                />
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {active.customer.name || active.customer.phone}
                    <StatusDot
                      tone={active.conversation?.botPaused ? "warning" : "ai"}
                      size="sm"
                      label={
                        active.conversation?.botPaused
                          ? "معك الآن"
                          : "تلقائي"
                      }
                    />
                    {(() => {
                      const hs = (active.conversation as any)?.handoffState || "ai_active";
                      const map: Record<string, { l: string; c: string }> = {
                        ai_active: { l: "استجابة تلقائية", c: "text-brand-300 border-brand-500/30 bg-brand-500/10" },
                        human_active: { l: "يُعالَج الآن", c: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10" },
                        escalation_pending: { l: "بانتظار موظف", c: "text-amber-300 border-amber-500/30 bg-amber-500/10" },
                        human_required: { l: "تصعيد", c: "text-rose-300 border-rose-500/30 bg-rose-500/10" },
                      };
                      const m = map[hs] || map.ai_active;
                      return (
                        <span className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${m.c}`}>
                          {m.l}
                        </span>
                      );
                    })()}
                  </div>
                  {(() => {
                    const p = formatCustomerPhone(active.customer.phone);
                    return p.isLid ? (
                      <div
                        className="text-xs text-slate-500 italic"
                        title={p.raw}
                      >
                        {p.display}
                      </div>
                    ) : (
                      <bdi dir="ltr" className="text-xs text-slate-400 block">
                        {p.display}
                      </bdi>
                    );
                  })()}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                <AiActivityPill
                  active={sending}
                  text={
                    sending
                      ? "إرسال مباشر"
                      : snapshot?.activeConversation?.botPaused
                        ? "الاستجابة متوقفة"
                        : "استجابة تلقائية"
                  }
                />
                {active.customer.leadScore > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-xl border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-xs text-orange-300">
                    <Flame className="w-3 h-3" /> {active.customer.leadScore}
                  </span>
                )}
                <button
                  onClick={() => setProfileOpen(true)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-300 transition hover:bg-brand-500/20"
                  title="عرض ملف العميل الكامل"
                >
                  <IdCard className="w-3.5 h-3.5" /> ملف 360
                </button>
                <button
                  onClick={togglePause}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                    active.conversation?.botPaused
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25"
                      : "bg-amber-500/15 text-amber-300 border-amber-500/30 hover:bg-amber-500/25"
                  }`}
                >
                  {active.conversation?.botPaused ? (
                    <>
                      <Play className="w-3 h-3" /> استئناف الاستجابة التلقائية
                    </>
                  ) : (
                    <>
                      <Pause className="w-3 h-3" /> تسلّم المحادثة
                    </>
                  )}
                </button>
              </div>
            </header>

            <div
              ref={scrollRef}
              className="ai-grid-bg flex-1 space-y-3 overflow-y-auto bg-canvas p-4 [background-size:72px_72px] [mask-image:linear-gradient(black,black)]"
            >
              {loadingActive && !active.conversation && (
                <>
                  <MessageBubbleSkeleton />
                  <MessageBubbleSkeleton outgoing />
                  <MessageBubbleSkeleton />
                </>
              )}
              {active.conversation?.messages.map((m) => (
                <MessageBubble key={m.id} m={m} />
              )) || null}
              {!loadingActive &&
                (!active.conversation ||
                  active.conversation.messages.length === 0) && (
                  <EmptyState
                    icon={<MessageSquare className="w-full h-full" />}
                    title="لا توجد رسائل بعد"
                    description="ابدأ المحادثة برسالة ترحيب من الأسفل."
                    size="md"
                  />
                )}
              {sending && <TypingIndicator label="أنت" />}
            </div>

            <div className="border-t border-brand-500/10 bg-[#06100d]/80 p-4 backdrop-blur-xl">
              {active.conversation?.botPaused && (
                <div className="text-xs text-amber-300 mb-2 flex items-center gap-1.5">
                  <Pause className="w-3 h-3" /> الاستجابة التلقائية متوقفة — ردودك ستُرسل مباشرةً.
                </div>
              )}

              {/* AI suggestions panel */}
              {(suggestions || suggesting || suggestError) && (
                <div className="mb-3 rounded-xl border border-brand-500/25 bg-brand-500/[0.07] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-brand-300">
                      <TrendingUp className="w-3.5 h-3.5" />
                      اقتراحات الرد
                    </div>
                    <button
                      onClick={() => {
                        setSuggestions(null);
                        setSuggestError(null);
                      }}
                      className="text-slate-400 hover:text-white"
                      aria-label="إغلاق"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {suggesting && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> جارٍ توليد
                      اقتراحات...
                    </div>
                  )}
                  {suggestError && (
                    <div className="text-sm text-rose-300">{suggestError}</div>
                  )}
                  {suggestions && (
                    <div className="space-y-2">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => useSuggestion(s.text)}
                          className="w-full rounded-2xl border border-white/10 bg-white/[0.045] p-2.5 text-right transition hover:border-brand-500/35 hover:bg-brand-500/10"
                        >
                          <div className="mb-1 text-[10px] text-brand-300">
                            {s.label}
                          </div>
                          <div className="text-sm text-slate-200 whitespace-pre-wrap">
                            {s.text}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  rows={2}
                  placeholder="اكتب رسالة... (Ctrl+Enter للإرسال)"
                  className="input min-h-[64px] flex-1 resize-none p-3 text-sm"
                />
                <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                  <button
                    onClick={send}
                    disabled={sending || !reply.trim()}
                    className="ai-btn ai-btn-primary min-h-[44px] flex-1 px-4 py-3 text-sm sm:flex-none md:min-h-0 md:py-2"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    إرسال
                  </button>
                  <button
                    onClick={loadSuggestions}
                    disabled={suggesting}
                    title="اقترح ردوداً جاهزة"
                    className="ai-btn ai-btn-ghost min-h-[44px] flex-1 border-brand-500/30 px-4 py-2 text-xs text-brand-200 disabled:opacity-50 sm:flex-none"
                  >
                    {suggesting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <TrendingUp className="w-3.5 h-3.5" />
                    )}
                    اقتراحات
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* ----- right sidebar: customer info + notes (lg+ only; mobile/tablet save space) ----- */}
      {active && (
        <aside className="hidden w-72 shrink-0 flex-col gap-4 overflow-y-auto border-r border-white/[0.06] bg-canvas/70 p-4 backdrop-blur-xl lg:flex">
          <div>
            <div className="text-xs text-slate-400 mb-1">العميل</div>
            <div className="font-semibold">{active.customer.name || "—"}</div>
            {(() => {
              const p = formatCustomerPhone(active.customer.phone);
              return p.isLid ? (
                <div className="text-xs text-slate-500 italic" title={p.raw}>
                  {p.display}
                </div>
              ) : (
                <bdi dir="ltr" className="text-xs text-slate-400 block">
                  {p.display}
                </bdi>
              );
            })()}
          </div>

          <button
            onClick={() => setProfileOpen(true)}
            className="ai-btn ai-btn-ghost w-full justify-center border-brand-500/30 px-3 py-2 text-xs text-brand-200"
          >
            <IdCard className="w-3.5 h-3.5" /> الملف الكامل 360
          </button>

          {active.customer.lastIntent && (
            <Field
              label="آخر نية"
              value={intentLabel(active.customer.lastIntent)}
            />
          )}
          {active.customer.lastSentiment && (
            <Field
              label="المشاعر"
              value={sentimentLabel(active.customer.lastSentiment)}
            />
          )}
          {Array.isArray(active.customer.tags) &&
            active.customer.tags.length > 0 && (
              <div>
                <div className="text-xs text-slate-400 mb-2">الوسوم</div>
                <div className="flex flex-wrap gap-1.5">
                  {active.customer.tags.map((t: string, i: number) => (
                    <span
                      key={i}
                      className="text-xs px-2 py-0.5 rounded-md bg-white/5 border border-white/10"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}

          <div>
            <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
              <StickyNote className="w-3 h-3" /> ملاحظات داخلية
            </div>
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={5}
              placeholder="ملاحظات لا يراها العميل..."
              className="input min-h-[120px] w-full resize-none rounded-2xl p-2 text-xs"
            />
            <button
              onClick={saveNotes}
              disabled={savingNotes}
              className="ai-btn ai-btn-ghost mt-2 w-full px-3 py-1.5 text-xs"
            >
              {savingNotes ? "جاري الحفظ..." : "حفظ"}
            </button>
          </div>

          {/* Assign to teammate (reuses CRM assign) */}
          <div>
            <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
              <User className="w-3 h-3" /> إسناد المحادثة
            </div>
            <div className="flex gap-2">
              <input
                value={assignDraft}
                onChange={(e) => setAssignDraft(e.target.value)}
                placeholder="اسم الموظف..."
                className="input flex-1 rounded-2xl px-3 py-1.5 text-xs"
              />
              <button onClick={assignAdmin} disabled={assignSaving} className="ai-btn ai-btn-ghost shrink-0 px-3 py-1.5 text-xs">
                {assignSaving ? "..." : "إسناد"}
              </button>
            </div>
          </div>

          {/* Internal team notes thread (admin-only, never sent to the customer) */}
          <div>
            <div className="text-xs text-slate-400 mb-2 flex items-center gap-1.5">
              <MessageSquare className="w-3 h-3" /> ملاحظات الفريق
            </div>
            <div className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
              {thread.length === 0 && <div className="text-[11px] text-slate-600">لا توجد ملاحظات فريق بعد.</div>}
              {thread.map((n) => (
                <div key={n.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2">
                  <div className="mb-0.5 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span className="font-semibold text-slate-400">{n.authorName || "موظف"}</span>
                    <span>{timeShort(n.createdAt)}</span>
                  </div>
                  <div className="whitespace-pre-wrap text-xs text-slate-200">{renderMentions(n.body)}</div>
                </div>
              ))}
            </div>
            <textarea
              value={noteThreadDraft}
              onChange={(e) => setNoteThreadDraft(e.target.value)}
              rows={2}
              placeholder="اكتب ملاحظة للفريق... استخدم @اسم للإشارة"
              className="input min-h-[52px] w-full resize-none rounded-2xl p-2 text-xs"
            />
            <button
              onClick={addInternalNote}
              disabled={postingNote || !noteThreadDraft.trim()}
              className="ai-btn ai-btn-ghost mt-2 w-full px-3 py-1.5 text-xs"
            >
              {postingNote ? "..." : "إضافة ملاحظة"}
            </button>
          </div>
        </aside>
      )}

      {/* ----- Customer 360 slide-over (additive; opens over the inbox, never blocks chat) ----- */}
      <Customer360
        customerId={activeId}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onMutated={() => {
          // CRM mutations may change tags/score/etc. — refresh the quick views.
          loadConversations();
          if (activeId) loadConversation(activeId, { silent: true });
        }}
      />
    </div>
  );
}

function MessageBubble({ m }: { m: Msg }) {
  const isUser = m.role === "user";
  const isAdmin = m.role === "admin";
  const isBot = m.role === "assistant";
  const align = isUser ? "justify-start" : "justify-end";
  const bg = isUser
    ? "bg-white/[0.055] text-slate-100 border-white/10"
    : isAdmin
      ? "bg-emerald-500/12 text-emerald-50 border-emerald-500/30"
      : "bg-brand-500/15 text-slate-100 border-brand-500/30";
  // WhatsApp-style asymmetric corners: incoming has start-side tail, outgoing has end-side tail.
  const cornerClass = isUser ? "rounded-ss-sm" : "rounded-se-sm";
  const Icon = isUser ? User : isAdmin ? User : BotIcon;
  const iconClass = isUser
    ? "text-slate-400"
    : isAdmin
      ? "text-emerald-400"
      : "text-brand-400";

  return (
    <div className={`flex ${align}`}>
      <div
        className={`max-w-[92%] break-words rounded-2xl ${cornerClass} border px-4 py-2.5 shadow-sm backdrop-blur sm:max-w-[78%] ${bg}`}
      >
        <div className="flex items-center gap-1.5 mb-1 text-[10px] opacity-70">
          <Icon className={`w-3 h-3 ${iconClass}`} />
          <span>{isUser ? "العميل" : isAdmin ? "أنت" : "تلقائي"}</span>
          <span>· {timeShort(m.createdAt)}</span>
          {m.sentiment && m.sentiment !== "neutral" && (
            <span
              className={
                m.sentiment === "angry"
                  ? "text-rose-300"
                  : m.sentiment === "negative"
                    ? "text-orange-300"
                    : "text-emerald-300"
              }
            >
              · {sentimentLabel(m.sentiment)}
            </span>
          )}
        </div>
        <MessageMedia m={m} />
        <div className="whitespace-pre-wrap text-sm">{m.content}</div>
      </div>
    </div>
  );
}

function MessageMedia({ m }: { m: Msg }) {
  if (!m.mediaUrl) return null;
  if (m.mediaType === "image") {
    return (
      <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" className="mb-2 block">
        <img
          src={m.mediaUrl}
          alt="صورة من العميل"
          className="max-h-64 w-auto rounded-xl border border-white/10"
          loading="lazy"
        />
      </a>
    );
  }
  if (m.mediaType === "voice") {
    return (
      <audio controls src={m.mediaUrl} preload="none" className="mb-2 w-full max-w-[260px]" />
    );
  }
  if (m.mediaType === "video") {
    return (
      <video
        controls
        src={m.mediaUrl}
        preload="none"
        className="mb-2 max-h-64 w-auto rounded-xl border border-white/10"
      />
    );
  }
  if (m.mediaType === "document") {
    return (
      <a
        href={m.mediaUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs hover:bg-white/[0.08]"
      >
        <FileText className="h-4 w-4 shrink-0" />
        <span>تنزيل الملف المرسل</span>
      </a>
    );
  }
  return null;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function renderMentions(body: string) {
  // Highlight @mentions inline (display-only; routing is Phase 2).
  const parts = body.split(/(@[\p{L}\p{N}_.-]{2,40})/gu);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span key={i} className="font-semibold text-brand-300">
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

function timeShort(s: string) {
  if (!s) return "";
  const d = new Date(s);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `${diffMin}د`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)}س`;
  return d.toLocaleDateString("ar-EG", { month: "short", day: "numeric" });
}

function intentLabel(i: string) {
  return (
    (
      {
        buy: "نية شراء",
        inquiry: "استفسار",
        complaint: "شكوى",
        support: "دعم",
        greeting: "تحية",
        other: "أخرى",
      } as any
    )[i] || i
  );
}
function sentimentLabel(s: string) {
  return (
    (
      {
        positive: "إيجابي",
        neutral: "محايد",
        negative: "سلبي",
        angry: "غاضب",
      } as any
    )[s] || s
  );
}
