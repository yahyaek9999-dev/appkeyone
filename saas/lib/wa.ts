// Helpers to talk to the whatsapp-web.js microservice from Next.js
const BASE = process.env.WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001";
const SECRET = process.env.SAAS_INTERNAL_SECRET || "dev-internal-secret-change-me";

async function call(path: string, init?: RequestInit) {
  try {
    const res = await fetch(BASE + path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SECRET,
        ...(init?.headers || {}),
      },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

export const wa = {
  start: (userId: string) => call(`/sessions/${userId}/start`, { method: "POST" }),
  status: (userId: string) => call(`/sessions/${userId}/status`),
  pair: (userId: string, phone: string) =>
    call(`/sessions/${userId}/pair`, { method: "POST", body: JSON.stringify({ phone }) }),
  send: (userId: string, to: string, text: string) =>
    call(`/sessions/${userId}/send`, { method: "POST", body: JSON.stringify({ to, text }) }),
  logout: (userId: string) => call(`/sessions/${userId}`, { method: "DELETE" }),
};
