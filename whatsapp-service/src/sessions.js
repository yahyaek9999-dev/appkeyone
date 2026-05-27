// Multi-tenant WhatsApp manager built on whatsapp-web.js (Puppeteer + Chrome).
// Each user gets an isolated session folder via LocalAuth.
//
// Smart Session Hibernation (ENABLE_SESSION_HIBERNATION=1):
//   Instead of keeping all sessions as live Chromium processes, we maintain
//   a small active pool (HIBERNATE_MAX_ACTIVE, default 4) and hibernate
//   idle sessions automatically. Sessions wake on demand (incoming msg /
//   send / broadcast) with concurrency-controlled reconnects to prevent
//   storms. Auth is always preserved via LocalAuth on disk.

import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode";
import path from "path";
import fs from "fs/promises";

const SESSIONS_DIR = process.env.SESSIONS_DIR || "./sessions";
const SAAS_INCOMING_URL =
  process.env.SAAS_INCOMING_URL ||
  "http://127.0.0.1:3000/api/whatsapp/incoming";
const SAAS_INTERNAL_SECRET = process.env.SAAS_INTERNAL_SECRET || "dev";

// ---------------------------------------------------------------------------
// Feature flags + tunables (smart scaling)
// ---------------------------------------------------------------------------
const ENABLE_HIBERNATION = process.env.ENABLE_SESSION_HIBERNATION === "1";
const ENABLE_CHROMIUM_OPT = process.env.ENABLE_CHROMIUM_OPTIMIZATION === "1";
const HIBERNATE_MAX_ACTIVE = Math.max(
  1,
  Number(process.env.HIBERNATE_MAX_ACTIVE || 4),
);
const HIBERNATE_IDLE_MIN = Math.max(
  5,
  Number(process.env.HIBERNATE_IDLE_MINUTES || 30),
);
const HIBERNATE_IDLE_MS = HIBERNATE_IDLE_MIN * 60 * 1000;
const HIBERNATE_MAX_WAKES = Math.max(
  1,
  Number(process.env.HIBERNATE_MAX_CONCURRENT_WAKES || 2),
);
const HIBERNATE_WAKE_TIMEOUT = Math.max(
  5000,
  Number(process.env.HIBERNATE_WAKE_TIMEOUT_SEC || 20) * 1000,
);
const AUTH_RESTORE_QR_GRACE_MS = Math.max(
  15_000,
  Number(process.env.AUTH_RESTORE_QR_GRACE_SEC || 60) * 1000,
);
const AUTH_RESTORE_QR_MAX_RETRIES = Math.max(
  0,
  Number(process.env.AUTH_RESTORE_QR_MAX_RETRIES || 1),
);
const WA_HEALTH_CHECK_MS = Math.max(
  30_000,
  Number(process.env.WA_HEALTH_CHECK_SEC || 60) * 1000,
);
const WA_HEALTH_MAX_FAILURES = Math.max(
  2,
  Number(process.env.WA_HEALTH_MAX_FAILURES || 3),
);
const WA_SEND_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(5, Number(process.env.WA_SEND_MAX_ATTEMPTS || 3)),
);
const WA_SEND_MIN_SESSION_SPACING_MS = Math.max(
  300,
  Number(process.env.WA_SEND_MIN_SESSION_SPACING_MS || 1200),
);
const WA_SEND_MIN_RECIPIENT_SPACING_MS = Math.max(
  500,
  Number(process.env.WA_SEND_MIN_RECIPIENT_SPACING_MS || 1500),
);

const lastSendBySession = new Map();
const lastSendByRecipient = new Map();

// Returns true if `digits` looks like a real E.164 phone number.
// Per ITU-T E.164: 1-15 digits, leading digit is the country code so it
// is never 0. In practice all dial-able numbers are >= 8 digits (the
// smallest country codes + national subscriber numbers). WhatsApp LIDs
// are typically 15-17 digits AND start with a non-country-code prefix
// (often 16xxx, 11xxx...). We tighten to 8..15 digits, no leading zero.
function looksLikePhone(digits) {
  if (!digits || typeof digits !== "string") return false;
  if (!/^\d{8,15}$/.test(digits)) return false;
  if (digits.startsWith("0")) return false;
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
const MAX_ACTIVE_SESSIONS = Math.max(
  1,
  Number(process.env.WA_MAX_SESSIONS || 12),
);
const IDLE_EVICT_MS = ENABLE_HIBERNATION
  ? HIBERNATE_IDLE_MS
  : Math.max(
      60 * 60 * 1000,
      Number(process.env.WA_IDLE_HOURS || 6) * 3600 * 1000,
    );
const IDLE_CHECK_MS = ENABLE_HIBERNATION ? 60 * 1000 : 5 * 60 * 1000; // sweep faster when hibernating

// ---------------------------------------------------------------------------
// Chromium optimization: aggressive resource reduction flags
// ---------------------------------------------------------------------------
const CHROMIUM_BASE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-accelerated-2d-canvas",
  "--no-first-run",
  "--no-zygote",
  "--disable-gpu",
];

const CHROMIUM_OPTIMIZED_ARGS = [
  ...CHROMIUM_BASE_ARGS,
  // Memory reduction
  "--disable-extensions",
  "--disable-component-extensions-with-background-pages",
  "--disable-default-apps",
  "--disable-background-networking",
  "--disable-sync",
  "--disable-translate",
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  // Disable media/images for RAM savings (~30-50 MB per session)
  "--disable-images",
  "--blink-settings=imagesEnabled=false",
  "--disable-remote-fonts",
  // Disable unnecessary features
  "--disable-notifications",
  "--disable-hang-monitor",
  "--disable-breakpad",
  "--disable-client-side-phishing-detection",
  "--disable-component-update",
  "--disable-domain-reliability",
  "--disable-features=TranslateUI,BlinkGenPropertyTrees",
  "--metrics-recording-only",
  "--mute-audio",
  // Reduce V8 memory
  "--js-flags=--max-old-space-size=128",
  // Reduce process count
  "--renderer-process-limit=1",
  "--single-process",
];

function getChromiumArgs() {
  return ENABLE_CHROMIUM_OPT ? CHROMIUM_OPTIMIZED_ARGS : CHROMIUM_BASE_ARGS;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sendBackoffMs(attempt) {
  const base = Math.min(10_000, 750 * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(Math.random() * Math.max(250, base * 0.25));
  return base + jitter;
}

function isRetryableSendError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (!msg) return true;
  if (/invalid phone|not registered|cannot initiate send|forbidden|blocked|logout|auth_failure/.test(msg)) {
    return false;
  }
  return /timeout|timed out|network|socket|protocol|session|disconnected|closed|crash|target|navigation|wid|lid|getnumberid|rate|429|too many/.test(msg);
}

async function waitForOutboundSlot(userId, recipient) {
  const now = Date.now();
  const sessionDue = (lastSendBySession.get(userId) || 0) + WA_SEND_MIN_SESSION_SPACING_MS;
  const recipientKey = `${userId}:${recipient}`;
  const recipientDue = (lastSendByRecipient.get(recipientKey) || 0) + WA_SEND_MIN_RECIPIENT_SPACING_MS;
  const waitMs = Math.max(0, sessionDue - now, recipientDue - now);
  if (waitMs > 0) await sleep(waitMs + Math.floor(Math.random() * 250));
  const sentAt = Date.now();
  lastSendBySession.set(userId, sentAt);
  lastSendByRecipient.set(recipientKey, sentAt);
}

async function sendMessageReliably({ client, userId, jid, recipient, text, loggerPrefix }) {
  let lastErr;
  for (let attempt = 1; attempt <= WA_SEND_MAX_ATTEMPTS; attempt++) {
    try {
      await waitForOutboundSlot(userId, recipient || jid);
      return await client.sendMessage(jid, text);
    } catch (err) {
      lastErr = err;
      if (attempt >= WA_SEND_MAX_ATTEMPTS || !isRetryableSendError(err)) break;
      const pause = sendBackoffMs(attempt);
      console.warn(`${loggerPrefix} send attempt ${attempt}/${WA_SEND_MAX_ATTEMPTS} failed; retrying in ${pause}ms:`, err?.message || err);
      await sleep(pause);
    }
  }
  throw lastErr;
}

async function hasSessionAuth(userId) {
  const folder = path.join(SESSIONS_DIR, `session-${userId}`);
  try {
    const entries = await fs.readdir(folder);
    return entries.length > 0;
  } catch {
    return false;
  }
}

class SessionManager {
  constructor() {
    /** @type {Map<string, any>} */
    this.sessions = new Map();

    // ---------------------------------------------------------------------------
    // Hibernation state (only active when ENABLE_SESSION_HIBERNATION=1)
    // ---------------------------------------------------------------------------
    /** @type {Set<string>} — sessions currently waking up (concurrency gate) */
    this._wakingNow = new Set();
    /** @type {Map<string, { resolve: Function, reject: Function, timer: any }[]>} */
    this._wakeWaiters = new Map();
    /** @type {{ wakes: number, wakeFails: number, hibernations: number, avgWakeMs: number, _wakeTotal: number }} */
    this._metrics = {
      wakes: 0,
      wakeFails: 0,
      hibernations: 0,
      avgWakeMs: 0,
      _wakeTotal: 0,
    };

    /** Auto-reconnect state */
    this._reconnectTimers = new Map(); // userId -> setTimeout handle
    this._reconnectAttempts = new Map(); // userId -> number of reconnect attempts
    this._healthFailures = new Map(); // userId -> consecutive getState failures

    // Background sweep — close sessions that have been idle too long so
    // their Chromium RAM is reclaimed. Auth stays on disk for next /start.
    this._idleTimer = setInterval(() => this._sweepIdle(), IDLE_CHECK_MS);
    if (typeof this._idleTimer.unref === "function") this._idleTimer.unref();

    // Keep-alive style drift detection. whatsapp-web.js doesn't expose the
    // Baileys ping packet, so we use a conservative getState probe and only
    // reconnect after several consecutive failures.
    this._healthTimer = setInterval(() => this._healthCheck(), WA_HEALTH_CHECK_MS);
    if (typeof this._healthTimer.unref === "function") this._healthTimer.unref();

    if (ENABLE_HIBERNATION) {
      console.log(
        `[wa] Hibernation ENABLED: maxActive=${HIBERNATE_MAX_ACTIVE} idleMin=${HIBERNATE_IDLE_MIN} maxWakes=${HIBERNATE_MAX_WAKES}`,
      );
    }
    if (ENABLE_CHROMIUM_OPT) {
      console.log(
        `[wa] Chromium optimization ENABLED: ${CHROMIUM_OPTIMIZED_ARGS.length - CHROMIUM_BASE_ARGS.length} extra flags`,
      );
    }
  }

  list() {
    return Array.from(this.sessions.entries()).map(([id, s]) => ({
      id,
      status: s.status,
      phone: s.phone,
      pairingCode: s.pairingCode,
      lastActivityAt: s.lastActivityAt || null,
      idleMs: s.lastActivityAt ? Date.now() - s.lastActivityAt : null,
      connectedAt: s.connectedAt || null,
      reconnectAttempts: this._reconnectAttempts.get(id) || 0,
      hibernated: s.status === "hibernated",
      priority: s.priority || 0,
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

  async _healthCheck() {
    for (const [userId, session] of this.sessions) {
      if (!session?.client || session.status !== "connected") continue;
      try {
        const state = await session.client.getState();
        if (state && String(state).toUpperCase() === "CONNECTED") {
          this._healthFailures.delete(userId);
          continue;
        }
        const failures = (this._healthFailures.get(userId) || 0) + 1;
        this._healthFailures.set(userId, failures);
        console.warn(`[wa] [${userId}] health probe state=${state || "unknown"} failures=${failures}/${WA_HEALTH_MAX_FAILURES}`);
        if (failures < WA_HEALTH_MAX_FAILURES) continue;
      } catch (e) {
        const failures = (this._healthFailures.get(userId) || 0) + 1;
        this._healthFailures.set(userId, failures);
        console.warn(`[wa] [${userId}] health probe failed ${failures}/${WA_HEALTH_MAX_FAILURES}:`, e?.message || e);
        if (failures < WA_HEALTH_MAX_FAILURES) continue;
      }

      const live = this.sessions.get(userId);
      if (!live || live !== session || live.status !== "connected") continue;
      console.warn(`[wa] [${userId}] health probe marked session stale — reconnecting`);
      live.status = "disconnected";
      notifySaas({ event: "disconnected", userId, reason: "health_probe_stale" }).catch(() => {});
      try {
        await live.client.destroy();
      } catch {}
      live.client = null;
      this._healthFailures.delete(userId);
      this._scheduleReconnect(userId);
    }
  }

  _byOldest() {
    return Array.from(this.sessions.values())
      .filter((s) => s && s.client)
      .sort((a, b) => (a.lastActivityAt || 0) - (b.lastActivityAt || 0));
  }

  async _sweepIdle() {
    const now = Date.now();
    for (const s of this._byOldest()) {
      // Don't evict sessions that never finished connecting (QR/pairing).
      if (s.status !== "connected") continue;
      const last = s.lastActivityAt || s.connectedAt || 0;
      if (now - last >= IDLE_EVICT_MS) {
        if (ENABLE_HIBERNATION) {
          console.log(
            `[wa] [${s.id}] hibernating (idle ${Math.round((now - last) / 60000)}min) — Chromium freed, auth kept`,
          );
          await this._hibernate(s).catch(() => {});
        } else {
          console.log(
            `[wa] [${s.id}] idle-evict (no activity for ${Math.round((now - last) / 3600000)}h) — closing Chromium, auth kept`,
          );
          await this._closeChromium(s).catch(() => {});
        }
      }
    }
    // When hibernation is on, also enforce the active pool cap proactively
    if (ENABLE_HIBERNATION) {
      await this._enforceActivePoolCap();
    }
  }

  async _closeChromium(s) {
    if (!s) return;
    try {
      await s.client.destroy();
    } catch {}
    s.status = "idle-closed";
    s.client = null;
    // KEEP the entry in the map so the UI shows status: idle-closed and the
    // user can resume via /start without re-pairing.
  }

  /** Hibernate a session — same as close but marks as 'hibernated' for wake-on-demand */
  async _hibernate(s) {
    if (!s || !s.client) return;
    try {
      await s.client.destroy();
    } catch {}
    s.status = "hibernated";
    s.client = null;
    s.hibernatedAt = Date.now();
    this._metrics.hibernations++;
  }

  /**
   * Enforce the active pool cap: if more sessions are live than HIBERNATE_MAX_ACTIVE,
   * hibernate the least recently active ones until we're within budget.
   */
  async _enforceActivePoolCap() {
    const live = this._byOldest().filter((s) => s.status === "connected");
    const excess = live.length - HIBERNATE_MAX_ACTIVE;
    if (excess <= 0) return;
    // Hibernate the oldest (least recently active) sessions
    for (let i = 0; i < excess; i++) {
      const s = live[i];
      if (s) {
        console.log(
          `[wa] [${s.id}] pool-cap hibernate (${live.length}/${HIBERNATE_MAX_ACTIVE})`,
        );
        await this._hibernate(s).catch(() => {});
      }
    }
  }

  /**
   * Wake a hibernated session. Concurrency-controlled to prevent reconnect storms.
   * Returns the session once connected or throws on timeout.
   */
  async _wakeSession(userId) {
    const s = this.sessions.get(userId);
    if (!s || (s.status !== "hibernated" && s.status !== "idle-closed")) return s;

    // If already waking, wait for the existing wake to complete
    if (this._wakingNow.has(userId)) {
      return this._waitForWake(userId);
    }

    // Concurrency gate: wait if too many wakes in flight
    while (this._wakingNow.size >= HIBERNATE_MAX_WAKES) {
      await sleep(500);
    }

    // Make room in the active pool by hibernating LRU sessions
    const liveSessions = Array.from(this.sessions.values()).filter(
      (x) => x.client && x.status === "connected",
    );
    if (liveSessions.length >= HIBERNATE_MAX_ACTIVE) {
      // Hibernate the oldest connected session (not the one we're waking)
      const oldest = liveSessions
        .filter((x) => x.id !== userId)
        .sort((a, b) => (a.lastActivityAt || 0) - (b.lastActivityAt || 0))[0];
      if (oldest) {
        console.log(`[wa] [${oldest.id}] pool-evict for wake of ${userId}`);
        await this._hibernate(oldest).catch(() => {});
      }
    }

    this._wakingNow.add(userId);
    const t0 = Date.now();
    console.log(`[wa] [${userId}] waking from hibernation...`);

    try {
      // Re-start the session (will reuse LocalAuth from disk)
      const restarted = await this.start(userId);
      // Wait against the live map entry because start() may replace the old
      // object reference when reviving a hibernated/idle-closed session.
      const deadline = Date.now() + HIBERNATE_WAKE_TIMEOUT;
      let live = this.sessions.get(userId) || restarted;
      while (Date.now() < deadline && live.status !== "connected") {
        await sleep(500);
        live = this.sessions.get(userId) || live;
      }
      if (live.status !== "connected") {
        this._metrics.wakeFails++;
        throw new Error(`wake timeout after ${HIBERNATE_WAKE_TIMEOUT}ms`);
      }
      const wakeMs = Date.now() - t0;
      this._metrics.wakes++;
      this._metrics._wakeTotal += wakeMs;
      this._metrics.avgWakeMs = Math.round(
        this._metrics._wakeTotal / this._metrics.wakes,
      );
      console.log(`[wa] [${userId}] woke in ${wakeMs}ms`);

      // Resolve any waiters
      this._resolveWaiters(userId, live);
      return live;
    } catch (err) {
      this._rejectWaiters(userId, err);
      throw err;
    } finally {
      this._wakingNow.delete(userId);
    }
  }

  /** Wait for an in-progress wake to complete (used by concurrent callers) */
  _waitForWake(userId) {
    return new Promise((resolve, reject) => {
      if (!this._wakeWaiters.has(userId)) this._wakeWaiters.set(userId, []);
      const timer = setTimeout(
        () => reject(new Error("wake wait timeout")),
        HIBERNATE_WAKE_TIMEOUT + 5000,
      );
      this._wakeWaiters.get(userId).push({ resolve, reject, timer });
    });
  }

  _resolveWaiters(userId, session) {
    const waiters = this._wakeWaiters.get(userId) || [];
    this._wakeWaiters.delete(userId);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve(session);
    }
  }

  _rejectWaiters(userId, err) {
    const waiters = this._wakeWaiters.get(userId) || [];
    this._wakeWaiters.delete(userId);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  /**
   * Schedule an auto-reconnect with exponential backoff.
   * Called when a session disconnects for a non-logout reason.
   * Attempts: 5s -> 15s -> 30s -> 60s -> 120s -> 300s (max)
   * After 8 failures (auth likely dead), pauses for 30min then resets.
   */
  _scheduleReconnect(userId) {
    // Cancel any existing timer first
    if (this._reconnectTimers.has(userId)) {
      clearTimeout(this._reconnectTimers.get(userId));
      this._reconnectTimers.delete(userId);
    }

    const attempt = this._reconnectAttempts.get(userId) || 0;
    this._reconnectAttempts.set(userId, attempt + 1);

    // Exponential backoff delays (ms)
    const DELAYS = [5000, 15000, 30000, 60000, 120000, 300000];
    const delayMs = DELAYS[Math.min(attempt, DELAYS.length - 1)];

    // After too many failures, pause long before retrying
    const MAX_FAST_ATTEMPTS = 8;
    const jitterMs = Math.floor(Math.random() * Math.min(10_000, Math.max(1_000, delayMs * 0.25)));
    const pauseMs = (attempt >= MAX_FAST_ATTEMPTS ? 30 * 60 * 1000 : delayMs) + jitterMs;

    if (attempt >= MAX_FAST_ATTEMPTS && attempt % MAX_FAST_ATTEMPTS === 0) {
      console.warn(
        `[wa] [${userId}] reconnect: ${attempt} failures — pausing ${Math.round(pauseMs / 60000)}min before retry`,
      );
    } else {
      console.log(
        `[wa] [${userId}] reconnect: attempt #${attempt + 1} in ${Math.round(pauseMs / 1000)}s`,
      );
    }

    const timer = setTimeout(async () => {
      this._reconnectTimers.delete(userId);

      const s = this.sessions.get(userId);
      // Skip if already recovered, in qr mode, or removed by logout
      if (!s) return;
      if (
        s.status === "connected" ||
        s.status === "qr" ||
        s.status === "connecting" ||
        s.status === "pairing"
      ) {
        console.log(
          `[wa] [${userId}] reconnect cancelled — status already: ${s.status}`,
        );
        return;
      }

      // Verify auth data still exists on disk before trying
      const sessionFolder = path.join(SESSIONS_DIR, `session-${userId}`);
      try {
        await fs.access(sessionFolder);
      } catch {
        console.log(
          `[wa] [${userId}] reconnect aborted — no auth folder on disk`,
        );
        this.sessions.delete(userId);
        this._reconnectAttempts.delete(userId);
        return;
      }

      console.log(
        `[wa] [${userId}] reconnect: starting attempt #${attempt + 1}...`,
      );
      try {
        await this.start(userId);
        // After start(), the session will go through 'connecting' -> 'connected'.
        // If it hits 'qr', auth has expired — stop auto-reconnect.
        setTimeout(() => {
          const ss = this.sessions.get(userId);
          if (ss && ss.status === "qr") {
            console.warn(
              `[wa] [${userId}] reconnect: ended in QR — auth expired. Clearing reconnect state.`,
            );
            this._reconnectAttempts.delete(userId);
            // Don't reschedule — user must scan QR manually
          }
        }, 45000);
      } catch (e) {
        console.error(`[wa] [${userId}] reconnect start() failed:`, e.message);
        // Disconnected handler on the new client will reschedule
      }
    }, pauseMs);

    this._reconnectTimers.set(userId, timer);
    if (typeof timer.unref === "function") timer.unref();
  }

  async _enforceCapBeforeStart() {
    const cap = ENABLE_HIBERNATION ? HIBERNATE_MAX_ACTIVE : MAX_ACTIVE_SESSIONS;
    const live = Array.from(this.sessions.values()).filter((s) => s.client);
    if (live.length < cap) return;
    // LRU evict the oldest active session
    const oldest = this._byOldest()[0];
    if (oldest) {
      if (ENABLE_HIBERNATION) {
        console.log(
          `[wa] LRU-hibernate ${oldest.id} (live=${live.length}/${cap})`,
        );
        await this._hibernate(oldest).catch(() => {});
      } else {
        console.log(`[wa] LRU-evict ${oldest.id} (live=${live.length}/${cap})`);
        await this._closeChromium(oldest).catch(() => {});
      }
    }
  }

  /** Stats snapshot for /sessions/stats endpoint */
  stats() {
    const all = Array.from(this.sessions.values());
    const base = {
      max: ENABLE_HIBERNATION ? HIBERNATE_MAX_ACTIVE : MAX_ACTIVE_SESSIONS,
      maxAbsolute: MAX_ACTIVE_SESSIONS,
      total: all.length,
      live: all.filter((s) => s.client).length,
      connected: all.filter((s) => s.status === "connected").length,
      disconnected: all.filter((s) => s.status === "disconnected").length,
      connecting: all.filter((s) => s.status === "connecting").length,
      idleClosed: all.filter((s) => s.status === "idle-closed").length,
      idleEvictAfterHours: Math.round(IDLE_EVICT_MS / 3600000),
      hibernationEnabled: ENABLE_HIBERNATION,
      chromiumOptEnabled: ENABLE_CHROMIUM_OPT,
      reconnect: {
        pendingTimers: this._reconnectTimers.size,
        sessionsWithAttempts: this._reconnectAttempts.size,
        totalAttempts: Array.from(this._reconnectAttempts.values()).reduce(
          (a, b) => a + b,
          0,
        ),
        perSession: Object.fromEntries(this._reconnectAttempts),
      },
      health: {
        checkEveryMs: WA_HEALTH_CHECK_MS,
        maxFailures: WA_HEALTH_MAX_FAILURES,
        failingSessions: Object.fromEntries(this._healthFailures),
      },
      uptime: Math.floor(process.uptime()),
      memoryMB: Math.round(
        process.memoryUsage.rss
          ? process.memoryUsage.rss() / 1048576
          : process.memoryUsage().rss / 1048576,
      ),
    };
    if (ENABLE_HIBERNATION) {
      base.hibernated = all.filter((s) => s.status === "hibernated").length;
      base.waking = this._wakingNow.size;
      base.metrics = { ...this._metrics };
      delete base.metrics._wakeTotal;
    }
    return base;
  }

  async start(userId) {
    const existing = this.sessions.get(userId);
    if (
      existing &&
      existing.client &&
      (existing.status === "connected" ||
        existing.status === "qr" ||
        existing.status === "connecting" ||
        existing.status === "pairing")
    ) {
      this._touch(userId);
      return existing;
    }

    // If a previous client ended in a failed/disconnected state, destroy it
    // before replacing it. This avoids orphan Chromium/client objects during
    // reconnect storms while preserving valid connected/QR/connecting clients.
    if (existing?.client) {
      try {
        await existing.client.destroy();
      } catch {}
    }

    // Respect the active-session ceiling (LRU evict if needed)
    await this._enforceCapBeforeStart();

    await fs.mkdir(SESSIONS_DIR, { recursive: true });
    const hadAuthAtStart = await hasSessionAuth(userId);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: userId,
        dataPath: SESSIONS_DIR,
      }),
      puppeteer: {
        headless: true,
        args: getChromiumArgs(),
      },
    });

    const session = {
      id: userId,
      client,
      status: "connecting",
      qrDataUrl: null,
      pairingCode: null,
      phone: null,
      lastActivityAt: Date.now(),
      connectedAt: null,
      hibernatedAt: null,
      priority: 0,
      hadAuthAtStart,
      qrRestoreRetries: existing?.qrRestoreRetries || 0,
      qrTimer: null,
    };
    this.sessions.set(userId, session);

    client.on("qr", async (qrStr) => {
      try {
        // During post-restart LocalAuth restore, whatsapp-web.js may emit QR
        // before the session fully settles. Do not force customers into a QR
        // re-auth immediately; wait briefly and retry once while preserving auth.
        if (
          session.hadAuthAtStart &&
          !session.connectedAt &&
          session.qrRestoreRetries < AUTH_RESTORE_QR_MAX_RETRIES
        ) {
          if (!session.qrTimer) {
            session.status = "connecting";
            session.qrRestoreRetries += 1;
            console.warn(
              `[wa] [${userId}] QR during auth restore — retry ${session.qrRestoreRetries}/${AUTH_RESTORE_QR_MAX_RETRIES} in ${Math.round(AUTH_RESTORE_QR_GRACE_MS / 1000)}s`,
            );
            session.qrTimer = setTimeout(async () => {
              session.qrTimer = null;
              const live = this.sessions.get(userId);
              if (!live || live !== session || live.status === "connected") return;
              try {
                await client.destroy();
              } catch {}
              live.client = null;
              live.status = "disconnected";
              this.start(userId).catch((e) => {
                console.error(`[wa] [${userId}] auth-restore QR retry failed:`, e?.message || e);
              });
            }, AUTH_RESTORE_QR_GRACE_MS);
            if (typeof session.qrTimer.unref === "function") session.qrTimer.unref();
          }
          return;
        }

        session.qrDataUrl = await qrcode.toDataURL(qrStr, {
          margin: 1,
          scale: 6,
        });
        session.status = "qr";
        console.log(`[wa] [${userId}] QR ready`);
      } catch (e) {
        console.error("[wa] qr encode error", e);
      }
    });

    client.on("authenticated", () => {
      console.log(`[wa] [${userId}] authenticated`);
      session.status = "connecting";
      session.qrDataUrl = null;
      session.pairingCode = null;
    });

    client.on("auth_failure", (msg) => {
      console.error(`[wa] [${userId}] auth failure:`, msg);
      if (session.qrTimer) {
        clearTimeout(session.qrTimer);
        session.qrTimer = null;
      }
      session.status = "disconnected";
      // Do not delete auth here. A transient Chromium/web init issue can look
      // like auth failure; let reconnect/backoff decide before requiring QR.
      this._scheduleReconnect(userId);
    });

    client.on("ready", () => {
      session.status = "connected";
      session.qrDataUrl = null;
      session.pairingCode = null;
      session.phone = client.info?.wid?.user || null;
      session.connectedAt = Date.now();
      session.lastActivityAt = Date.now();
      session.qrRestoreRetries = 0;
      if (session.qrTimer) {
        clearTimeout(session.qrTimer);
        session.qrTimer = null;
      }
      // Clear reconnect state — successfully recovered.
      this._reconnectAttempts.delete(userId);
      if (this._reconnectTimers.has(userId)) {
        clearTimeout(this._reconnectTimers.get(userId));
        this._reconnectTimers.delete(userId);
      }
      console.log(
        `[wa] [${userId}] connected as ${session.phone} (reconnect attempts cleared)`,
      );
      notifySaas({ event: "connected", userId, phone: session.phone }).catch(
        () => {},
      );
    });

    client.on("disconnected", async (reason) => {
      const isLogout = String(reason).toUpperCase().includes("LOGOUT");
      console.warn(
        `[wa] [${userId}] DISCONNECTED reason="${reason}" isLogout=${isLogout} timestamp=${new Date().toISOString()}`,
      );

      session.status = "disconnected";
      if (session.qrTimer) {
        clearTimeout(session.qrTimer);
        session.qrTimer = null;
      }

      // Always notify SAAS so bot.whatsappStatus stays in sync in the DB.
      notifySaas({
        event: "disconnected",
        userId,
        reason: String(reason),
      }).catch(() => {});

      if (isLogout) {
        // Intentional device unlink — wipe auth, permanently remove session.
        this.sessions.delete(userId);
        this._reconnectAttempts.delete(userId);
        if (this._reconnectTimers.has(userId)) {
          clearTimeout(this._reconnectTimers.get(userId));
          this._reconnectTimers.delete(userId);
        }
        const folder = path.join(SESSIONS_DIR, `session-${userId}`);
        await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
        return;
      }

      // Transient disconnect — keep session in map (status='disconnected'),
      // free the old Chromium process, schedule auto-reconnect.
      session.client = null;
      try {
        await client.destroy();
      } catch {}

      this._scheduleReconnect(userId);
    });

    client.on("message", async (msg) => {
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

        if (msg.from.endsWith("@c.us")) {
          // @c.us JID = the digits ARE the real phone (E.164 without '+').
          fromPhone = "+" + msg.from.replace("@c.us", "");
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
            typeof jid === "string" && jid.endsWith("@c.us")
              ? "+" + jid.replace("@c.us", "")
              : null;

          fromPhone =
            trySerialized(contact?.id?._serialized) ||
            trySerialized(msg.author);

          if (!fromPhone) {
            const lid = msg.from.replace(/@.*$/, "");
            fromPhone = "lid:" + lid;
            console.warn(
              `[wa] [${userId}] LID-only contact: msg.from=${msg.from} contact.id=${contact?.id?._serialized || ""} contact.number=${contact?.number || ""}; stored as ${fromPhone}`,
            );
          }
        }

        const senderName = contact?.pushname || contact?.name || null;

        let text = msg.body || "";
        let mediaType = "text";
        let mediaBase64 = null;
        let mimetype = null;

        if (msg.hasMedia) {
          if (msg.type === "audio" || msg.type === "ptt") {
            mediaType = "voice";
          } else if (msg.type === "image") {
            mediaType = "image";
          } else if (msg.type === "video") {
            mediaType = "video";
          } else if (msg.type === "document") {
            mediaType = "document";
          }
          try {
            const media = await msg.downloadMedia();
            if (media) {
              mediaBase64 = media.data;
              mimetype = media.mimetype;
            }
          } catch (e) {
            console.error("[wa] media download failed:", e.message);
          }
        }

        console.log(
          `[wa] [${userId}] IN  ${fromPhone} (${mediaType}) len=${text.length}: ${text.slice(0, 80)}`,
        );

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
          event: "incoming",
          userId,
          from: { phone: fromPhone, name: senderName },
          mediaType,
          text,
          mediaBase64,
          mimetype,
          providerMessageId: msg.id?._serialized || msg.id?.id || null,
          providerTimestamp: msg.timestamp || null,
        });
        const dt = Date.now() - t0;

        if (!result) {
          if (typingInterval) clearInterval(typingInterval);
          try {
            await chat.clearState();
          } catch {}
          console.error(
            `[wa] [${userId}] SAAS_FAIL after ${dt}ms — no reply sent to customer`,
          );
          return;
        }
        if (!result.reply) {
          if (typingInterval) clearInterval(typingInterval);
          try {
            await chat.clearState();
          } catch {}
          console.log(
            `[wa] [${userId}] saas ok (${dt}ms) but no reply (subscription/trial limit?)`,
          );
          return;
        }

        // ---- Wave 5: human-like delays from saas response -----------------
        // The saas may instruct us to wait `preDelayMs` (reading time) before
        // typing, and to keep typing for `typingDelayMs` (proportional to
        // reply length) before actually sending.
        const preDelayMs = Math.max(
          0,
          Math.min(3000, Number(result.preDelayMs) || 0),
        );
        const typingDelayMs = Math.max(
          0,
          Math.min(8000, Number(result.typingDelayMs) || 0),
        );

        if (preDelayMs > 0) {
          // Stop the in-LLM typing indicator briefly to mimic "reading" pause
          try {
            await chat.clearState();
          } catch {}
          if (typingInterval) {
            clearInterval(typingInterval);
            typingInterval = null;
          }
          await sleep(preDelayMs);
        }
        if (typingDelayMs > 0) {
          try {
            await chat.sendStateTyping();
          } catch {}
          if (!typingInterval) {
            typingInterval = setInterval(() => {
              chat.sendStateTyping().catch(() => {});
            }, 15000);
          }
          await sleep(typingDelayMs);
        }

        if (typingInterval) clearInterval(typingInterval);
        try {
          await chat.clearState();
        } catch {}

        try {
          await sendMessageReliably({
            client,
            userId,
            jid: msg.from,
            recipient: fromPhone,
            text: result.reply,
            loggerPrefix: `[wa] [${userId}] auto_reply`,
          });
          const totalDelay = preDelayMs + typingDelayMs;
          console.log(
            `[wa] [${userId}] OUT ${fromPhone} (llm:${dt}ms+human:${totalDelay}ms): ${String(result.reply).slice(0, 80)}`,
          );
        } catch (sendErr) {
          console.error(
            `[wa] [${userId}] SEND_FAIL to ${msg.from}:`,
            sendErr.message,
          );
          notifySaas({
            event: "send_failed",
            userId,
            to: fromPhone,
            reason: sendErr?.message || String(sendErr),
            source: "auto_reply",
          }).catch(() => {});
        }
      } catch (e) {
        console.error("[wa] message handler error:", e);
      }
    });

    // Initialize asynchronously; do not await so we return fast
    client.initialize().catch((e) => {
      console.error(`[wa] [${userId}] initialize error:`, e.message || e);
      session.status = "disconnected";
      // Schedule a reconnect — the init failure might be transient (Chromium crash, etc.)
      this._scheduleReconnect(userId);
    });

    return session;
  }

  async requestPairingCode(userId, phoneNumber) {
    let s = this.sessions.get(userId);
    if (!s) s = await this.start(userId);
    const clean = String(phoneNumber).replace(/[^\d]/g, "");
    if (!clean) throw new Error("invalid phone");

    // Wait until the puppeteer page reaches a state where pairing code can be requested
    // (whatsapp-web.js requires the QR phase to be active first)
    const start = Date.now();
    while (Date.now() - start < 30000) {
      try {
        const code = await s.client.requestPairingCode(clean);
        s.pairingCode = code;
        s.status = "pairing";
        console.log(`[wa] [${userId}] pairing code: ${code} for +${clean}`);
        return code;
      } catch (e) {
        // Not ready yet; wait and retry
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error("timeout waiting for pairing code");
  }

  async send(userId, toPhone, text) {
    try {
      let s = this.sessions.get(userId);
      const waitForConnected = async (session, timeoutMs = 20000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs && session?.status !== "connected") {
          await sleep(500);
          session = this.sessions.get(userId) || session;
        }
        return session;
      };

      // Auto-start if auth exists on disk but the in-memory session has not
      // been restored yet (common immediately after service restart/deploy).
      if (!s) {
        const sessionFolder = path.join(SESSIONS_DIR, `session-${userId}`);
        try {
          await fs.access(sessionFolder);
          console.log(`[wa] [${userId}] auto-start on send() from saved auth`);
          s = await this.start(userId);
        } catch {}
      }
      // Auto-wake from hibernation (smart scaling)
      if (s && s.status === "hibernated" && ENABLE_HIBERNATION) {
        console.log(`[wa] [${userId}] auto-wake on send()`);
        s = await this._wakeSession(userId);
      }
      // Auto-resume if Chromium was evicted or the reconnect timer has not run
      // yet, but auth is still available.
      if (s && (s.status === "idle-closed" || s.status === "disconnected")) {
        console.log(`[wa] [${userId}] auto-resume on send() from ${s.status}`);
        s = await this.start(userId);
      }
      if (s && (s.status === "connecting" || s.status === "pairing")) {
        s = await waitForConnected(s);
      }
      if (!s || s.status !== "connected")
        throw new Error(`session not connected (status=${s?.status || "missing"})`);
      s.lastActivityAt = Date.now();

      // Reject contacts whose stored "phone" is actually a WhatsApp LID.
      // We never had a real phone number for these so we can't initiate a send.
      if (
        typeof toPhone === "string" &&
        (toPhone.startsWith("lid:") || toPhone.includes("@lid"))
      ) {
        throw new Error(
          "cannot initiate send to WhatsApp LID; no public phone available",
        );
      }

      const cleaned = String(toPhone || "")
        .replace(/^\+/, "")
        .replace(/[^\d]/g, "");
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
        throw new Error("number not registered on WhatsApp");
      }
      return await sendMessageReliably({
        client: s.client,
        userId,
        jid: numberId._serialized,
        recipient: cleaned,
        text,
        loggerPrefix: `[wa] [${userId}] direct_send`,
      });
    } catch (e) {
      notifySaas({
        event: "send_failed",
        userId,
        to: toPhone,
        reason: e?.message || String(e),
        source: "direct_send",
      }).catch(() => {});
      throw e;
    }
  }

  async logout(userId) {
    const s = this.sessions.get(userId);
    if (s?.client) {
      try {
        await s.client.logout();
      } catch {}
      try {
        await s.client.destroy();
      } catch {}
    }
    const folder = path.join(SESSIONS_DIR, `session-${userId}`);
    await fs.rm(folder, { recursive: true, force: true }).catch(() => {});
    this.sessions.delete(userId);
  }
}

async function notifySaas(payload) {
  try {
    const res = await fetch(SAAS_INCOMING_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SAAS_INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[wa] saas responded", res.status);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (e) {
    console.error("[wa] saas unreachable:", e.message);
    return null;
  }
}

export const manager = new SessionManager();
