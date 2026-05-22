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
