import 'dotenv/config';
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { manager } from './sessions.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const SECRET = process.env.SAAS_INTERNAL_SECRET || 'dev';
const SESSIONS_DIR = process.env.SESSIONS_DIR || './sessions';
const ENABLE_HIBERNATION = process.env.ENABLE_SESSION_HIBERNATION === '1';
const HIBERNATE_MAX_ACTIVE = Math.max(1, Number(process.env.HIBERNATE_MAX_ACTIVE || 4));
const RESTORE_STAGGER_MS = Math.max(1000, Number(process.env.RESTORE_STAGGER_MS || 3000));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Auto-restore previously linked sessions on boot
// When hibernation is enabled, only restore the most-recent N sessions as
// active and register the rest as 'hibernated' (no Chromium process).
async function restoreSessions() {
  try {
    const entries = await fs.readdir(SESSIONS_DIR).catch(() => []);
    const userIds = entries
      .filter((d) => d.startsWith('session-'))
      .map((d) => d.replace(/^session-/, ''));
    if (userIds.length === 0) {
      console.log('[wa-service] no saved sessions to restore');
      return;
    }

    if (ENABLE_HIBERNATION) {
      // Staggered restore: only boot HIBERNATE_MAX_ACTIVE sessions,
      // register the rest as hibernated (zero RAM).
      const toActivate = userIds.slice(0, HIBERNATE_MAX_ACTIVE);
      const toHibernate = userIds.slice(HIBERNATE_MAX_ACTIVE);
      console.log(`[wa-service] hibernation restore: ${toActivate.length} active, ${toHibernate.length} hibernated`);

      // Register hibernated sessions first (instant, no Chromium)
      for (const id of toHibernate) {
        manager.sessions.set(id, {
          id,
          client: null,
          status: 'hibernated',
          qrDataUrl: null,
          pairingCode: null,
          phone: null,
          lastActivityAt: 0,
          connectedAt: null,
          hibernatedAt: Date.now(),
          priority: 0,
        });
      }

      // Stagger active session restoration to prevent OOM spike
      for (const id of toActivate) {
        try {
          await manager.start(id);
          console.log(`[wa-service] restored ${id} — staggering ${RESTORE_STAGGER_MS}ms`);
          await sleep(RESTORE_STAGGER_MS);
        } catch (e) {
          console.error(`[wa-service] failed to restore ${id}:`, e.message);
        }
      }
    } else {
      console.log(`[wa-service] restoring ${userIds.length} session(s):`, userIds.join(', '));
      for (const id of userIds) {
        try {
          await manager.start(id);
          console.log(`[wa-service] restore started ${id} — staggering ${RESTORE_STAGGER_MS}ms`);
          await sleep(RESTORE_STAGGER_MS);
        } catch (e) {
          console.error(`[wa-service] failed to restore ${id}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[wa-service] restore error:', e.message);
  }
}

const app = express();

// Lightweight security headers for the internal WhatsApp bridge.
// We avoid adding a dependency here so deploys stay low-risk and sessions are untouched.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const rateBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = Math.max(10_000, Number(process.env.WA_HTTP_RATE_WINDOW_MS || 60_000));
const RATE_LIMIT_MAX = Math.max(30, Number(process.env.WA_HTTP_RATE_MAX || 600));
function rateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    return res.status(429).json({ error: 'too_many_requests', retryAfter });
  }
  next();
}
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt <= now) rateBuckets.delete(key);
}, RATE_LIMIT_WINDOW_MS).unref?.();
app.use(rateLimit);

app.use(express.json({ limit: '10mb' }));

// Internal auth: REQUIRED for every endpoint except /health.
// Closes a security gap where omitting the header bypassed auth entirely.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const provided = req.header('x-internal-secret');
  if (!provided || provided !== SECRET) return res.status(401).json({ error: 'unauthorized' });
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true, sessions: manager.list() }));

// Wake a hibernated session on demand (called by saas before sending)
app.post('/sessions/:userId/wake', async (req, res) => {
  try {
    const s = manager.get(req.params.userId);
    if (!s) return res.status(404).json({ error: 'session not found' });
    if (s.status === 'connected') return res.json({ ok: true, status: 'connected', wakeMs: 0 });
    if (s.status !== 'hibernated' && s.status !== 'idle-closed') {
      return res.json({ ok: true, status: s.status, wakeMs: 0 });
    }
    const t0 = Date.now();
    const woken = await manager._wakeSession(req.params.userId);
    res.json({ ok: true, status: woken.status, wakeMs: Date.now() - t0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// One-Time QR Import — READ-ONLY data export (Phase 3, additive).
//
// Pulls the tenant's existing WhatsApp contacts + recent chat history from the
// LIVE session so the saas can build permanent CRM records + AI memory ONCE.
// This endpoint NEVER sends a message and NEVER touches the send pipeline — it
// only reads via whatsapp-web.js (getContacts / getChats / chat.fetchMessages).
// Everything is wrapped so a slow/large account can never crash the service.
// ---------------------------------------------------------------------------
const EXPORT_OP_TIMEOUT_MS = Math.max(15_000, Number(process.env.WA_EXPORT_OP_TIMEOUT_MS || 60_000));
const EXPORT_CONNECT_WAIT_MS = Math.max(10_000, Number(process.env.WA_EXPORT_CONNECT_WAIT_MS || 30_000));
const EXPORT_MAX_CHAT_LIMIT = Math.max(1, Number(process.env.WA_EXPORT_MAX_CHATS || 1000));
const EXPORT_MAX_MSG_LIMIT = Math.max(1, Number(process.env.WA_EXPORT_MAX_MSGS || 100));

// Bound any single whatsapp-web.js read so a hung Chromium can't wedge the request.
function withTimeout(promise, ms, label) {
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout:${label}`)), ms)),
  ]);
}

const digitsOnly = (v) => String(v || '').replace(/[^\d]/g, '');

// Resolve a real, dialable phone from a contact/chat id (skip @lid / @g.us).
function phoneFromId(idObj, fallbackNumber) {
  const serialized = idObj?._serialized || '';
  if (typeof serialized === 'string' && serialized.endsWith('@c.us')) {
    return digitsOnly(serialized.replace('@c.us', ''));
  }
  const user = idObj?.user;
  if (user && /^\d{6,15}$/.test(String(user))) return String(user);
  const fb = digitsOnly(fallbackNumber);
  return fb || null;
}

app.get('/sessions/:userId/export', async (req, res) => {
  const userId = req.params.userId;
  const chatLimit = Math.min(EXPORT_MAX_CHAT_LIMIT, Math.max(1, parseInt(req.query.chatLimit, 10) || 200));
  const msgLimit = Math.min(EXPORT_MAX_MSG_LIMIT, Math.max(1, parseInt(req.query.msgLimit, 10) || 30));

  try {
    // 1) Ensure we have a live, connected client. Wake/start as needed — but we
    //    NEVER create a fresh QR login here; if auth is gone the session simply
    //    won't reach 'connected' and we return 409.
    let s = manager.get(userId);
    if (!s) {
      // Try to auto-start from saved auth on disk (no QR forced).
      try { s = await manager.start(userId); } catch { s = manager.get(userId); }
    }
    if (s && (s.status === 'hibernated' || s.status === 'idle-closed' || s.status === 'disconnected')) {
      try { await manager._wakeSession(userId); } catch {}
      try { if (manager.get(userId)?.status !== 'connected') await manager.start(userId); } catch {}
      s = manager.get(userId) || s;
    }
    // Wait (bounded) for the session to settle into 'connected'.
    const deadline = Date.now() + EXPORT_CONNECT_WAIT_MS;
    while (Date.now() < deadline && s && s.status !== 'connected') {
      await sleep(500);
      s = manager.get(userId) || s;
    }
    if (!s || !s.client || s.status !== 'connected') {
      return res.status(409).json({ ok: false, error: 'not_connected', status: s?.status || 'missing' });
    }
    const client = s.client;
    if (s) s.lastActivityAt = Date.now(); // touch so the idle sweeper doesn't evict mid-export

    // 2) Contacts → [{ phone, name }] (skip groups, self, and non-WA entries).
    const contacts = [];
    const seenPhones = new Set();
    try {
      const raw = await withTimeout(client.getContacts(), EXPORT_OP_TIMEOUT_MS, 'getContacts');
      for (const c of raw || []) {
        try {
          if (!c || c.isGroup || c.isMe) continue;
          // Only keep entries that are actually WhatsApp users with a phone.
          if (c.isWAContact === false) continue;
          if (c.id?._serialized && c.id._serialized.endsWith('@g.us')) continue;
          const phone = phoneFromId(c.id, c.number);
          if (!phone || phone.length < 8 || phone.length > 15) continue;
          if (seenPhones.has(phone)) continue;
          seenPhones.add(phone);
          const name = c.name || c.pushname || c.shortName || null;
          contacts.push({ phone, name });
        } catch { /* skip a bad contact, keep going */ }
      }
    } catch (e) {
      // Non-fatal: continue with whatever we have (possibly empty).
      console.warn(`[wa] [${userId}] export getContacts failed:`, e?.message || e);
    }

    // 3) Chats → [{ phone, name, messages:[{ fromMe, body, ts }] }] (skip groups).
    const chats = [];
    try {
      const allChats = await withTimeout(client.getChats(), EXPORT_OP_TIMEOUT_MS, 'getChats');
      const direct = (allChats || []).filter((ch) => ch && !ch.isGroup).slice(0, chatLimit);
      for (const ch of direct) {
        try {
          if (ch.id?._serialized && ch.id._serialized.endsWith('@g.us')) continue;
          const phone = phoneFromId(ch.id, ch.id?.user);
          if (!phone || phone.length < 8 || phone.length > 15) continue;
          let msgs = [];
          try {
            const fetched = await withTimeout(ch.fetchMessages({ limit: msgLimit }), EXPORT_OP_TIMEOUT_MS, 'fetchMessages');
            msgs = (fetched || []).map((m) => ({
              fromMe: !!m.fromMe,
              body: typeof m.body === 'string' ? m.body.slice(0, 4000) : '',
              ts: m.timestamp ? m.timestamp * 1000 : null,
            }));
          } catch (e) {
            console.warn(`[wa] [${userId}] export fetchMessages(${phone}) failed:`, e?.message || e);
          }
          chats.push({ phone, name: ch.name || null, messages: msgs });
        } catch { /* skip a bad chat, keep going */ }
      }
    } catch (e) {
      console.warn(`[wa] [${userId}] export getChats failed:`, e?.message || e);
    }

    if (s) s.lastActivityAt = Date.now();
    return res.json({ ok: true, contacts, chats });
  } catch (e) {
    // Last-resort guard: never crash the service on an export.
    console.error(`[wa] [${userId}] export fatal:`, e?.message || e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

// Pool stats — used by the admin dashboard to monitor capacity on the 8GB VPS
app.get('/sessions/stats', (_req, res) => {
  res.json({ ok: true, ...manager.stats(), sessions: manager.list() });
});

// Start a session (creates folder, returns immediately; QR polled separately)
app.post('/sessions/:userId/start', async (req, res) => {
  try {
    const s = await manager.start(req.params.userId);
    res.json({ ok: true, status: s.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Poll status + QR
app.get('/sessions/:userId/status', (req, res) => {
  const s = manager.get(req.params.userId);
  if (!s) return res.json({ status: 'disconnected' });
  res.json({
    status: s.status,
    qr: s.qrDataUrl || null,
    pairingCode: s.pairingCode || null,
    phone: s.phone || null,
  });
});

// Request pairing code (alternative to QR — better when "can't link new device" error)
app.post('/sessions/:userId/pair', async (req, res) => {
  try {
    const { phone } = req.body || {};
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const code = await manager.requestPairingCode(req.params.userId, phone);
    res.json({ ok: true, code });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Send a text message
app.post('/sessions/:userId/send', async (req, res) => {
  try {
    const { to, text } = req.body || {};
    if (!to || !text) return res.status(400).json({ error: 'to + text required' });
    const r = await manager.send(req.params.userId, to, text);
    res.json({ ok: true, id: r?.key?.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.delete('/sessions/:userId', async (req, res) => {
  await manager.logout(req.params.userId);
  res.json({ ok: true });
});

// Send (legacy, single-tenant fallback): /send
app.post('/send', async (req, res) => {
  const { to, text, userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'userId required for multi-tenant' });
  try {
    await manager.send(userId, to, text);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[wa-service] listening on :${PORT}`);
  restoreSessions();
});
