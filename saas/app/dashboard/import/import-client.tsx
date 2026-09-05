"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import {
  DownloadCloud, Loader2, CheckCircle2, XCircle, AlertTriangle, Clock,
  ScanLine, DatabaseZap, Users, MessageSquare, Brain, Inbox, RefreshCw,
} from "lucide-react";

/**
 * The transport states /api/whatsapp/status can return, in the dashboard's own
 * language. Without this the screen printed the raw token — an Arabic RTL page
 * showing "service_unreachable" to a merchant, which reads as a crash rather
 * than a state. Mirrors the mapping in whatsapp-health-client.tsx.
 */
const STATUS_AR: Record<string, string> = {
  connected: "متصل",
  connecting: "جاري الربط",
  qr: "في انتظار مسح الكود",
  disconnected: "غير متصل",
  service_unreachable: "الخدمة غير متاحة",
};

type ImportSession = {
  id: string;
  status: string;
  qrJobId: string | null;
  contactsFound: number;
  contactsImported: number;
  conversationsImported: number;
  messagesImported: number;
  customersCreated: number;
  memoriesBuilt: number;
  error: string | null;
  requestedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
};
type ImportLog = { id: string; level: string; message: string; createdAt: string };
type ImportedCustomer = { id: string; name: string | null; phone: string; createdAt: string };

// Lifecycle: requested|queued|scheduled|scanning|importing|completed|closed|failed
const IN_PROGRESS = new Set(["requested", "queued", "scheduled", "scanning", "importing"]);
const DONE = new Set(["completed", "closed"]);

// Stepper stages → the session statuses that map onto each visual step.
const STEPS: Array<{ key: string; label: string; icon: React.ComponentType<any>; statuses: string[] }> = [
  { key: "requested", label: "طلب", icon: Clock, statuses: ["requested"] },
  { key: "queued", label: "طابور", icon: Inbox, statuses: ["queued", "scheduled"] },
  { key: "scanning", label: "مسح", icon: ScanLine, statuses: ["scanning"] },
  { key: "importing", label: "استيراد", icon: DatabaseZap, statuses: ["importing"] },
  { key: "completed", label: "اكتمل", icon: CheckCircle2, statuses: ["completed", "closed"] },
];

function stepIndex(status: string): number {
  const i = STEPS.findIndex((s) => s.statuses.includes(status));
  return i === -1 ? 0 : i;
}

export default function ImportClient() {
  const mutate = useMutate();
  const [session, setSession] = useState<ImportSession | null>(null);
  const [queuePosition, setQueuePosition] = useState(0);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [customers, setCustomers] = useState<ImportedCustomer[]>([]);
  const [memoriesBuilt, setMemoriesBuilt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const resultsLoadedFor = useRef<string | null>(null);
  const [waStatus, setWaStatus] = useState<string | null>(null);
  // /api/whatsapp/status reports mode:"bridge" for a Bridge-transport tenant.
  // Import pairs over the QR transport, which such a tenant does not use.
  const [waMode, setWaMode] = useState<string | null>(null);
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState(false);

  const loadSession = useCallback(async () => {
    try {
      const r = await fetch("/api/import", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setSession(j.session || null);
        setQueuePosition(j.queuePosition || 0);
        setLogs(j.logs || []);
      }
    } catch {} finally { setLoaded(true); }
  }, []);

  const loadResults = useCallback(async () => {
    try {
      const r = await fetch("/api/import/results", { cache: "no-store" });
      const j = await r.json();
      if (j.ok) {
        setCustomers(j.customers || []);
        setMemoriesBuilt(j.memoriesBuilt || 0);
        if (j.session) setSession((prev) => prev ?? j.session);
      }
    } catch {}
  }, []);

  // ── The one-time import reads from a connected WhatsApp session ──
  const checkWa = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/status", { cache: "no-store" });
      const j = await r.json();
      setWaStatus(j.status || null);
      setWaMode(j.mode || null);
      setWaQr(j.status === "connected" ? null : (j.qr || null));
    } catch {}
  }, []);

  async function connectWa() {
    setWaBusy(true);
    try {
      if (!(await mutate("/api/whatsapp/start", { method: "POST" }))) return;
      await checkWa();
    } catch {} finally { setWaBusy(false); }
  }

  useEffect(() => { loadSession(); }, [loadSession]);
  useEffect(() => { checkWa(); }, [checkWa]);
  useEffect(() => {
    if (waStatus === "connected") return;
    const t = setInterval(checkWa, 3000);
    return () => clearInterval(t);
  }, [waStatus, checkWa]);

  // Poll every 3s while the import is in progress.
  useEffect(() => {
    if (!session || !IN_PROGRESS.has(session.status)) return;
    const t = setInterval(loadSession, 3000);
    return () => clearInterval(t);
  }, [session, loadSession]);

  // Load results once when the import is done.
  useEffect(() => {
    if (session && DONE.has(session.status) && resultsLoadedFor.current !== session.id) {
      resultsLoadedFor.current = session.id;
      loadResults();
    }
  }, [session, loadResults]);

  async function start() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/import", { method: "POST" });
      const j = await r.json();
      if (j.ok) {
        setSession(j.session || null);
        if (j.alreadyExists) setMsg({ ok: true, text: "الاستيراد موجود بالفعل لهذا الحساب." });
        else setMsg({ ok: true, text: "تم بدء الاستيراد ودخوله في طابور الـ QR." });
        loadSession();
      } else {
        setMsg({ ok: false, text: j.detail || j.error || "تعذّر بدء الاستيراد" });
      }
    } catch { setMsg({ ok: false, text: "خطأ في الشبكة" }); }
    finally { setBusy(false); }
  }

  const status = session?.status || null;
  const inProgress = !!status && IN_PROGRESS.has(status);
  const done = !!status && DONE.has(status);
  const failed = status === "failed";
  // A transport that cannot do the operation at all — distinct from a run that
  // failed and is worth retrying.
  const unsupportedTransport = !!session?.error?.startsWith("import_unsupported_on_");
  // The big button is disabled once a session exists and is not failed.
  const serviceDown = waStatus === "service_unreachable";
  // A Bridge tenant links WhatsApp from the Bridge page, not from here.
  // /api/whatsapp/start refuses them with 409 and an explanation; showing a
  // pairing button that can only ever produce that refusal is a dead control.
  const bridgeMode = waMode === "bridge";
  const startDisabled = busy || (!!session && !failed) || unsupportedTransport || waStatus !== "connected";

  return (
    <div className="space-y-6">
      {/* ── Step 0: connect WhatsApp (required to read your data) ── */}
      {waStatus !== "connected" && !done && (
        <div className="card p-6 border border-amber-500/20">
          <h2 className="font-bold text-lg flex items-center gap-2 mb-1">
            <ScanLine className="h-5 w-5 text-amber-300" /> الخطوة 1: اربط واتساب لسحب بياناتك
          </h2>
          <p className="text-sm text-slate-400 mb-4">
            الاستيراد بيقرأ جهات اتصالك ومحادثاتك من جلسة واتساب متصلة. اربط رقمك مرة واحدة بمسح الكود،
            وبعد ما يكتمل الاستيراد ترجع لقناة Meta الرسمية.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            {waQr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={waQr} alt="QR" width={200} height={200} className="rounded-xl bg-white p-2 shrink-0" />
            ) : bridgeMode ? (
              <a
                href="/dashboard/settings/bridge"
                className="btn-primary justify-center shrink-0 no-underline"
              >
                <ScanLine className="h-4 w-4" />
                اذهب لصفحة Bridge للربط
              </a>
            ) : serviceDown ? (
              // The pairing service is not answering, so there is no code to
              // show and never will be until it is back. Offering an enabled
              // button here produced a click that silently did nothing — the
              // worst of both worlds, since the merchant cannot tell whether
              // they mis-clicked or the product is broken.
              <div className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] px-4 py-3 text-sm text-rose-200 shrink-0">
                <XCircle className="h-4 w-4 shrink-0" />
                <span>خدمة الربط غير متاحة حاليًا</span>
              </div>
            ) : (
              <button onClick={connectWa} disabled={waBusy} className="btn-primary justify-center disabled:opacity-50">
                {waBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                إظهار كود الربط
              </button>
            )}
            <div className="text-xs text-slate-400 space-y-1">
              {bridgeMode ? (
                <p className="text-slate-300">
                  حسابك بيشتغل عبر KEYONE Bridge، والربط بيتم من صفحة Bridge مش من هنا.
                  اربط جهازك الأول، وبعدها ارجع تكمّل الاستيراد.
                </p>
              ) : serviceDown ? (
                <p className="text-rose-200/90">
                  تعذّر الوصول لخدمة ربط واتساب، فمش هينفع نقرأ جهات اتصالك دلوقتي. جرّب تاني بعد شوية،
                  ولو استمرت المشكلة كلّم الدعم.
                </p>
              ) : (
                <p>افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← امسح الكود.</p>
              )}
              <p>
                الحالة الحالية:{" "}
                <span className={serviceDown ? "text-rose-200" : "text-slate-200"}>
                  {STATUS_AR[waStatus || ""] || waStatus || "غير متصل"}
                </span>
              </p>
              {waQr && <p className="text-amber-300/80">في انتظار المسح…</p>}
            </div>
          </div>
        </div>
      )}
      {waStatus === "connected" && !done && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> واتساب متصل — تقدر تبدأ الاستيراد دلوقتي.
        </div>
      )}
      {/* ── Import Dashboard: the one-time start action ── */}
      <div className="card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <h2 className="font-bold text-lg flex items-center gap-2 mb-1">
              <DownloadCloud className="h-5 w-5 text-brand-300" /> استيراد لمرة واحدة
            </h2>
            <p className="text-sm text-slate-400">
              {unsupportedTransport
                ? "الاستيراد بيسحب جهات الاتصال والمحادثات من جلسة واتساب متصلة عبر QR. حسابك مش على القناة دي، فالعملية مش متاحة — من غير ما ده يأثر على باقي مزايا حسابك."
                : "عند الضغط، نحجز جلسة الواتساب الخاصة بك داخل طابور الـ QR، ثم نسحب جهات الاتصال وآخر المحادثات ونحوّلها إلى سجلات عملاء دائمة وذاكرة للذكاء الاصطناعي. لا تُرسَل أي رسالة أثناء الاستيراد."}
            </p>
            {!unsupportedTransport && (
              <p className="text-xs text-amber-300/90 mt-2 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> هذه العملية متاحة مرة واحدة فقط لكل حساب — بعد اكتمالها تُغلق نهائيًا ولا يمكن تكرارها.
              </p>
            )}
          </div>
          <button
            onClick={start}
            disabled={startDisabled}
            className="btn-primary justify-center disabled:opacity-50 shrink-0"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
            {unsupportedTransport
              ? "غير متاح على قناتك الحالية"
              : failed
                ? "إعادة محاولة الاستيراد"
                : "ابدأ الاستيراد (مرة واحدة)"}
          </button>
        </div>

        {msg && (
          <div className={`mt-4 text-sm flex items-center gap-1.5 ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {msg.text}
          </div>
        )}

        {loaded && !session && (
          <div className="mt-4 rounded-xl bg-white/[0.03] p-3 text-xs text-slate-400">
            لم تبدأ أي عملية استيراد بعد. اضغط الزر بالأعلى للبدء.
          </div>
        )}

        {done && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> اكتمل الاستيراد وأُغلق نهائيًا. بياناتك السابقة الآن داخل النظام.
          </div>
        )}
        {failed && unsupportedTransport && (
          // Not a failure the merchant can retry away — the transport they are on
          // cannot read contacts at all. Saying "فشل الاستيراد … يمكنك إعادة
          // المحاولة" here invites them to retry forever, which is exactly what
          // the QR-queue timeline used to do.
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-3 text-sm text-amber-200 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              {session?.error === "import_unsupported_on_bridge"
                ? "الاستيراد بيقرأ جهات اتصالك من جلسة QR متصلة، وده مش متاح على KEYONE Bridge. باقي مزايا Bridge شغّالة عادي."
                : "الاستيراد بيقرأ جهات اتصالك من جلسة QR متصلة، وده مش متاح على قناة Meta الرسمية."}
            </span>
          </div>
        )}
        {failed && !unsupportedTransport && (
          <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-sm text-rose-200 flex items-center gap-2">
            <XCircle className="h-4 w-4" /> فشل الاستيراد{session?.error ? ` (${session.error})` : ""}. يمكنك إعادة المحاولة.
          </div>
        )}
      </div>

      {/* ── Import Progress: status stepper ── */}
      {session && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-5 gap-2 flex-wrap">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 text-brand-300 ${inProgress ? "animate-spin" : ""}`} /> تقدّم الاستيراد
            </h2>
            {inProgress && session.status === "queued" && queuePosition > 0 && (
              <span className="text-xs rounded-full bg-amber-500/20 text-amber-300 px-2.5 py-0.5">
                ترتيبك في الطابور: {queuePosition}
              </span>
            )}
            {inProgress && session.status !== "queued" && (
              <span className="text-xs rounded-full bg-brand-500/20 text-brand-200 px-2.5 py-0.5">جارٍ المعالجة…</span>
            )}
          </div>
          <Stepper status={session.status} />
          {logs.length > 0 && (
            <div className="mt-5 border-t border-white/5 pt-3">
              <div className="text-xs text-slate-400 mb-2">آخر السجلّات</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {logs.map((l) => (
                  <div key={l.id} className="flex items-start gap-2 text-xs">
                    <span className={
                      l.level === "error" ? "text-rose-400" : l.level === "warn" ? "text-amber-400" : "text-slate-500"
                    }>•</span>
                    <span className="text-slate-500 whitespace-nowrap">
                      {new Date(l.createdAt).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-slate-300">{l.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Import Results: counts ── */}
      {session && (done || inProgress) && (
        <div className="card p-5">
          <h2 className="font-bold text-lg mb-4">نتائج الاستيراد</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat icon={<Users className="h-5 w-5 text-sky-300" />} label="جهات الاتصال" value={session.contactsImported} sub={`من ${session.contactsFound}`} />
            <Stat icon={<MessageSquare className="h-5 w-5 text-brand-300" />} label="المحادثات" value={session.conversationsImported} />
            <Stat icon={<Inbox className="h-5 w-5 text-slate-300" />} label="الرسائل" value={session.messagesImported} />
            <Stat icon={<Users className="h-5 w-5 text-emerald-300" />} label="عملاء جدد" value={session.customersCreated} />
            <Stat icon={<Brain className="h-5 w-5 text-violet-300" />} label="ذاكرة مبنية" value={done ? memoriesBuilt || session.memoriesBuilt : session.memoriesBuilt} />
            <Stat icon={<DatabaseZap className="h-5 w-5 text-amber-300" />} label="إجمالي مستورد" value={session.contactsImported + session.conversationsImported} />
          </div>
        </div>
      )}

      {/* ── Imported Customers table ── */}
      {done && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Users className="h-4 w-4 text-emerald-300" /> العملاء المستوردون
            </h2>
            <span className="text-xs text-slate-500">{session?.conversationsImported || 0} محادثة مستوردة</span>
          </div>
          {customers.length === 0 ? (
            <div className="text-slate-500 text-sm py-6 text-center">لا توجد سجلات عملاء مستوردة.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-white/5">
                    <th className="text-right p-2">الاسم</th>
                    <th className="text-right p-2">الرقم</th>
                    <th className="text-right p-2">أُضيف في</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id} className="border-t border-white/5">
                      <td className="p-2 font-semibold">{c.name || "—"}</td>
                      <td className="p-2 font-mono text-slate-300 whitespace-nowrap" dir="ltr">{c.phone}</td>
                      <td className="p-2 text-slate-500 whitespace-nowrap">{new Date(c.createdAt).toLocaleDateString("ar-EG")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {customers.length >= 50 && (
                <p className="text-xs text-slate-500 mt-3">تُعرض أول 50 سجلًا فقط — البقية متاحة في صفحة العملاء.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({ status }: { status: string }) {
  const active = stepIndex(status);
  const isFailed = status === "failed";
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const Icon = step.icon;
        const reached = i <= active && !isFailed;
        const current = i === active && !isFailed && !DONE.has(status);
        return (
          <div key={step.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div className={
                "flex h-9 w-9 items-center justify-center rounded-full border transition-colors " +
                (reached ? "border-brand-400/50 bg-brand-500/20 text-brand-200" : "border-white/10 bg-white/[0.03] text-slate-500")
              }>
                {current ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
              </div>
              <span className={"text-[11px] " + (reached ? "text-slate-200" : "text-slate-500")}>{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={"h-0.5 flex-1 mx-1 rounded " + (i < active && !isFailed ? "bg-brand-400/50" : "bg-white/10")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] p-3">
      <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1.5">{icon}<span>{label}</span></div>
      <div className="text-xl font-extrabold text-white">{(value || 0).toLocaleString("ar-EG")}</div>
      {sub && <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}
