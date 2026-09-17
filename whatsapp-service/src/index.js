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
    let userIds = entries
      .filter((d) => d.startsWith('session-'))
      .map((d) => d.replace(/^session-/, ''));
    // NEVER restore temporary (ephemeral) sessions. A leftover `.ephemeral`
    // marker means a job crashed mid-flight — wipe it so no QR transport revives.
    const persistent = [];
    for (const id of userIds) {
      const dir = path.join(SESSIONS_DIR, `session-${id}`);
      try {
        await fs.access(path.join(dir, '.ephemeral'));
        console.log(`[wa-service] wiping ephemeral session ${id} — temporary QR never auto-restores`);
        await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
      } catch {
        persistent.push(id);
      }
    }
    userIds = persistent;
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

// Pool stats — used by the admin dashboard to monitor capacity on the 8GB VPS
app.get('/sessions/stats', (_req, res) => {
  res.json({ ok: true, ...manager.stats(), sessions: manager.list() });
});

// Start a session (creates folder, returns immediately; QR polled separately).
// Pass { ephemeral: true } for temporary (import/campaign) sessions that must
// auto-terminate and never reconnect/restore.
app.post('/sessions/:userId/start', async (req, res) => {
  try {
    const s = await manager.start(req.params.userId, { ephemeral: !!(req.body && req.body.ephemeral) });
    res.json({ ok: true, status: s.status, ephemeral: !!s.ephemeral });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Mark a running session EPHEMERAL (temporary) — import/campaign call this so
// the QR transport auto-terminates and never reconnects or restores.
app.post('/sessions/:userId/ephemeral', (req, res) => {
  const marked = manager.markEphemeral(req.params.userId);
  res.json({ ok: marked, marked });
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

// Export contacts + recent chats for the one-time CRM import (read-only).
// Requires a CONNECTED session; returns 409 otherwise so the caller can retry.
app.get('/sessions/:userId/export', async (req, res) => {
  try {
    const s = manager.get(req.params.userId);
    if (!s || !s.client || s.status !== 'connected') {
      return res.status(409).json({ ok: false, error: 'not_connected', status: (s && s.status) || 'none' });
    }
    const chatLimit = Math.min(1000, Number(req.query.chatLimit) || 500);
    const msgLimit = Math.min(200, Number(req.query.msgLimit) || 50);
    const client = s.client;
    let contacts = [];
    try {
      const cs = await client.getContacts();
      contacts = (cs || [])
        .filter((c) => c && c.isWAContact && !c.isGroup && !c.isMe)
        .map((c) => ({ phone: String(c.number || (c.id && c.id.user) || '').replace(/\D/g, ''), name: c.name || c.pushname || null }))
        .filter((c) => c.phone && c.phone.length >= 6);
    } catch (e) { /* contacts best-effort */ }
    let chats = [];
    try {
      const cs = await client.getChats();
      // BUG1 + BUG2: export ONLY real 1:1 customer conversations that CONTAIN
      // messages. A private user chat has id.server === 'c.us'. This deliberately
      // excludes:
      //   - groups            (isGroup / server 'g.us')
      //   - WhatsApp Status / stories / broadcast lists (server 'broadcast', e.g.
      //     status@broadcast)
      //   - channels / newsletters (server 'newsletter')
      // and empty conversations (saved numbers you never chatted with) are dropped
      // below because they yield 0 fetched messages.
      const isCustomerChat = (c) => {
        if (!c || !c.id || c.isGroup) return false;
        const server = c.id.server || (c.id._serialized || '').split('@')[1] || '';
        if (server !== 'c.us') return false; // drop broadcast/newsletter/status/groups
        if ((c.id._serialized || '').includes('status@broadcast')) return false;
        return true;
      };
      for (const ch of (cs || []).filter(isCustomerChat).slice(0, chatLimit)) {
        let messages = [];
        try {
          const msgs = await ch.fetchMessages({ limit: msgLimit });
          messages = (msgs || [])
            .filter((m) => m && !m.isStatus && !m.broadcast)
            .map((m) => ({ fromMe: !!m.fromMe, body: String(m.body || '').slice(0, 4000), ts: m.timestamp || 0 }));
        } catch (e) { /* per-chat best-effort */ }
        // Skip empty conversations — a saved number with no real messages is NOT a customer.
        if (messages.length === 0) continue;
        chats.push({ phone: String((ch.id && ch.id.user) || '').replace(/\D/g, ''), name: ch.name || null, messages });
      }
    } catch (e) { /* chats best-effort */ }
    return res.json({ ok: true, contacts, chats });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String((e && e.message) || e).slice(0, 200) });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`[wa-service] listening on 127.0.0.1:${PORT}`);
  restoreSessions();
});
