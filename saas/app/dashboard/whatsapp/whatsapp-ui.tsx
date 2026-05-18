"use client";
import { useEffect, useState } from "react";
import { Phone, QrCode, AlertCircle, CheckCircle, Loader2, LogOut, KeyRound, X } from "lucide-react";

type WAState = {
  status: string;
  qr: string | null;
  pairingCode?: string | null;
  phone: string | null;
};

export default function WhatsappUI({ initial }: { initial: any }) {
  const [state, setState] = useState<WAState>({
    status: initial?.whatsappStatus || "disconnected",
    qr: null,
    pairingCode: null,
    phone: initial?.whatsappPhone || null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"qr" | "code">("qr");
  const [pairPhone, setPairPhone] = useState("");

  // Poll status every 2s
  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const r = await fetch("/api/whatsapp/status", { cache: "no-store" });
        if (!r.ok) return;
        const d = await r.json();
        if (!alive) return;
        setState(d);
      } catch {}
    }
    tick();
    const t = setInterval(tick, 2500);
    return () => { alive = false; clearInterval(t); };
  }, []);

  async function start() {
    setBusy(true); setErr("");
    const r = await fetch("/api/whatsapp/start", { method: "POST" });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "خطأ");
      return;
    }
    setState((s) => ({ ...s, status: "connecting" }));
  }

  async function requestCode() {
    if (!pairPhone.trim()) {
      setErr("اكتب رقم الواتساب الكامل بكود الدولة");
      return;
    }
    setBusy(true); setErr("");
    const r = await fetch("/api/whatsapp/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: pairPhone.trim() }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setErr(d.error || "تعذر إنشاء الكود");
      return;
    }
    setState((s) => ({ ...s, pairingCode: d.code, status: "pairing" }));
  }

  async function logout() {
    if (!confirm("متأكد من فصل واتساب؟")) return;
    setBusy(true);
    await fetch("/api/whatsapp/logout", { method: "POST" });
    setBusy(false);
    setState({ status: "disconnected", qr: null, pairingCode: null, phone: null });
    setMode("qr");
    setPairPhone("");
  }

  async function cancel() {
    setBusy(true);
    await fetch("/api/whatsapp/logout", { method: "POST" });
    setBusy(false);
    setState({ status: "disconnected", qr: null, pairingCode: null, phone: null });
    setMode("qr");
    setPairPhone("");
    setErr("");
  }

  const isConnected = state.status === "connected";
  const hasQr = !!state.qr;
  const hasCode = !!state.pairingCode;
  const isConnecting = state.status === "connecting" || state.status === "qr" || state.status === "pairing";
  const serviceDown = state.status === "service_unreachable";

  return (
    <div className="card p-8 max-w-2xl mx-auto text-center">
      {serviceDown && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6 text-right">
          <div className="flex items-start gap-2 text-red-300">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold mb-1">خدمة الواتساب غير متاحة</div>
              <p className="text-sm text-red-200/80 leading-relaxed mb-2">
                شغل خدمة الواتساب أولاً:
              </p>
              <pre className="bg-black/30 px-3 py-2 rounded text-xs overflow-x-auto" dir="ltr">
{`cd whatsapp-service
npm install
npm run dev`}
              </pre>
            </div>
          </div>
        </div>
      )}

      {isConnected ? (
        <div>
          <div className="w-20 h-20 mx-auto rounded-full bg-brand-500/20 flex items-center justify-center mb-4">
            <CheckCircle className="w-10 h-10 text-brand-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">متصل ✓</h2>
          <p className="text-slate-400 mb-6">
            رقم البوت: <span className="font-mono text-white" dir="ltr">+{state.phone}</span>
          </p>
          <p className="text-sm text-slate-500 mb-6">
            البوت جاهز. أي رسالة تيجي على الرقم ده هيرد عليها تلقائياً.
          </p>
          <button onClick={logout} disabled={busy} className="btn-ghost">
            <LogOut className="w-4 h-4" />
            فصل واتساب
          </button>
        </div>
      ) : hasCode ? (
        <div>
          <h2 className="text-xl font-bold mb-2">اكتب الكود ده في واتساب</h2>
          <p className="text-slate-400 text-sm mb-6">
            في واتساب: ⋮ ← الأجهزة المرتبطة ← ربط جهاز ← <b>الربط برقم الهاتف بدلاً من ذلك</b>
          </p>
          <div className="inline-block bg-white text-black px-8 py-6 rounded-2xl mb-4">
            <div className="font-mono text-4xl font-bold tracking-[0.5em]">
              {state.pairingCode!.match(/.{1,4}/g)?.join("-")}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>في انتظار إدخال الكود...</span>
          </div>
          <button onClick={cancel} disabled={busy} className="btn-ghost text-sm">
            <X className="w-4 h-4" />
            إلغاء الربط
          </button>
        </div>
      ) : hasQr ? (
        <div>
          <h2 className="text-xl font-bold mb-2">امسح الكود من واتساب</h2>
          <p className="text-slate-400 text-sm mb-6">
            افتح واتساب → ⋮ → الأجهزة المرتبطة → ربط جهاز
          </p>
          <div className="inline-block bg-white p-4 rounded-2xl mb-4">
            <img src={state.qr!} alt="QR" className="w-64 h-64" />
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400 mb-4">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>في انتظار المسح...</span>
          </div>
          <div className="border-t border-white/10 pt-4 mt-4 space-y-2">
            <p className="text-sm text-amber-300 mb-2">
              ⚠️ ظهر "Can't link new device right now"؟
            </p>
            <button onClick={() => setMode("code")} className="btn-ghost text-sm">
              <KeyRound className="w-4 h-4" />
              جرّب الربط بكود من 8 أرقام بدلاً من ذلك
            </button>
            <button onClick={cancel} disabled={busy} className="btn-ghost text-sm">
              <X className="w-4 h-4" />
              إلغاء الربط
            </button>
          </div>
        </div>
      ) : isConnecting && mode === "qr" ? (
        <div>
          <Loader2 className="w-12 h-12 mx-auto text-brand-400 animate-spin mb-4" />
          <h2 className="text-xl font-bold mb-2">جاري التحضير...</h2>
          <p className="text-slate-400 text-sm mb-6">QR code هيظهر خلال ثواني</p>
          <button onClick={cancel} disabled={busy} className="btn-ghost text-sm">
            <X className="w-4 h-4" />
            إلغاء
          </button>
        </div>
      ) : mode === "code" ? (
        <div>
          <div className="w-20 h-20 mx-auto rounded-2xl bg-brand-500/10 border border-brand-500/30 flex items-center justify-center mb-4">
            <KeyRound className="w-10 h-10 text-brand-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">الربط بكود من 8 أرقام</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            اكتب رقم الواتساب اللي عايز تربطه (بكود الدولة كامل، مثلاً <span dir="ltr" className="font-mono">+201234567890</span>)
          </p>
          <input
            type="tel"
            dir="ltr"
            value={pairPhone}
            onChange={(e) => setPairPhone(e.target.value)}
            placeholder="+201234567890"
            className="input text-center text-lg font-mono mb-4"
          />
          {err && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 rounded-xl mb-4">
              {err}
            </div>
          )}
          <button onClick={requestCode} disabled={busy || serviceDown} className="btn-primary w-full">
            <KeyRound className="w-4 h-4" />
            {busy ? "جاري الإنشاء..." : "اطلب كود الربط"}
          </button>
          <button onClick={() => { setMode("qr"); setErr(""); }} className="btn-ghost mt-2 text-sm w-full">
            <QrCode className="w-4 h-4" />
            استخدم QR بدلاً من ذلك
          </button>
          <div className="mt-8 text-sm text-slate-400 space-y-2 text-right">
            <h3 className="font-bold text-white mb-2">الخطوات:</h3>
            <div>1. اكتب رقمك واطلب الكود</div>
            <div>2. افتح واتساب → ⋮ ← الأجهزة المرتبطة ← ربط جهاز</div>
            <div>3. اضغط <b>"الربط برقم الهاتف بدلاً من ذلك"</b> أسفل الـ QR</div>
            <div>4. اكتب الكود اللي هيظهر هنا</div>
          </div>
        </div>
      ) : (
        <div>
          <div className="w-64 h-64 mx-auto rounded-2xl bg-white/5 border-2 border-dashed border-white/10 flex items-center justify-center mb-6">
            <div className="text-center text-slate-500">
              <QrCode className="w-16 h-16 mx-auto mb-3 opacity-50" />
              <p className="text-sm">اضغط الزر للبدء</p>
            </div>
          </div>
          {err && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 rounded-xl mb-4">
              {err}
            </div>
          )}
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <button onClick={start} disabled={busy || serviceDown} className="btn-primary">
              <QrCode className="w-4 h-4" />
              {busy ? "جاري البدء..." : "الربط بـ QR Code"}
            </button>
            <button onClick={() => setMode("code")} disabled={busy || serviceDown} className="btn-ghost">
              <KeyRound className="w-4 h-4" />
              الربط بكود من 8 أرقام
            </button>
          </div>
          <div className="mt-8 text-sm text-slate-400 space-y-2 text-right">
            <h3 className="font-bold text-white mb-2">طريقتين متاحة:</h3>
            <div><b>QR Code:</b> امسح كود من شاشة الكمبيوتر بكاميرا الموبايل</div>
            <div><b>Pairing Code:</b> 8 أرقام تكتبهم في واتساب (لو الـ QR مش شغال)</div>
          </div>
        </div>
      )}
    </div>
  );
}
