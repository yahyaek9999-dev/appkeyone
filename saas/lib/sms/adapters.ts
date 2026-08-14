// K1SMS — provider adapters (pluggable, credential-gated)
// Adding a new SMS carrier = implement SmsAdapter + register in ADAPTERS.

import type { SmsAdapter, SendSmsInput, SendSmsResult, ProviderCreds } from "./types";

// ─── Manual / stub adapter (always available, no credentials needed) ──────────

const manualAdapter: SmsAdapter = {
  type: "custom",
  async send(input: SendSmsInput): Promise<SendSmsResult> {
    return { ok: false, detail: "المزوّد اليدوي — لا يرسل فعلياً. استبدله بمزوّد SMS حقيقي." };
  },
  async test(): Promise<{ ok: boolean; detail: string }> {
    return { ok: true, detail: "مزوّد stub — يقبل الرسائل محلياً دون إرسال فعلي." };
  },
};

// ─── Unifonic ─────────────────────────────────────────────────────────────────

const uniconicAdapter: SmsAdapter = {
  type: "unifonic",
  async send(input: SendSmsInput, creds: ProviderCreds): Promise<SendSmsResult> {
    if (!creds.apiKey) return { ok: false, detail: "AppSid مطلوب لـ Unifonic" };
    try {
      const params = new URLSearchParams({
        AppSid: creds.apiKey,
        SenderID: creds.senderId || "KEYONE",
        Body: input.body,
        Recipient: input.to,
        responseType: "JSON",
      });
      const res = await fetch("https://api.unifonic.com/rest/SMS/messages", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const json: any = await res.json().catch(() => ({}));
      if (json.Success) {
        return { ok: true, providerMsgId: String(json.data?.MessageID || ""), segments: 1, detail: "تم الإرسال" };
      }
      return { ok: false, detail: json.Message || "فشل الإرسال" };
    } catch (e: any) {
      return { ok: false, detail: e?.message || "خطأ في الشبكة" };
    }
  },
  async test(creds: ProviderCreds): Promise<{ ok: boolean; detail: string }> {
    if (!creds.apiKey) return { ok: false, detail: "AppSid مطلوب" };
    return { ok: true, detail: "تحقق من الاتصال يتطلب إرسالاً تجريبياً (يستهلك رصيداً). المفاتيح محفوظة." };
  },
};

// ─── Msegat ───────────────────────────────────────────────────────────────────

const msegatAdapter: SmsAdapter = {
  type: "msegat",
  async send(input: SendSmsInput, creds: ProviderCreds): Promise<SendSmsResult> {
    if (!creds.apiKey || !creds.apiSecret) return { ok: false, detail: "UserName و apiKey مطلوبان لـ Msegat" };
    try {
      const body = JSON.stringify({
        userName: creds.apiSecret,
        apiKey: creds.apiKey,
        numbers: input.to.replace("+", ""),
        userSender: creds.senderId || "KEYONE",
        msg: input.body,
      });
      const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      const text = await res.text();
      if (text === "1" || text.startsWith("1|")) {
        return { ok: true, segments: 1, detail: "تم الإرسال" };
      }
      return { ok: false, detail: `Msegat: ${text.slice(0, 80)}` };
    } catch (e: any) {
      return { ok: false, detail: e?.message || "خطأ في الشبكة" };
    }
  },
  async test(creds: ProviderCreds): Promise<{ ok: boolean; detail: string }> {
    if (!creds.apiKey || !creds.apiSecret) return { ok: false, detail: "UserName وApiKey مطلوبان" };
    return { ok: true, detail: "المفاتيح محفوظة. الإرسال التجريبي يستهلك رصيداً." };
  },
};

// ─── Custom / generic HTTP ────────────────────────────────────────────────────

const customAdapter: SmsAdapter = {
  type: "custom",
  async send(input: SendSmsInput, creds: ProviderCreds): Promise<SendSmsResult> {
    if (!creds.endpoint || !creds.apiKey) return { ok: false, detail: "Endpoint وApiKey مطلوبان للمزوّد المخصص" };
    try {
      const res = await fetch(creds.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${creds.apiKey}` },
        body: JSON.stringify({ to: input.to, message: input.body, sender: creds.senderId }),
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) return { ok: true, segments: 1, detail: "تم الإرسال" };
      return { ok: false, detail: `HTTP ${res.status}` };
    } catch (e: any) {
      return { ok: false, detail: e?.message || "خطأ في الشبكة" };
    }
  },
  async test(creds: ProviderCreds): Promise<{ ok: boolean; detail: string }> {
    if (!creds.endpoint) return { ok: false, detail: "Endpoint مطلوب" };
    return { ok: true, detail: "endpoint محفوظ" };
  },
};

const ADAPTERS: Record<string, SmsAdapter> = {
  unifonic: uniconicAdapter,
  msegat: msegatAdapter,
  custom: customAdapter,
  // twilio / vonage / clicksend follow same pattern — add adapters when creds available
};

export function getAdapter(type: string): SmsAdapter {
  return ADAPTERS[type] ?? manualAdapter;
}
