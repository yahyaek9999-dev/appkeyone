// Multi-tenant WhatsApp manager built on whatsapp-web.js (Puppeteer + Chrome).
// Each user gets an isolated session folder via LocalAuth.

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode';
import path from 'path';
import fs from 'fs/promises';

const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';
const SAAS_INCOMING_URL = process.env.SAAS_INCOMING_URL || 'http://127.0.0.1:3000/api/whatsapp/incoming';
const SAAS_INTERNAL_SECRET = process.env.SAAS_INTERNAL_SECRET || 'dev';

// Returns true if `digits` looks like a real E.164 phone number.
// Per ITU-T E.164: 1-15 digits, leading digit is the country code so it
// is never 0. In practice all dial-able numbers are >= 8 digits (the
// smallest country codes + national subscriber numbers). WhatsApp LIDs
// are typically 15-17 digits AND start with a non-country-code prefix
// (often 16xxx, 11xxx...). We tighten to 8..15 digits, no leading zero.
function looksLikePhone(digits) {
  if (!digits || typeof digits !== 'string') return false;
  if (!/^\d{8,15}$/.test(digits)) return false;
  if (digits.startsWith('0')) return false;
  return true;
}

// ---------------------------------------------------------------------------
// WA Session Pool (Wave 12)
//
// Each whatsapp-web.js session opens its own Chromium (~300-500 MB RAM).
// On an 8 GB VPS we cannot run ~100 of these. We:
//   1. Enforce a hard ceiling MAX_ACTIVE_SESSIONS (env: WA_MAX_SESSIONS).
//   2. Track lastActivityAt per session (every incoming/outgoing message).
//   3. Idle-evict: if a session sits idle past WA_IDLE_HOURS, close its
//      Chromium to free RAM. The auth folder stays so a manual /start
//      reconnects without a fresh QR.
//   4. LRU-evict: when a new start request would exceed the cap, the
//      least-recently-active session is destroyed first.
// ---------------------------------------------------------------------------
// Audit fix #4: default lowered from 25 → 12. Each Chromium session uses
// ~380-450 MB. On an 8 GB VPS, after OS + Node + Caddy + CloakBrowser the
// safe budget is ~5 GB, which fits ~12 concurrent sessions with headroom.
// Operators with more RAM can override via the WA_MAX_SESSIONS env var.
const MAX_ACTIVE_SESSIONS = Math.max(1, Number(process.env.WA_MAX_SESSIONS || 12));
const IDLE_EVICT_MS = Math.max(60 * 60 * 1000, Number(process.env.WA_IDLE_HOURS || 6) * 3600 * 1000);
const IDLE_CHECK_MS = 5 * 60 * 1000; // sweep every 5 min

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class SessionManager {
  constructor() {
    /** @type {Map<string, any>} */
    this.sessions = new Map();
    // Background sweep — close sessions that have been idle too long so
    // their Chromium RAM is reclaimed. Auth stays on disk for next /start.
    this._idleTimer = setInterval(() => this._sweepIdle(), IDLE_CHECK_MS);
    if (typeof this._idleTimer.unref === 'function') this._idleTimer.unref();
  }

  list() {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      status: s.status,
      phone: s.phone,
      pairingCode: s.pairingCode,
      lastActivityAt: s.lastActivityAt || null,
      idleMs: s.lastActivityAt ? Date.now() - s.lastActivityAt : null,
    }));
  }

  get(userId) {
    return this.sessions.get(userId);
  }

  /** Touch the session so LRU & idle-evict know it's alive. */
  _touch(userId) {
    const s = this.sessions.get(userId);
    if (s) s.lastActivityAt = Date.now();
  }

  /** Returns sessions sorted oldest-to-newest by lastActivityAt. */
  _byOldest() {
    return Array.from(this.sessions.values())
      .filter((s) => s && s.client)
      .sort((a, b) => (a.lastActivityAt || 0) - (b.lastActivityAt || 0));
  }

  async _sweepIdle() {
    const now = Date.now();
    for (const s of this._byOldest()) {
      // Don't evict sessions that never finished connecting (QR/pairing).
      if (s.status !== 'connected') continue;
      const last = s.lastActivityAt || s.connectedAt || 0;
      if (now - last >= IDLE_EVICT_MS) {
        console.log(`[wa] [${s.id}] idle-evict (no activity for ${Math.round((now - last) / 3600000)}h) — closing Chromium, auth kept`);
        await this._closeChromium(s).catch(() => {});
      }
    }
  }

  async _closeChromium(s) {
    if (!s) return;
    try { await s.client.destroy(); } catch {}
    s.status = 'idle-closed';
    s.client = null;
    // KEEP the entry in the map so the UI shows status: idle-closed and the
    // user can resume via /start without re-pairing.
  }

  async _enforceCapBeforeStart() {
    const live = Array.from(this.sessions.values()).filter((s) => s.client);
    if (live.length < MAX_ACTIVE_SESSIONS) return;
    // LRU evict the oldest active session
    const oldest = this._byOldest()[0];
    if (oldest) {
      console.log(`[wa] LRU-evict ${oldest.id} (live=${live.length}/${MAX_ACTIVE_SESSIONS})`);
      await this._closeChromium(oldest).catch(() => {});
    }
  }

  /** Stats snapshot for /sessions/stats endpoint */
  stats() {
    const all = Array.from(this.sessions.values());
    return {
      max: MAX_ACTIVE_SESSIONS,
      total: all.length,
      live: all.filter((s) => s.client).length,
      connected: all.filter((s) => s.status === 'connected').length,
      idleClosed: all.filter((s) => s.status === 'idle-closed').length,
      idleEvictAfterHours: Math.round(IDLE_EVICT_MS / 3600000),
    };
  }

  async start(userId) {
    const existing = this.sessions.get(userId);
    if (existing && existing.client && (existing.status === 'connected' || existing.status === 'qr' || existing.status === 'connecting' || existing.status === 'pairing')) {
      this._touch(userId);
      return existing;
    }

    // Respect the active-session ceiling (LRU evict if needed)
    await this._enforceCapBeforeStart();

    await fs.mkdir(SESSIONS_DIR, { recursive: true });

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: SESSIONS_DIR,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    const session = {
      id: userId,
      client,
      status: 'connecting',
      qrDataUrl: null,
      pairingCode: null,
      phone: null,
      lastActivityAt: Date.now(),
      connectedAt: null,
    };
    this.sessions.set(userId, session);

    client.on('qr', async (qrStr) => {
      try {
        session.qrDataUrl = await qrcode.toDataURL(qrStr, { margin: 1, scale: 6 });
        session.status = 'qr';
        console.log(`[wa] [${userId}] QR ready`);
      } catch (e) {
        console.error('[wa] qr encode error', e);
      }
    });

    client.on('authenticated', () => {
      console.log(`[wa] [${userId}] authenticated`);
      session.status = 'connecting';
      session.qrDataUrl = null;
      session.pairingCode = null;
    });

    client.on('auth_failure', (msg) => {
      console.error(`[wa] [${userId}] auth failure:`, msg);
      session.status = 'disconnected';
    });

    client.on('ready', () => {
      session.status = 'connected';
      session.qrDataUrl = null;
      session.pairingCode = null;
      session.phone = client.info?.wid?.user || null;
      session.connectedAt = Date.now();
      session.lastActivityAt = Date.now();
      console.log(`[wa] [${userId}] connected as ${session.phone}`);
      notifySaas({ event: 'connected', userId, phone: session.phone }).catch(() => {});
    });

    client.on('disconnected', async (reason) => {
      console.log(`[wa] [${userId}] disconnected:`, reason);
      session.status = 'disconnected';
      this.sessions.delete(userId);
      // Only wipe the auth folder on an intentional LOGOUT (user unlinked the
      // device from their phone). Transient disconnects (network blip, server
      // reconnect) keep the auth so the next /start can resume without QR.
      const isLogout = String(reason).toUpperCase().includes('LOGOUT');
      if (isLogout) {
        const folder = path.join(SESSIONS_DIR, `session-${userId}`);
        await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
      }
    });

    client.on('message', async (msg) => {
      try {
        if (msg.fromMe) return;
        session.lastActivityAt = Date.now(); // touch on every inbound message
        const chat = await msg.getChat();
        if (chat.isGroup) return; // skip groups for now

        // Resolve actual phone number.
        // msg.from can be: "201234567890@c.us"  OR  "162693377974496@lid"  (new WA format)
        // For @lid we must look up the real phone via the contact.
        const contact = await msg.getContact();
        let fromPhone = null;

        if (msg.from.endsWith('@c.us')) {
          // @c.us JID = the digits ARE the real phone (E.164 without '+').
          fromPhone = '+' + msg.from.replace('@c.us', '');
        } else {
          // @lid (new privacy model) or other non-c.us. The ONLY trustworthy
          // phone source is a JID that itself ends in `@c.us`. We do NOT
          // trust `contact.number` because in WhatsApp's new privacy
          // protocol that field may be populated with the LID itself
          // (a 14-15 digit number that LOOKS like an E.164 phone but isn't
          // dialable). Production data was poisoned by exactly that case
          // ("+162693377974496", "+49036178546786") which then made
          // broadcasts fail with "No LID for user".
          //
          // Resolution order (most-trusted first):
          //   1. contact.id._serialized — if it ends in @c.us, the digits
          //      are the real phone. This is set when WA already knows the
          //      contact under a phone identity.
          //   2. msg.author — sometimes the underlying phone JID for @lid
          //      messages from contacts you've previously chatted with.
          //   3. Otherwise: not resolvable → store as `lid:<id>` so the
          //      DB never again contains a fake "+<lid>" phone.
          const trySerialized = (jid) =>
            (typeof jid === 'string' && jid.endsWith('@c.us'))
              ? '+' + jid.replace('@c.us', '')
              : null;

          fromPhone = trySerialized(contact?.id?._serialized)
                    || trySerialized(msg.author);

          if (!fromPhone) {
            const lid = msg.from.replace(/@.*$/, '');
            fromPhone = 'lid:' + lid;
            console.warn(`[wa] [${userId}] LID-only contact: msg.from=${msg.from} contact.id=${contact?.id?._serialized || ''} contact.number=${contact?.number || ''}; stored as ${fromPhone}`);
          }
        }

        const senderName = contact?.pushname || contact?.name || null;

        let text = msg.body || '';
        let mediaType = 'text';
        let mediaBase64 = null;
        let mimetype = null;

        if (msg.hasMedia) {
          if (msg.type === 'audio' || msg.type === 'ptt') {
            mediaType = 'voice';
          } else if (msg.type === 'image') {
            mediaType = 'image';
          }
          if (mediaType !== 'text') {
            try {
              const media = await msg.downloadMedia();
              if (media) {
                mediaBase64 = media.data;
                mimetype = media.mimetype;
              }
            } catch (e) {
              console.error('[wa] media download failed:', e.message);
            }
          }
        }

        console.log(`[wa] [${userId}] IN  ${fromPhone} (${mediaType}) len=${text.length}: ${text.slice(0, 80)}`);

        // Show typing indicator while LLM is generating; refresh every 15s
        // because WA auto-clears the "typing..." state after ~25s.
        let typingInterval = null;
        try {
          await chat.sendStateTyping();
          typingInterval = setInterval(() => {
            chat.sendStateTyping().catch(() => {});
          }, 15000);
        } catch (e) {
          // non-fatal: continue without typing indicator
        }

        const t0 = Date.now();
        const result = await notifySaas({
          event: 'incoming',
          userId,
          from: { phone: fromPhone, name: senderName },
          mediaType,
          text,
          mediaBase64,
          mimetype,
        });
        const dt = Date.now() - t0;

        if (!result) {
          if (typingInterval) clearInterval(typingInterval);
          try { await chat.clearState(); } catch {}
          console.error(`[wa] [${userId}] SAAS_FAIL after ${dt}ms — no reply sent to customer`);
          return;
        }
        if (!result.reply) {
          if (typingInterval) clearInterval(typingInterval);
          try { await chat.clearState(); } catch {}
          console.log(`[wa] [${userId}] saas ok (${dt}ms) but no reply (subscription/trial limit?)`);
          return;
        }

        // ---- Wave 5: human-like delays from saas response -----------------
        // The saas may instruct us to wait `preDelayMs` (reading time) before
        // typing, and to keep typing for `typingDelayMs` (proportional to
        // reply length) before actually sending.
        const preDelayMs = Math.max(0, Math.min(3000, Number(result.preDelayMs) || 0));
        const typingDelayMs = Math.max(0, Math.min(8000, Number(result.typingDelayMs) || 0));

        if (preDelayMs > 0) {
          // Stop the in-LLM typing indicator briefly to mimic "reading" pause
          try { await chat.clearState(); } catch {}
          if (typingInterval) { clearInterval(typingInterval); typingInterval = null; }
          await sleep(preDelayMs);
        }
        if (typingDelayMs > 0) {
          try { await chat.sendStateTyping(); } catch {}
          if (!typingInterval) {
            typingInterval = setInterval(() => {
              chat.sendStateTyping().catch(() => {});
            }, 15000);
          }
          await sleep(typingDelayMs);
        }

        if (typingInterval) clearInterval(typingInterval);
        try { await chat.clearState(); } catch {}

        try {
          await client.sendMessage(msg.from, result.reply);
          const totalDelay = preDelayMs + typingDelayMs;
          console.log(`[wa] [${userId}] OUT ${fromPhone} (llm:${dt}ms+human:${totalDelay}ms): ${String(result.reply).slice(0, 80)}`);
        } catch (sendErr) {
          console.error(`[wa] [${userId}] SEND_FAIL to ${msg.from}:`, sendErr.message);
        }
      } catch (e) {
        console.error('[wa] message handler error:', e);
      }
    });

    // Initialize asynchronously; do not await so we return fast
    client.initialize().catch((e) => {
      console.error(`[wa] [${userId}] initialize error:`, e);
      session.status = 'disconnected';
    });

    return session;
  }

  async requestPairingCode(userId, phoneNumber) {
    let s = this.sessions.get(userId);
    if (!s) s = await this.start(userId);
    const clean = String(phoneNumber).replace(/[^\d]/g, '');
    if (!clean) throw new Error('invalid phone');

    // Wait until the puppeteer page reaches a state where pairing code can be requested
    // (whatsapp-web.js requires the QR phase to be active first)
    const start = Date.now();
    while (Date.now() - start < 30000) {
      try {
        const code = await s.client.requestPairingCode(clean);
        s.pairingCode = code;
        s.status = 'pairing';
        console.log(`[wa] [${userId}] pairing code: ${code} for +${clean}`);
        return code;
      } catch (e) {
        // Not ready yet; wait and retry
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('timeout waiting for pairing code');
  }

  async send(userId, toPhone, text) {
    let s = this.sessions.get(userId);
    // Auto-resume if Chromium was evicted but auth is still on disk
    if (s && s.status === 'idle-closed') {
      console.log(`[wa] [${userId}] auto-resume on send()`);
      s = await this.start(userId);
      // Wait briefly for the client to be ready
      const start = Date.now();
      while (Date.now() - start < 15000 && s.status !== 'connected') {
        await sleep(500);
      }
    }
    if (!s || s.status !== 'connected') throw new Error('session not connected');
    s.lastActivityAt = Date.now();

    // Reject contacts whose stored "phone" is actually a WhatsApp LID.
    // We never had a real phone number for these so we can't initiate a send.
    if (typeof toPhone === 'string' && (toPhone.startsWith('lid:') || toPhone.includes('@lid'))) {
      throw new Error('cannot initiate send to WhatsApp LID; no public phone available');
    }

    const cleaned = String(toPhone || '').replace(/^\+/, '').replace(/[^\d]/g, '');
    // Valid E.164 phones are 8-15 digits. Anything shorter is bogus; anything
    // longer is almost certainly a LID misclassified as a phone in old rows.
    if (cleaned.length < 8 || cleaned.length > 15) {
      throw new Error(`invalid phone format: "${toPhone}"`);
    }

    // Modern WA Web requires a LID-aware JID for any contact the session has
    // never chatted with before. getNumberId() does the proper Store lookup
    // (createWid + LID resolution) and returns null when the number isn't on
    // WhatsApp at all. Without this, cold sends fail with the cryptic
    // "No LID for user" error thrown from WhatsApp's own JS bundle.
    let numberId;
    try {
      numberId = await s.client.getNumberId(cleaned);
    } catch (e) {
      throw new Error(`getNumberId failed: ${e?.message || e}`);
    }
    if (!numberId) {
      throw new Error('number not registered on WhatsApp');
    }
    return s.client.sendMessage(numberId._serialized, text);
  }

  async logout(userId) {
    const s = this.sessions.get(userId);
    if (s?.client) {
      try { await s.client.logout(); } catch {}
      try { await s.client.destroy(); } catch {}
    }
    const folder = path.join(SESSIONS_DIR, `session-${userId}`);
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    this.sessions.delete(userId);
  }
}

async function notifySaas(payload) {
  try {
    const res = await fetch(SAAS_INCOMING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': SAAS_INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[wa] saas responded', res.status);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.error('[wa] saas unreachable:', e.message);
    return null;
  }
}

export const manager = new SessionManager();
