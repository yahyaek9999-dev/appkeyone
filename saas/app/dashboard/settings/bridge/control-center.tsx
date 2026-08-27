"use client";

// KEYONE Bridge — Dashboard control center. The customer manages EVERYTHING here
// and only ever installs the Bridge app. Polls /api/bridge/v1/overview and drives
// the Bridge via /api/bridge/v1/control. Covers status, connected device, QR,
// connection controls, updates, diagnostics, logs, empty states, and onboarding.

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutate } from "@/components/ui/use-mutate";
import { useRouter } from "next/navigation";
import type { BridgeOverview, BridgeView, BridgeStatus } from "@/lib/bridge/overview";
import { QrImage } from "./qr-code";
import { useConfirm } from "@/components/ui/confirm-dialog";

const STATUS: Record<BridgeStatus, { text: string; dot: string; cls: string; pulse: boolean }> = {
  online:     { text: "متصل",         dot: "bg-emerald-400", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", pulse: false },
  connecting: { text: "جارٍ الاتصال",  dot: "bg-amber-400",   cls: "bg-amber-500/15 text-amber-300 border-amber-500/30",     pulse: true  },
  updating:   { text: "جارٍ التحديث",  dot: "bg-sky-400",     cls: "bg-sky-500/15 text-sky-300 border-sky-500/30",           pulse: true  },
  offline:    { text: "غير متصل",      dot: "bg-slate-500",   cls: "bg-slate-500/15 text-slate-400 border-white/10",         pulse: false },
  error:      { text: "خطأ",          dot: "bg-rose-400",    cls: "bg-rose-500/15 text-rose-300 border-rose-500/30",        pulse: false },
};

function fmt(d: string | null): string {
  if (!d) return "—";
  try { return new Date(d).toLocaleString("ar-EG"); } catch { return "—"; }
}

export function BridgeControlCenter({ initial, downloadHref }: { initial: BridgeOverview; downloadHref: string }) {
  const [ov, setOv] = useState<BridgeOverview>(initial);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/bridge/v1/overview", { cache: "no-store" });
      if (r.ok) setOv(await r.json());
    } catch { /* keep last */ }
  }, []);

  useEffect(() => {
    const id = setInterval(poll, 4000);
    return () => clearInterval(id);
  }, [poll]);

  if (ov.bridges.length === 0) {
    return <Onboarding downloadHref={downloadHref} step={0} />;
  }

  return (
    <div className="space-y-5">
      {ov.bridges.map((b) => (
        <BridgeCard key={b.id} b={b} latest={ov.latestVersion} releaseUrl={ov.releaseUrl} onChange={poll} />
      ))}
      <p className="text-xs text-slate-500">
        يتم التحديث تلقائياً كل بضع ثوانٍ. لست بحاجة لفتح تطبيق Bridge — كل شيء يُدار من هنا.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BridgeCard({
  b, latest, releaseUrl, onChange,
}: { b: BridgeView; latest: string | null; releaseUrl: string | null; onChange: () => void }) {
  const mutate = useMutate();
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const st = STATUS[b.status];
  const wa = b.whatsapp;
  const waConnected = wa?.state === "connected";
  const updateAvailable = !!latest && latest.replace(/^v/, "") !== (b.version || "").replace(/^v/, "");

  async function control(action: string, confirmText?: string) {
    if (confirmText) {
      const ok = await confirm({ title: confirmText, confirmLabel: "تأكيد", danger: true });
      if (!ok) return;
    }
    setMsg(null); setBusy(action);
    try {
      const r = await fetch("/api/bridge/v1/control", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bridge_id: b.id, action }),
      });
      const j = await r.json().catch(() => ({}));
      setMsg(r.ok ? { ok: true, text: "تم إرسال الأمر ✓" } : { ok: false, text: j?.error || `فشل (${r.status})` });
      await onChange();
    } catch {
      setMsg({ ok: false, text: "تعذّر الاتصال بالخادم." });
    } finally { setBusy(null); }
  }

  async function unlink() {
    const ok = await confirm({
      title: "فصل الجهاز نهائياً؟",
      body: "سيتم فصل هذا الجهاز نهائياً وإبطال رموزه.",
      confirmLabel: "فصل",
      danger: true,
    });
    if (!ok) return;
    setBusy("unlink");
    try {
      if (!(await mutate("/api/bridge/v1/revoke", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bridge_id: b.id }),
      }))) return;
      await onChange(); router.refresh();
    } finally { setBusy(null); }
  }

  return (
    <div className="card p-5 space-y-5">
      {/* Header: name + status + primary */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold ${st.cls}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${st.pulse ? "animate-pulse" : ""}`} />
            {st.text}
          </span>
          <span className="font-bold text-white">{b.name}</span>
          {b.isPrimary && (
            <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-300">الأساسي</span>
          )}
        </div>
      </div>

      {b.lastError && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          ⚠️ {b.lastError}
        </div>
      )}

      {/* Connected device */}
      <Section title="الجهاز المتصل">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <Meta label="اسم الجهاز" value={b.name} />
          <Meta label="إصدار Bridge" value={b.version || "—"} />
          <Meta label="نظام التشغيل" value={b.os || "—"} />
          <Meta label="المعمارية" value={b.arch || "—"} />
          <Meta label="آخر نبضة" value={fmt(b.lastHeartbeatAt)} />
          <Meta label="آخر ظهور" value={b.lastSeenLabel || "—"} />
        </div>
      </Section>

      {/* WhatsApp connection + QR */}
      <Section title="اتصال واتساب">
        {waConnected ? (
          <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
            <div className="text-sm">
              <div className="font-bold text-emerald-200">واتساب متصل</div>
              <div className="text-slate-300">{wa?.identity || "—"}</div>
            </div>
            <span className="text-2xl">✅</span>
          </div>
        ) : wa?.hasQr && wa.qr ? (
          <QrPanel qr={wa.qr} remainingMs={wa.qrRemainingMs} onRefresh={() => control("start_qr")} busy={busy === "start_qr"} />
        ) : wa?.state === "linking" ? (
          // Session is live but this instant is between WhatsApp Web's ~20s code
          // rotations — the next live code arrives on the next poll. Never show a
          // dead code (that is what caused "Check your connection and try again").
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 text-sm text-slate-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" />
            جارٍ توليد رمز QR جديد… أبقِ هذه الصفحة مفتوحة.
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
            <p className="text-sm text-slate-300">
              {b.status === "offline"
                ? "الجهاز غير متصل — شغّل Bridge على جهازك أولاً."
                : "لا يوجد رقم واتساب مرتبط بعد. اضغط لبدء الربط وعرض رمز QR."}
            </p>
            <button
              type="button" disabled={b.status === "offline" || busy === "start_qr"}
              onClick={() => control("start_qr")}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "start_qr" ? "…" : "بدء الربط / عرض QR"}
            </button>
          </div>
        )}
      </Section>

      {/* Connection controls */}
      <Section title="التحكم بالاتصال">
        <div className="flex flex-wrap items-center gap-2">
          <Btn onClick={() => control("start_qr")} busy={busy === "start_qr"} disabled={b.status === "offline"} kind="primary">اتصال / QR</Btn>
          <Btn onClick={() => control("disconnect")} busy={busy === "disconnect"} disabled={!waConnected} kind="ghost">قطع اتصال واتساب</Btn>
          <Btn onClick={() => control("reconnect")} busy={busy === "reconnect"} disabled={b.status === "offline"} kind="ghost">إعادة الاتصال</Btn>
          <Btn onClick={() => control("restart")} busy={busy === "restart"} disabled={b.status === "offline"} kind="ghost">إعادة تشغيل Bridge</Btn>
          <Btn onClick={unlink} busy={busy === "unlink"} kind="danger">فصل الجهاز</Btn>
        </div>
      </Section>

      {/* Update management */}
      <Section title="التحديثات">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
          <div className="text-sm">
            <div className="text-slate-300">الإصدار الحالي: <b className="text-slate-100">{b.version || "—"}</b></div>
            <div className="text-slate-400">
              أحدث إصدار: <b className="text-slate-200">{latest || "—"}</b>
              {releaseUrl && <a href={releaseUrl} target="_blank" rel="noreferrer" className="ms-2 text-sky-300 underline">التفاصيل</a>}
            </div>
          </div>
          {b.updating ? (
            <span className="inline-flex items-center gap-2 text-sm text-sky-300">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky-400" /> جارٍ التحديث…
            </span>
          ) : updateAvailable ? (
            <Btn onClick={() => control("update")} busy={busy === "update"} disabled={b.status === "offline"} kind="primary">تحديث بنقرة واحدة</Btn>
          ) : (
            <span className="text-sm text-emerald-300">محدّث ✓</span>
          )}
        </div>
      </Section>

      {/* Diagnostics */}
      <Section title="التشخيص">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Diag label="خدمة KEYONE" ok={b.diagnostics.cloudApi === "ok"} />
          <Diag label="اتصال Bridge" ok={b.diagnostics.bridge === "online"} warn={b.diagnostics.bridge !== "online"} />
          <Diag label="اتصال واتساب" ok={b.diagnostics.whatsapp === "connected"} warn={b.diagnostics.whatsapp === "linking"} />
        </div>
      </Section>

      {/* Logs */}
      <LogsPanel bridgeId={b.id} />

      {msg && <p className={msg.ok ? "text-emerald-300 text-xs" : "text-rose-300 text-xs"}>{msg.text}</p>}
    </div>
  );
}

// ---- QR panel with expiration countdown -----------------------------------

function QrPanel({ qr, remainingMs, onRefresh, busy }: { qr: string; remainingMs: number; onRefresh: () => void; busy: boolean }) {
  // Count down from the code's REAL remaining lifetime (Bridge-streamed expiry),
  // not a fixed 60s. A new live code replaces this one via polling before it dies.
  const [remaining, setRemaining] = useState(Math.max(0, Math.round(remainingMs / 1000)));
  useEffect(() => { setRemaining(Math.max(0, Math.round(remainingMs / 1000))); }, [remainingMs, qr]);
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => Math.max(0, r - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  const expired = remaining <= 0;
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-4 sm:flex-row sm:items-start">
      <QrImage data={qr} />
      <div className="space-y-2 text-sm">
        <div className="font-bold text-slate-100">امسح رمز QR بتطبيق واتساب</div>
        <ol className="list-decimal space-y-0.5 pe-4 text-slate-300">
          <li>افتح واتساب على هاتفك</li>
          <li>الإعدادات ← الأجهزة المرتبطة</li>
          <li>ربط جهاز ← امسح هذا الرمز</li>
        </ol>
        <div className={expired ? "text-rose-300" : "text-slate-400"}>
          {expired ? "انتهت صلاحية الرمز." : `تنتهي الصلاحية خلال ${remaining} ثانية`}
        </div>
        <button type="button" onClick={onRefresh} disabled={busy}
          className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-200 hover:bg-sky-500/20 disabled:opacity-40">
          {busy ? "…" : "تحديث الرمز"}
        </button>
      </div>
    </div>
  );
}

// ---- Logs panel ------------------------------------------------------------

function LogsPanel({ bridgeId }: { bridgeId: string }) {
  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<{ at: string; level: string; message: string }[]>([]);
  const boxRef = useRef<HTMLPreElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/bridge/v1/logs?bridgeId=${encodeURIComponent(bridgeId)}`, { cache: "no-store" });
      if (r.ok) { const j = await r.json(); setLines(j.lines || []); }
    } catch { /* keep */ }
  }, [bridgeId]);

  useEffect(() => {
    if (!open) return;
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [open, load]);

  const text = lines.map((l) => `${l.at} ${l.level.toUpperCase()} ${l.message}`).join("\n");

  return (
    <Section title="السجلات">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200 hover:bg-white/10">
          عرض السجلات المباشرة
        </button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => navigator.clipboard?.writeText(text)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10">نسخ</button>
            <a href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`} download={`bridge-${bridgeId}.log`}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10">تنزيل</a>
            <button type="button" onClick={() => setOpen(false)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:bg-white/10">إخفاء</button>
            <span className="ms-auto inline-flex items-center gap-1 text-[11px] text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> مباشر
            </span>
          </div>
          <pre ref={boxRef} dir="ltr" className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 text-left font-mono text-[11px] leading-relaxed text-slate-300">
            {lines.length === 0 ? "(لا توجد سجلات بعد)" : text}
          </pre>
        </div>
      )}
    </Section>
  );
}

// ---- Onboarding wizard -----------------------------------------------------

function Onboarding({ downloadHref, step }: { downloadHref: string; step: number }) {
  const steps = ["تنزيل", "تثبيت", "تسجيل الدخول", "ربط", "مسح QR", "تم"];
  return (
    <div className="space-y-6">
      <div className="card p-5">
        <h2 className="section-title mb-4">إعداد KEYONE Bridge — خطوة بخطوة</h2>
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-bold ${
                i <= step ? "border-sky-500/40 bg-sky-500/15 text-sky-200" : "border-white/10 bg-white/5 text-slate-500"}`}>{i + 1}</span>
              <span className={i <= step ? "text-slate-200" : "text-slate-500"}>{s}</span>
              {i < steps.length - 1 && <span className="text-slate-600">←</span>}
            </li>
          ))}
        </ol>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <WizardStep n={1} title="نزّل Bridge" body="نزّل تطبيق KEYONE Bridge لنظام جهازك (ويندوز / ماك / لينكس / Docker).">
          <a href={downloadHref} className="btn-primary inline-block">صفحة التنزيل ←</a>
        </WizardStep>
        <WizardStep n={2} title="ثبّت وشغّل" body="ثبّت التطبيق. سيعمل كخدمة في الخلفية — لن تحتاج لفتحه بعد ذلك.">
          <pre dir="ltr" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-xs text-sky-200">keyone-bridge login</pre>
        </WizardStep>
        <WizardStep n={3} title="سجّل الدخول واربط" body="سيعرض التطبيق رمزاً قصيراً. اعتمده من صفحة الربط لتوصيل الجهاز بمساحة عملك.">
          <a href="/dashboard/settings/bridge/link" className="text-sky-300 underline">فتح صفحة ربط الجهاز ←</a>
        </WizardStep>
        <WizardStep n={4} title="امسح QR" body="بعد الربط، اضغط «بدء الربط» هنا وامسح رمز QR بواتساب. انتهيت — كل شيء يُدار من لوحة التحكم.">
          <span className="text-xs text-slate-500">ستظهر أدوات التحكم تلقائياً بمجرد اتصال الجهاز.</span>
        </WizardStep>
      </div>

      <p className="text-xs text-slate-500 border-t border-white/10 pt-3">
        🔒 KEYONE لا يخزّن أبداً بيانات دخول واتساب أو الجلسات — فقط بيانات الحالة ورمز موثوق مُجزّأ.
      </p>
    </div>
  );
}

function WizardStep({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-500/15 text-sm font-bold text-sky-200">{n}</span>
        <h3 className="font-bold text-slate-100">{title}</h3>
      </div>
      <p className="text-sm text-slate-400">{body}</p>
      <div className="pt-1">{children}</div>
    </div>
  );
}

// ---- small building blocks -------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-medium text-slate-100 break-words">{value}</div>
    </div>
  );
}

function Diag({ label, ok, warn }: { label: string; ok: boolean; warn?: boolean }) {
  const color = ok ? "text-emerald-300" : warn ? "text-amber-300" : "text-rose-300";
  const icon = ok ? "✅" : warn ? "⏳" : "❌";
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2 text-sm">
      <span className="text-slate-300">{label}</span>
      <span className={color}>{icon}</span>
    </div>
  );
}

function Btn({
  onClick, busy, disabled, kind, children,
}: { onClick: () => void; busy?: boolean; disabled?: boolean; kind: "primary" | "ghost" | "danger"; children: React.ReactNode }) {
  const cls = kind === "primary"
    ? "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
    : kind === "danger"
    ? "border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
    : "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10";
  return (
    <button type="button" onClick={onClick} disabled={busy || disabled}
      className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
      {busy ? "…" : children}
    </button>
  );
}
