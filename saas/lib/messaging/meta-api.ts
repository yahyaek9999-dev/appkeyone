/**
 * Meta Cloud API — Graph API client.
 *
 * Thin wrapper around graph.facebook.com/v20.0. Stays small on purpose:
 *   - One fetch helper with timeouts + structured errors.
 *   - Pure functions, no Prisma dependency — easier to test.
 *   - Caller decrypts secrets and passes them in. We never read tokens
 *     from environment at this layer.
 *
 * NOTE: Meta versions the Graph API. We pin v20.0 (Sept 2024) because it's
 * the lowest version that supports the message_template_status_update
 * webhook field, which we need for Phase 2 template sync. Bumping the
 * version later is one constant change here — no call-site changes.
 */

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const DEFAULT_TIMEOUT_MS = 15_000;

export interface GraphResult<T = any> {
  ok: boolean;
  status: number;
  data?: T;
  errorCode?: string;
  errorDetail?: string;
}

async function graphFetch<T = any>(
  url: string,
  init: RequestInit & { token: string; timeoutMs?: number }
): Promise<GraphResult<T>> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${init.token}`,
        ...(init.headers || {}),
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let parsed: any = {};
    try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { raw: text }; }
    if (!res.ok || parsed?.error) {
      const err = parsed?.error || {};
      return {
        ok: false,
        status: res.status,
        data: parsed,
        // Meta error codes (e.g. 131047 = re-engagement message outside 24h window).
        errorCode: err.code ? String(err.code) : `http_${res.status}`,
        errorDetail: err.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, status: res.status, data: parsed as T };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      errorCode: e?.name === "AbortError" ? "timeout" : "network_error",
      errorDetail: e?.message || String(e),
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Send: text message (free-form, must be inside 24h customer-care window).
// ---------------------------------------------------------------------------
export async function sendText(args: {
  phoneNumberId: string;
  token: string;
  to: string;            // E.164 with or without "+"
  text: string;
  previewUrl?: boolean;
}): Promise<GraphResult<{ messages: Array<{ id: string }> }>> {
  return graphFetch(`${GRAPH_BASE}/${args.phoneNumberId}/messages`, {
    method: "POST",
    token: args.token,
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: args.to.replace(/^\+/, ""),
      type: "text",
      text: { body: args.text.slice(0, 4000), preview_url: !!args.previewUrl },
    }),
  });
}

// ---------------------------------------------------------------------------
// Send: template (allowed outside the 24h window when status=APPROVED).
// `components` follows the Meta schema verbatim — we don't transform it.
// ---------------------------------------------------------------------------
export async function sendTemplate(args: {
  phoneNumberId: string;
  token: string;
  to: string;
  templateName: string;
  language: string;
  components?: Array<Record<string, unknown>>;
}): Promise<GraphResult<{ messages: Array<{ id: string }> }>> {
  return graphFetch(`${GRAPH_BASE}/${args.phoneNumberId}/messages`, {
    method: "POST",
    token: args.token,
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: args.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: args.templateName,
        language: { code: args.language || "ar" },
        ...(args.components ? { components: args.components } : {}),
      },
    }),
  });
}

// ---------------------------------------------------------------------------
// Send: media via public URL (image / video / audio / document).
// Meta hosts the media after delivery; we never proxy bytes through KEYONE.
// ---------------------------------------------------------------------------
export async function sendMedia(args: {
  phoneNumberId: string;
  token: string;
  to: string;
  mediaType: "image" | "video" | "audio" | "document";
  link: string;
  caption?: string;
}): Promise<GraphResult<{ messages: Array<{ id: string }> }>> {
  const payload: any = {
    messaging_product: "whatsapp",
    to: args.to.replace(/^\+/, ""),
    type: args.mediaType,
    [args.mediaType]: {
      link: args.link,
      ...(args.caption && (args.mediaType === "image" || args.mediaType === "video" || args.mediaType === "document")
        ? { caption: args.caption.slice(0, 1024) }
        : {}),
    },
  };
  return graphFetch(`${GRAPH_BASE}/${args.phoneNumberId}/messages`, {
    method: "POST",
    token: args.token,
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Mark as read — Meta requires this within ~30s of the inbound delivery.
// We call it from the webhook processor as a best-effort step.
// ---------------------------------------------------------------------------
export async function markRead(args: {
  phoneNumberId: string;
  token: string;
  messageId: string;
}): Promise<GraphResult> {
  return graphFetch(`${GRAPH_BASE}/${args.phoneNumberId}/messages`, {
    method: "POST",
    token: args.token,
    body: JSON.stringify({
      messaging_product: "whatsapp",
      status: "read",
      message_id: args.messageId,
    }),
  });
}

// ---------------------------------------------------------------------------
// Phone number health — quality rating + messaging limit tier.
// Called by the Phase 4 quality monitor cron.
// ---------------------------------------------------------------------------
export async function getPhoneNumberHealth(args: {
  phoneNumberId: string;
  token: string;
}): Promise<GraphResult<{
  quality_rating?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  display_phone_number?: string;
}>> {
  const url = `${GRAPH_BASE}/${args.phoneNumberId}?fields=quality_rating,messaging_limit_tier,name_status,display_phone_number`;
  return graphFetch(url, { method: "GET", token: args.token });
}

// ---------------------------------------------------------------------------
// Template registry — list all templates on the WABA.
// Used by the Phase 2 template-sync cron.
// ---------------------------------------------------------------------------
export interface MetaTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: any[];
  quality_score?: { score?: string };
  rejected_reason?: string;
}
export async function listTemplates(args: {
  wabaId: string;
  token: string;
}): Promise<GraphResult<{ data: MetaTemplate[]; paging?: any }>> {
  const url = `${GRAPH_BASE}/${args.wabaId}/message_templates?limit=100&fields=id,name,language,category,status,components,quality_score,rejected_reason`;
  return graphFetch(url, { method: "GET", token: args.token });
}

/** Stable error-code mapping shared with the provider layer. */
export const META_ERR = {
  WINDOW_EXPIRED: "131047",     // re-engagement outside 24h
  TEMPLATE_PAUSED: "131056",    // template paused due to quality
  RATE_LIMITED: "80007",        // call rate hit
  USER_PHONE_INVALID: "131009", // bad recipient
  USER_NOT_ON_WHATSAPP: "131026",
} as const;
