#!/usr/bin/env node
"use strict";
// KEYONE WhatsApp Bridge — whatsapp-web.js transport.
//
// Proven root cause (2026-07-06): WhatsApp refuses to COMPLETE companion pairing
// for reimplemented multi-device clients (whatsmeow, Baileys) on customer
// accounts — the scan never returns a pair-success and the QR times out. The
// genuine WhatsApp Web client (whatsapp-web.js driving real Chromium) pairs every
// time — it is what the working Recovery/Import flow uses. So the Bridge transport
// is whatsapp-web.js.
//
// This process speaks the EXACT SAME gateway WebSocket protocol as the Go bridge
// (hello / heartbeat / state / link_artifact / inbound / log up; control / outbound
// down), so the gateway and the Dashboard are UNCHANGED — the customer sees no
// difference except that pairing now works.
//
//   keyone-wa-bridge login [name]   device-code link this host to a workspace
//   keyone-wa-bridge start          run the bridge (connect + WhatsApp transport)
//
// Env: KEYONE_CLOUD_API (https://w.keyone1.com), KEYONE_CLOUD_WS
//      (wss://w.keyone1.com/bridge), KEYONE_BRIDGE_HOME, KEYONE_CHROME
//      (Chrome/Chromium executablePath; falls back to bundled puppeteer).

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const https = require("https");
const WebSocket = require("ws");
const { Client, LocalAuth } = require("whatsapp-web.js");

const CLOUD_API = process.env.KEYONE_CLOUD_API || "https://w.keyone1.com";
const CLOUD_WS = process.env.KEYONE_CLOUD_WS || "wss://w.keyone1.com/bridge";
const HOME = process.env.KEYONE_BRIDGE_HOME || path.join(os.homedir(), ".keyone-wa-bridge");
// WhatsApp engine: use the puppeteer-MATCHED Chromium (the exact build the
// production Recovery/Import client pairs with). Proven root cause (2026-07-07):
// driving the customer's SYSTEM Chrome makes wwebjs fire `authenticated` and hit
// `loading 100%` but NEVER fire `ready`, so the Bridge never publishes
// `connected` and the Dashboard hangs on "Generating QR". A system Chrome is
// therefore honored ONLY as an explicit opt-in (KEYONE_CHROME_FORCE=1); by
// default we download + use the matched Chromium, identical on every OS.
const FORCE_SYSTEM_CHROME =
  process.env.KEYONE_CHROME_FORCE === "1" && process.env.KEYONE_CHROME
    ? process.env.KEYONE_CHROME
    : "";
// Respect a build-time PUPPETEER_CACHE_DIR (Docker bakes Chromium in there);
// otherwise download into the Bridge home so it persists across restarts.
const PUP_CACHE = process.env.PUPPETEER_CACHE_DIR || path.join(HOME, "chromium");
let chromePath = null;
const VERSION = "1.0.9-wweb";
// Pin a known-current WhatsApp Web build instead of trusting whatsapp-web.js's
// bundled default (2.3000.1017054665, baked in at npm-publish time). Root cause
// (2026-07-12, field report): a customer's phone confirmed the device as
// LINKED/Active, but the Dashboard never left "connecting" and a fresh QR kept
// reappearing. whatsapp-web.js's `type: 'local'` cache only helps SUBSEQUENT
// connects on a session that already succeeded once — the customer's PRODUCTION
// wa-service sessions still work because they cached a good version long ago.
// A brand-new pairing (every new Bridge customer) instead fetches whatever
// WhatsApp serves live TODAY; if that has drifted past what this whatsapp-web.js
// release's page-injection code (LoadUtils/Store hooks) expects, `authenticated`
// fires (WhatsApp's server accepted the phone-side pairing) but the in-page
// injection silently stalls and `ready` never fires — with authTimeoutMs
// defaulting to 0 (no timeout) inside the library itself, it would hang forever
// were it not for our own auth-watchdog surfacing it as a QR-regeneration loop.
// Pinning a fetched-and-verified-live WA Web build removes the drift.
const WEB_VERSION = "2.3000.1043030358-alpha";
const WEB_VERSION_CACHE = {
  type: "remote",
  remotePath: `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WEB_VERSION}.html`,
};
const PROVIDER = "whatsapp";
fs.mkdirSync(HOME, { recursive: true });
const CFG = path.join(HOME, "config.json");

// ------------------------------------------------------------------ logging ---
const logRing = [];
// On macOS/Linux the service manager captures stdout (launchd StandardOutPath /
// journald). The Windows Scheduled Task captures NOTHING, so the daemon mirrors
// its lines to HOME/bridge.out.log there — `keyone-bridge logs` works on every OS.
let daemonFileLog = false;
function log(level, msg) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`;
  console.log(line);
  if (daemonFileLog) {
    try {
      const f = path.join(HOME, "bridge.out.log");
      try {
        if (fs.existsSync(f) && fs.statSync(f).size > 2_000_000)
          fs.renameSync(f, path.join(HOME, "bridge.out.log.1"));
      } catch {}
      fs.appendFileSync(f, line + "\n");
    } catch {}
  }
  logRing.push({ level, message: String(msg).slice(0, 2000) });
  if (logRing.length > 500) logRing.splice(0, logRing.length - 500);
}

// ------------------------------------------------------------------- config ---
function loadCfg() { try { return JSON.parse(fs.readFileSync(CFG, "utf8")); } catch { return {}; } }
function saveCfg(c) { fs.writeFileSync(CFG, JSON.stringify(c, null, 2), { mode: 0o600 }); }

// ------------------------------------------------------ auto-update (from store) --
const DL_BASE = process.env.KEYONE_BRIDGE_DOWNLOAD_BASE || `${CLOUD_API}/downloads/keyone-bridge`;
function getURL(url, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > 5) return reject(new Error("too many redirects"));
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
        return getURL(new URL(r.headers.location, url).toString(), depth + 1).then(resolve, reject);
      if (r.statusCode !== 200) return reject(new Error("HTTP " + r.statusCode));
      const ch = []; r.on("data", (d) => ch.push(d)); r.on("end", () => resolve(Buffer.concat(ch)));
    }).on("error", reject);
  });
}
function isNewer(cur, latest) {
  const p = (s) => String(s).replace(/[^0-9.].*$/, "").split(".").map((n) => Number(n) || 0);
  const a = p(cur), b = p(latest);
  for (let i = 0; i < 3; i++) { if ((b[i] || 0) > (a[i] || 0)) return true; if ((b[i] || 0) < (a[i] || 0)) return false; }
  return false;
}
// `update`: platform-agnostic self-update of the app/ dir (keyone-wa-bridge.js +
// node_modules) from the KEYONE store, keeping the bundled node. Restart to apply.
// Returns "updated" | "current" | "not_bundle" | "no_app" | "rolled_back" so the
// daemon's auto-update path can act on the outcome (the CLI just prints).
async function cmdUpdate() {
  const APPDIR = __dirname;                 // <bundle>/app
  const ROOT = path.dirname(APPDIR);        // <bundle>
  const bundled = fs.existsSync(path.join(ROOT, "node")) || fs.existsSync(path.join(ROOT, "node.exe"));
  if (!bundled) { console.log("update: not an installed bundle (run the installer to update)."); return "not_bundle"; }
  // `update --rollback`: restore the previous app/ that a prior update staged as
  // app.old (recovery after a bad update). Restart the service to apply.
  if (process.argv.slice(3).includes("--rollback")) {
    const old = path.join(ROOT, "app.old");
    if (!fs.existsSync(old)) { console.log("rollback: no previous version (app.old) to restore — reinstall from the KEYONE store."); return "no_app"; }
    const tmp = path.join(ROOT, "app.rollback.tmp"); fs.rmSync(tmp, { recursive: true, force: true });
    fs.renameSync(APPDIR, tmp);
    // If putting app.old in place fails (e.g. a lock/AV on Windows), restore the
    // current app/ from tmp so the running app dir is NEVER left missing.
    try { fs.renameSync(old, APPDIR); }
    catch (e) { try { if (!fs.existsSync(APPDIR)) fs.renameSync(tmp, APPDIR); } catch {} throw e; }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("rolled back to the previous version — restart the service to apply.");
    return "rolled_back";
  }
  const man = JSON.parse((await getURL(DL_BASE + "/version.json")).toString());
  if (!man.app || !man.app.file) { console.log("update: manifest has no app package."); return "no_app"; }
  if (!isNewer(VERSION, man.version)) { console.log("already up to date (" + VERSION + ")"); return "current"; }
  console.log("updating " + VERSION + " → " + man.version + " …");
  const buf = await getURL(DL_BASE + "/" + man.app.file);
  const sum = crypto.createHash("sha256").update(buf).digest("hex");
  // Checksum verification is MANDATORY, not opt-in — a manifest missing sha256
  // (compromised store, MITM strip, publish bug) must never install unverified code.
  if (!man.app.sha256) throw new Error("update manifest missing sha256 — refusing to install unverified code");
  if (sum !== man.app.sha256) throw new Error("checksum mismatch — aborting update");
  const stage = path.join(ROOT, "app.new");
  fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });
  const tgz = path.join(ROOT, "app.tgz"); fs.writeFileSync(tgz, buf);
  require("child_process").execFileSync("tar", ["xzf", tgz, "-C", stage]);
  fs.rmSync(tgz, { force: true });
  const old = path.join(ROOT, "app.old"); fs.rmSync(old, { recursive: true, force: true });
  fs.renameSync(APPDIR, old);
  // If swapping in the new app/ fails, restore the previous app/ from app.old so
  // the running app dir is never left missing (a failed update self-heals).
  try { fs.renameSync(stage, APPDIR); }
  catch (e) { try { if (!fs.existsSync(APPDIR)) fs.renameSync(old, APPDIR); } catch {} throw e; }
  console.log("updated to " + man.version + " — restart the service to apply.");
  return "updated";
}

// ---------------------------------------------------------------- http (JSON) --
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = https.request(
      { method: "POST", hostname: u.hostname, path: u.pathname + u.search, port: u.port || 443,
        headers: { "content-type": "application/json", "content-length": data.length } },
      (res) => { let b = ""; res.on("data", (d) => (b += d)); res.on("end", () => {
        let j = null; try { j = JSON.parse(b); } catch {}
        resolve({ status: res.statusCode, json: j, raw: b }); }); }
    );
    req.on("error", reject); req.write(data); req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----------------------------------------------------- device-code login (RFC 8628)
async function cmdLogin(name) {
  const cfg = loadCfg();
  // PKCE (RFC 7636 S256): proof-of-possession for the device_code exchange.
  const verifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const start = await postJSON(`${CLOUD_API}/api/bridge/v1/device/start`, { name: name || os.hostname(), codeChallenge, providers: [PROVIDER] });
  if (start.status !== 200 || !start.json?.device_code) throw new Error(`device/start failed: ${start.status} ${start.raw}`);
  const { device_code, user_code, verification_uri, interval } = start.json;
  console.log(`\n  Link this Bridge — approve the code in the KEYONE dashboard:\n    URL:  ${verification_uri || CLOUD_API + "/dashboard/settings/bridge/link"}\n    Code: ${user_code}\n  (waiting for approval…)\n`);
  const poll = Math.max(2, Number(interval) || 5) * 1000;
  for (;;) {
    await sleep(poll);
    const tok = await postJSON(`${CLOUD_API}/api/bridge/v1/device/token`, { device_code, code_verifier: verifier });
    if (tok.status === 200 && tok.json?.bridge_token) {
      cfg.token = tok.json.bridge_token; cfg.bridgeId = tok.json.bridge_id; cfg.workspaceId = tok.json.workspace_id;
      cfg.name = name || os.hostname(); saveCfg(cfg);
      console.log(`\n  ✓ Linked. bridge=${cfg.bridgeId}\n  Start it with:  keyone-wa-bridge start\n`);
      return;
    }
    if (tok.json?.error && !/authorization_pending|slow_down/.test(tok.json.error)) throw new Error(`login failed: ${tok.json.error}`);
  }
}

// =================================================================== runtime ===
let ws = null, wsSeq = 0, hbTimer = null, logTimer = null, reconnectDelay = 1000, reconnectTimer = null;
let lastRxAt = 0, updateTimer = null, shuttingDown = false;

// ------------------------------------------------- single-instance lock ------
// TWO bridge processes on one home = two whatsapp-web.js Clients on the SAME
// LocalAuth session → WhatsApp force-LOGOUTs the device (one web session per
// device) and pairing loops forever. This happened in the field: the service
// daemon + a manual `keyone-bridge start` (which our own docs suggest as a
// remedy) ran side by side. The lock makes any extra `start` WAIT — it never
// exits, so a KeepAlive/systemd/Task daemon parks quietly until the other copy
// stops, then takes over cleanly.
const LOCK = path.join(HOME, "bridge.lock");
let lockBeat = null;
function lockHolder() {
  try {
    const st = fs.statSync(LOCK);
    // The owner refreshes the lock's mtime every 30s. An old mtime means the
    // owner is gone even if the recorded pid was recycled by another process
    // (containers/reboots recycle low pids all the time).
    if (Date.now() - st.mtimeMs > 120_000) return 0;
    const pid = Number(fs.readFileSync(LOCK, "utf8").trim());
    if (!pid || pid === process.pid) return 0;
    process.kill(pid, 0); // throws when that pid no longer exists → stale lock
    return pid;
  } catch { return 0; }
}
async function acquireLock() {
  let warned = 0;
  for (;;) {
    if (!lockHolder()) {
      try { fs.writeFileSync(LOCK, String(process.pid), { mode: 0o600 }); } catch {}
      if (lockHolder() === 0) {
        clearInterval(lockBeat);
        lockBeat = setInterval(() => {
          try {
            // keep ownership fresh; re-assert if something clobbered the file
            if (Number(fs.readFileSync(LOCK, "utf8").trim()) === process.pid) {
              const now = new Date(); fs.utimesSync(LOCK, now, now);
            }
          } catch {}
        }, 30_000);
        if (typeof lockBeat.unref === "function") lockBeat.unref();
        return; // we own the file (last writer wins → loop converges to ONE owner)
      }
    } else if (Date.now() - warned > 60_000) {
      warned = Date.now();
      log("warn", `another keyone-wa-bridge (pid ${lockHolder()}) already runs on this machine — waiting (ONE runtime per machine; stop the other copy to hand over)`);
    }
    await sleep(5000);
  }
}
function releaseLock() {
  clearInterval(lockBeat); lockBeat = null;
  try { if (Number(fs.readFileSync(LOCK, "utf8").trim()) === process.pid) fs.rmSync(LOCK, { force: true }); } catch {}
}
// WhatsApp engine — STRICT singleton. `waInit` memoizes the in-flight creation so
// concurrent ensureWa() callers (resume-on-connect + start_qr + reconnect) can
// NEVER construct a second Client/Browser. A second client on the SAME LocalAuth
// session makes WhatsApp emit LOGOUT (only one web session per device) → the
// "connected ×N → LOGOUT → QR forever" loop. `connectedOnce` makes the connected
// event fire exactly once per session. `waSeq`/`wsSeq` are object ids for logs.
let wa = null, waInit = null, waSeq = 0, waReady = false, waIdentity = "", linking = false, connectedOnce = false;
let authWatchdog = null; // cleared on destroy; fires if `ready` never follows `authenticated`
// Bounds the QR-during-restore suppression below — mirrors whatsapp-service/src/sessions.js
// (the proven original QR implementation), reset to 0 once `ready` actually fires.
let restoreRetries = 0;
const AUTH_RESTORE_QR_GRACE_MS = 60_000;
const AUTH_RESTORE_QR_MAX_RETRIES = 1;
function sessionAuthDir(cfg) { return path.join(HOME, "wweb", "session-" + (cfg.bridgeId || "keyone")); }
function hasExistingSession(cfg) { try { return fs.readdirSync(sessionAuthDir(cfg)).length > 0; } catch { return false; } }

function frame(type, payload, corr) {
  return JSON.stringify({ v: 1, id: crypto.randomUUID(), type, ts: Date.now(), corr, payload });
}
function wsSend(type, payload, corr) { try { if (ws && ws.readyState === WebSocket.OPEN) ws.send(frame(type, payload, corr)); } catch {} }

function sendState(state, identity) { wsSend("state", { provider: PROVIDER, state, identity: identity || "" }); }
function sendQr(code) { wsSend("link_artifact", { provider: PROVIDER, kind: "qr", data: code, expiresAt: Date.now() + 25000 }); }

// ------------------------------------------------------- whatsapp-web.js engine
// Resolve the WhatsApp engine (Chromium). Downloads the puppeteer-PINNED build
// once into KEYONE_BRIDGE_HOME/chromium — same version, same mechanism, on every
// OS. This is the config production pairs with; a system Chrome does not.
async function ensureChromium() {
  if (FORCE_SYSTEM_CHROME) return FORCE_SYSTEM_CHROME;
  if (chromePath && fs.existsSync(chromePath)) return chromePath;
  process.env.PUPPETEER_CACHE_DIR = PUP_CACHE;
  fs.mkdirSync(PUP_CACHE, { recursive: true });
  const puppeteer = require("puppeteer");
  let expected = "";
  try { expected = puppeteer.executablePath(); } catch {}
  if (expected && fs.existsSync(expected)) { chromePath = expected; return chromePath; }
  const browsers = require("@puppeteer/browsers");
  let buildId = "";
  try { buildId = puppeteer.PUPPETEER_REVISIONS && puppeteer.PUPPETEER_REVISIONS.chrome; } catch {}
  if (!buildId && expected) { const m = String(expected).match(/[\/\\](\d+\.[\d.]+)[\/\\]/); if (m) buildId = m[1]; }
  if (!buildId) buildId = await browsers.resolveBuildId("chrome", browsers.detectBrowserPlatform(), "stable");
  log("info", `whatsapp: preparing the WhatsApp engine (Chromium ${buildId}) — one-time download…`);
  const inst = await browsers.install({ browser: "chrome", buildId, cacheDir: PUP_CACHE });
  chromePath = (inst && inst.executablePath) || puppeteer.executablePath();
  log("info", "whatsapp: WhatsApp engine ready");
  return chromePath;
}

// Publish the single "connected" event for this session — IDEMPOTENT. `ready` may
// fire more than once (wwebjs internal reconnects); we surface exactly one.
function markConnected(identity, id) {
  if (connectedOnce) return;
  connectedOnce = true; waReady = true; linking = false;
  waIdentity = identity || waIdentity || "";
  sendState("connected", waIdentity);
  log("info", `whatsapp: connected as ${waIdentity} [wa#${id}]`);
}

// The ONE place a Client is torn down: strip listeners (so a dying client can
// never emit into shared state), destroy the browser, and reset ALL engine state
// so the next ensureWa() builds a clean singleton. Never auto-recreates.
async function destroyWa(reason) {
  if (authWatchdog) { clearTimeout(authWatchdog); authWatchdog = null; }
  const c = wa;
  wa = null; waInit = null; waReady = false; connectedOnce = false; linking = false;
  try { stopAllTyping(); } catch {}
  if (c) {
    try { c.removeAllListeners(); } catch {}
    try { await c.destroy(); } catch {}
    log("info", `whatsapp: engine stopped (${reason})`);
  }
}

// STRICT singleton. Memoizing the async creation in `waInit` closes the race where
// the old `if (wa) return` guard had an `await ensureChromium()` gap — concurrent
// callers would each build a Client. Now every concurrent caller awaits the SAME
// promise → exactly one Browser, one Client, one initialize(), one set of listeners.
function ensureWa(cfg) {
  if (waInit) return waInit;
  const hadAuthAtStart = hasExistingSession(cfg);
  let qrRestoreTimer = null;
  const p = (async () => {
    const exe = await ensureChromium();
    const id = ++waSeq;
    log("info", `whatsapp: initializing WhatsApp Web engine [wa#${id}] pid=${process.pid}${hadAuthAtStart ? " (existing session present)" : ""}`);
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: cfg.bridgeId || "keyone", dataPath: path.join(HOME, "wweb") }),
      webVersion: WEB_VERSION,
      webVersionCache: WEB_VERSION_CACHE,
      puppeteer: {
        headless: true,
        executablePath: exe,
        // Match the production Recovery/Import client exactly (the known-good args).
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-accelerated-2d-canvas", "--no-first-run", "--no-zygote", "--disable-gpu"],
      },
    });
    client.on("qr", (code) => {
      // whatsapp-web.js can emit a spurious `qr` while restoring an EXISTING
      // LocalAuth session (proven root cause, ported from the original working
      // implementation at whatsapp-service/src/sessions.js). Showing it would
      // discard a session that was about to reach `ready` and force an
      // unnecessary re-scan ("QR regeneration" / "never reaches READY").
      // Suppress it ONCE, give the restore a grace period, and only show a
      // real QR if it still hasn't connected (or there was no prior session).
      if (hadAuthAtStart && !connectedOnce && restoreRetries < AUTH_RESTORE_QR_MAX_RETRIES && !qrRestoreTimer) {
        restoreRetries++;
        log("warn", `whatsapp: QR during auth restore — suppressing, retry ${restoreRetries}/${AUTH_RESTORE_QR_MAX_RETRIES} in ${AUTH_RESTORE_QR_GRACE_MS / 1000}s [wa#${id}]`);
        qrRestoreTimer = setTimeout(() => {
          qrRestoreTimer = null;
          if (waReady || wa !== client) return;
          log("warn", `whatsapp: auth restore did not settle — recreating engine [wa#${id}]`);
          destroyWa("auth-restore-retry").then(() => { ensureWa(cfg).catch(() => {}); }).catch(() => {});
        }, AUTH_RESTORE_QR_GRACE_MS);
        return;
      }
      linking = true; connectedOnce = false; sendState("linking", ""); sendQr(code); log("info", `whatsapp: QR ready — scan from the Dashboard [wa#${id}]`);
    });
    client.on("loading_screen", (pct) => log("info", `whatsapp: loading ${pct}% [wa#${id}]`));
    client.on("authenticated", () => {
      log("info", `whatsapp: QR scanned — authenticating [wa#${id}]`);
      // Watchdog: WhatsApp auth should complete within 90s. If `ready` never fires,
      // the session files are likely corrupted (e.g. process was killed mid-auth).
      // Auto-clear the session so the next start_qr generates a clean QR.
      if (authWatchdog) clearTimeout(authWatchdog);
      authWatchdog = setTimeout(() => {
        authWatchdog = null;
        if (waReady || wa !== client) return;
        log("warn", `whatsapp: auth watchdog — ready never fired after 90s, clearing corrupted session [wa#${id}]`);
        destroyWa("auth-watchdog").then(() => {
          try { fs.rmSync(path.join(HOME, "wweb"), { recursive: true, force: true }); } catch {}
          log("info", "whatsapp: session cleared — send start_qr from the Dashboard for a fresh QR");
          sendState("disconnected", "");
        }).catch(() => {});
      }, 90_000);
    });
    client.on("auth_failure", (m) => { log("error", `whatsapp: auth failure: ${m} [wa#${id}]`); sendState("disconnected", ""); });
    client.on("ready", () => {
      if (authWatchdog) { clearTimeout(authWatchdog); authWatchdog = null; }
      if (qrRestoreTimer) { clearTimeout(qrRestoreTimer); qrRestoreTimer = null; }
      restoreRetries = 0;
      markConnected((client.info && client.info.wid && client.info.wid.user) || "", id);
    });
    client.on("disconnected", (r) => {
      const logout = String(r).toUpperCase().includes("LOGOUT");
      log("warn", `whatsapp: disconnected (${r}) [wa#${id}]`);
      sendState(logout ? "logged_out" : "disconnected", "");
      // Tear down cleanly and DO NOT auto-recreate — that self-recreation was the
      // QR-forever loop. The Dashboard drives a fresh link (start_qr / reconnect).
      if (wa === client) destroyWa("disconnected:" + r).catch(() => {});
    });
    client.on("message", (m) => {
      relayInboundMsg(client, m, id).catch((e) => log("warn", `inbound relay error: ${e.message} [wa#${id}]`));
    });
    wa = client;
    client.initialize().catch(async (e) => {
      log("error", `whatsapp: init error: ${e.message} [wa#${id}]`);
      if (wa !== client) return;
      await destroyWa("init-error").catch(() => {});
      const msg = String(e.message || "");
      // Chrome conflict: the old Chromium process is still alive after a rapid
      // restart (update, launchd keepalive, SIGTERM race). Wait for it to fully exit.
      if (/Target closed|already running|Execution context|onQRChanged.*already exists/i.test(msg)) {
        log("warn", "whatsapp: Chromium conflict — waiting 5s for previous browser to exit");
        await sleep(5000);
        // Session files may be partially written during the conflicted init — clear them
        // so the next start_qr triggers a clean QR instead of looping on the bad state.
        if (/Execution context|onQRChanged.*already exists/i.test(msg)) {
          log("warn", "whatsapp: clearing possibly corrupted session after Chromium conflict");
          try { fs.rmSync(path.join(HOME, "wweb"), { recursive: true, force: true }); } catch {}
          log("info", "whatsapp: session cleared — send start_qr from the Dashboard for a fresh QR");
        }
      }
      sendState("disconnected", "");
    });
    return client;
  })();
  waInit = p;
  // If creation fails (e.g. Chromium download error), clear the memo so a later
  // start_qr can retry instead of forever returning the rejected promise.
  p.catch(() => { if (waInit === p) waInit = null; });
  return p;
}

// ---------------------------------------------------------- inbound relay ----
// Mirrors the production wa-service message handler EXACTLY, so the Cloud's
// /api/whatsapp/incoming sees the same shape it has always seen:
//   • groups / status / broadcast / newsletters are skipped
//   • @c.us JIDs → "+<digits>" (E.164 with the plus, matching every CRM row)
//   • @lid contacts resolve a real phone ONLY from a trusted @c.us JID
//     (never contact.number — WhatsApp's privacy model can put the LID there,
//     which poisoned production data with fake "+16xxx…" phones before)
//   • media (voice/image/video/document) forwarded base64 so transcription /
//     vision run identically
//   • replyJid lets the auto-reply go back to the exact chat (works for @lid)
async function relayInboundMsg(client, m, id) {
  if (m.fromMe || m.isStatus) return;
  const from = String(m.from || "");
  const server = from.split("@")[1] || "";
  if (server !== "c.us" && server !== "lid") return; // g.us / broadcast / newsletter / status
  let contact = null;
  try { contact = await m.getContact(); } catch {}
  const trusted = (jid) =>
    typeof jid === "string" && jid.endsWith("@c.us") ? "+" + jid.replace("@c.us", "") : null;
  const phone =
    server === "c.us"
      ? "+" + from.replace("@c.us", "")
      : trusted(contact?.id?._serialized) || trusted(m.author) || "lid:" + from.replace(/@.*$/, "");
  const name = contact?.pushname || contact?.name || m._data?.notifyName || "";

  let text = m.body || "";
  let mediaType = "text", mediaBase64, mimetype;
  if (m.hasMedia) {
    mediaType =
      m.type === "audio" || m.type === "ptt" ? "voice"
      : m.type === "image" ? "image"
      : m.type === "video" ? "video"
      : m.type === "document" ? "document" : "text";
    if (mediaType !== "text") {
      try {
        const media = await m.downloadMedia();
        // 8MB base64 cap — the relay frame + Cloud body limit must stay sane.
        if (media?.data && media.data.length < 8_000_000) { mediaBase64 = media.data; mimetype = media.mimetype; }
      } catch (e) { log("warn", `whatsapp: media download failed: ${e.message} [wa#${id}]`); }
    }
  }
  if (!text.trim() && !mediaBase64) return;

  // Typing indicator while the Cloud generates the reply (parity with the
  // wa-service). Auto-stops when the reply is sent, or after 90s regardless.
  startTyping(client, from).catch(() => {});
  log("info", `whatsapp: inbound from ${phone} (${mediaType}) → relaying to Cloud [wa#${id}]`);
  wsSend("inbound", {
    provider: PROVIDER, from: { phone, name },
    mediaType, text, mediaBase64, mimetype, replyJid: from,
    providerMessageId: m.id?._serialized || "", providerTimestamp: (m.timestamp || 0) * 1,
  });
}

// -------------------------------------------------------- typing indicator ----
// WhatsApp clears "typing…" after ~25s, so refresh every 15s like the
// wa-service does; hard-stop after 90s so a dropped reply can never leave the
// chat typing forever.
const typingTimers = new Map(); // jid -> { iv, to, chat }
async function startTyping(client, jid) {
  try {
    const chat = await client.getChatById(jid);
    stopTyping(jid);
    await chat.sendStateTyping();
    const iv = setInterval(() => { chat.sendStateTyping().catch(() => {}); }, 15_000);
    const to = setTimeout(() => stopTyping(jid), 90_000);
    if (typeof iv.unref === "function") iv.unref();
    if (typeof to.unref === "function") to.unref();
    typingTimers.set(jid, { iv, to, chat });
  } catch { /* typing is best-effort */ }
}
function stopTyping(jid) {
  const t = typingTimers.get(jid);
  if (!t) return;
  clearInterval(t.iv); clearTimeout(t.to);
  typingTimers.delete(jid);
  try { t.chat.clearState().catch(() => {}); } catch {}
}
function stopAllTyping() { for (const jid of Array.from(typingTimers.keys())) stopTyping(jid); }

async function startLink(cfg) {
  if (wa && waReady) { sendState("connected", waIdentity); log("info", "whatsapp: already linked"); return; }
  try { await ensureWa(cfg); }
  catch (e) { log("error", `whatsapp: engine prep failed: ${e.message}`); sendState("disconnected", ""); return; }
  // The single Client will emit `qr` (fresh link) or `ready` (resumed session).
  log("info", "whatsapp: link requested — a QR will stream to the Dashboard");
}

// ------------------------------------------------------------- outbound ------
// Parity with the wa-service send path:
//   • an explicit replyJid (auto-replies) targets the exact chat, @lid included
//   • cold sends resolve the JID via getNumberId (LID-aware Store lookup) —
//     without it new contacts fail with WhatsApp's cryptic "No LID for user"
//   • lid:/@lid pseudo-phones and malformed numbers are rejected up front
//   • preDelayMs/typingDelayMs (from the Cloud's humanize/anti-ban engine) are
//     honored with a real typing indicator, exactly like the wa-service
async function sendMessage(to, text, opts = {}) {
  if (!wa || !waReady) return { ok: false, error: "not linked" };
  try {
    let jid = typeof opts.jid === "string" && /@(c\.us|lid)$/.test(opts.jid) ? opts.jid : null;
    if (!jid) {
      const raw = String(to || "");
      if (raw.startsWith("lid:") || raw.includes("@lid"))
        return { ok: false, error: "cannot initiate send to WhatsApp LID; no public phone available" };
      const digits = raw.replace(/^\+/, "").replace(/[^\d]/g, "");
      if (digits.length < 8 || digits.length > 15)
        return { ok: false, error: `invalid phone format: "${to}"` };
      let numberId;
      try { numberId = await wa.getNumberId(digits); }
      catch (e) { return { ok: false, error: `getNumberId failed: ${e.message}` }; }
      if (!numberId) return { ok: false, error: "number not registered on WhatsApp" };
      jid = numberId._serialized;
    }
    const preDelayMs = Math.max(0, Math.min(3000, Number(opts.preDelayMs) || 0));
    const typingDelayMs = Math.max(0, Math.min(8000, Number(opts.typingDelayMs) || 0));
    if (preDelayMs) { stopTyping(jid); await sleep(preDelayMs); }   // "reading" pause
    if (typingDelayMs) { await startTyping(wa, jid); await sleep(typingDelayMs); }
    stopTyping(jid);
    if (!wa || !waReady) return { ok: false, error: "not linked" }; // engine died during the delay
    const m = await wa.sendMessage(jid, text);
    return { ok: true, providerMessageId: m.id?._serialized || "" };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Controls are SERIALIZED (chained) so a burst of dashboard clicks can never
// interleave teardown + create and spawn a competing Client.
let controlChain = Promise.resolve();
function control(action) {
  controlChain = controlChain.then(() => doControl(action)).catch((e) => log("error", `control error: ${e.message}`));
  return controlChain;
}
async function doControl(action) {
  log("info", `dashboard control received: ${action} (${PROVIDER})`);
  const cfg = loadCfg();
  switch (action) {
    case "start_qr": await startLink(cfg); break;
    case "disconnect": await destroyWa("disconnect"); sendState("disconnected", ""); break;
    case "reconnect": case "restart":
      await destroyWa("restart");
      await sleep(2000); // give Chromium time to fully exit before creating a new Client
      try { await ensureWa(cfg); } catch (e) { log("error", `whatsapp: engine prep failed: ${e.message}`); sendState("disconnected", ""); }
      break;
    case "logout":
      if (wa) { try { await wa.logout(); } catch {} }
      await destroyWa("logout"); sendState("logged_out", "");
      break;
    // The Dashboard's update button pushes this — it must actually run the
    // self-update (it was silently ignored before, leaving customers stuck on
    // old builds with the Dashboard spinner saying "updating…" forever).
    case "update": await applyUpdateAndRestart("dashboard"); break;
    default: log("warn", `unknown control action: ${action}`);
  }
}

// ------------------------------------------------------------- self-update ----
// Stages the newer app/ from the KEYONE store (checksum-verified) then exits so
// the service manager restarts us on the new code. launchd (KeepAlive) and
// systemd (Restart=always) restart on ANY exit; the Windows Scheduled Task only
// restarts on FAILURE, hence the non-zero exit there. LocalAuth persists — the
// WhatsApp session resumes with no QR.
async function applyUpdateAndRestart(source) {
  let outcome = "current";
  try { outcome = await cmdUpdate(); } catch (e) { log("error", `update failed (${source}): ${e.message}`); return; }
  if (outcome !== "updated") { log("info", `update check (${source}): ${outcome === "current" ? `up to date (${VERSION})` : outcome}`); return; }
  log("info", `update staged (${source}) — restarting to load the new version`);
  try { await Promise.race([destroyWa("update-restart"), sleep(6000)]); } catch {}
  releaseLock();
  process.exit(process.platform === "win32" ? 1 : 0);
}

// Auto-update: check shortly after start (crash-fix builds must reach customers
// without any manual step), then every ~6h with jitter. Escape hatch:
// KEYONE_BRIDGE_NO_AUTOUPDATE=1.
function scheduleAutoUpdate() {
  if (process.env.KEYONE_BRIDGE_NO_AUTOUPDATE === "1") { log("info", "auto-update disabled (KEYONE_BRIDGE_NO_AUTOUPDATE=1)"); return; }
  const kick = () => applyUpdateAndRestart("auto").catch(() => {});
  setTimeout(kick, 90_000).unref?.();
  updateTimer = setInterval(kick, 6 * 3600_000 + Math.floor(Math.random() * 1800_000));
  if (typeof updateTimer.unref === "function") updateTimer.unref();
}

// ------------------------------------------------------------ gateway link ----
// STRICT single socket. Any prior socket is torn down first, a pending reconnect
// timer is cleared, and every handler is guarded by `ws === sock` so a stale
// socket can never act after a newer one replaced it.
//
// The config is RE-READ from disk on every attempt: after a re-login (which
// supersedes this machine's old bridge row and revokes its token) the daemon
// must pick up the NEW token on its next retry. Holding the boot-time token in
// memory produced an endless 401 loop in the field — the Dashboard showed the
// device offline forever while the daemon hammered a revoked credential.
function connect() {
  if (shuttingDown) return;
  clearTimeout(reconnectTimer); reconnectTimer = null;
  const cfg = loadCfg();
  if (!cfg.token || !cfg.bridgeId) {
    log("warn", "not linked — run `keyone-bridge login` (retrying in 5s)");
    reconnectTimer = setTimeout(connect, 5000);
    return;
  }
  if (ws) { try { ws.removeAllListeners(); ws.terminate(); } catch {} ws = null; }
  const id = ++wsSeq;
  const sock = new WebSocket(`${CLOUD_WS}?token=${encodeURIComponent(cfg.token)}`);
  ws = sock;
  sock.on("open", () => {
    if (ws !== sock) { try { sock.terminate(); } catch {} return; }
    reconnectDelay = 1000;
    lastRxAt = Date.now();
    wsSend("hello", { protocolVersion: 1, version: VERSION, os: process.platform, arch: process.arch, providers: [PROVIDER] });
    log("info", `cloud link up [ws#${id}]`);
    // Re-announce the CURRENT transport state after every (re)connect: a gateway
    // restart marks tenants disconnected, and `ready` will not fire again on the
    // already-running Client — without this the Dashboard would stay
    // "disconnected" even though WhatsApp is live.
    if (waReady) sendState("connected", waIdentity);
    // Resume an existing WhatsApp session automatically (LocalAuth → no QR). The
    // memoized ensureWa guarantees this shares the single Client with any
    // subsequent start_qr — no second engine.
    if (fs.existsSync(path.join(HOME, "wweb"))) ensureWa(cfg).catch((e) => log("error", `whatsapp: resume error: ${e.message}`));
    clearInterval(hbTimer);
    hbTimer = setInterval(() => {
      // Half-open guard: if the gateway stops answering (no frame of any kind
      // for >90s — acks come back for every heartbeat), recycle the socket
      // instead of staying "connected" but deaf.
      if (Date.now() - lastRxAt > 90_000) {
        log("warn", `cloud link unresponsive >90s — recycling socket [ws#${id}]`);
        try { sock.terminate(); } catch {}
        return;
      }
      wsSend("heartbeat", {});
    }, 25000);
    clearInterval(logTimer); logTimer = setInterval(drainLogs, 3000);
  });
  // WS protocol pings from the gateway (every 30s) also prove the link is alive.
  sock.on("ping", () => { if (ws === sock) lastRxAt = Date.now(); });
  sock.on("message", (buf) => {
    if (ws !== sock) return;
    lastRxAt = Date.now();
    let f = null; try { f = JSON.parse(buf.toString()); } catch { return; }
    if (!f || !f.type) return;
    const p = f.payload || {};
    switch (f.type) {
      case "control": control(p.action); break;
      case "start_link": control("start_qr"); break;
      case "outbound":
        sendMessage(p.to, p.text, { jid: p.replyJid || p.jid, preDelayMs: p.preDelayMs, typingDelayMs: p.typingDelayMs })
          .then((ack) => wsSend("outbound_ack", { ok: ack.ok, providerMessageId: ack.providerMessageId, error: ack.error }, f.id));
        break;
      case "error": log("warn", `cloud error frame: ${JSON.stringify(p)}`); break;
      // hello_ack / heartbeat_ack / *_ack — nothing to do.
    }
  });
  sock.on("close", () => {
    if (ws !== sock) return;               // a newer socket already took over
    clearInterval(hbTimer); clearInterval(logTimer);
    if (!shuttingDown) log("warn", `cloud link down [ws#${id}]`);
    scheduleReconnect();
  });
  sock.on("error", (e) => {
    const msg = String(e.message || e);
    if (/401/.test(msg)) {
      // Revoked/superseded token (e.g. this machine was re-linked, or the device
      // was removed in the Dashboard). Keep retrying slowly — connect() re-reads
      // config.json, so a fresh `keyone-bridge login` heals this automatically.
      reconnectDelay = 60_000;
      log("error", `cloud rejected this bridge's token (401) [ws#${id}] — if this persists, run \`keyone-bridge login\` to re-link this machine`);
    } else {
      log("warn", `cloud link error: ${msg} [ws#${id}]`);
    }
    try { sock.close(); } catch {}
  });
}
function scheduleReconnect() {
  if (shuttingDown) return;
  clearTimeout(reconnectTimer);
  reconnectDelay = Math.min(60000, reconnectDelay * 2);
  log("warn", `cloud link retry in ${Math.round(reconnectDelay / 1000)}s`);
  reconnectTimer = setTimeout(() => connect(), reconnectDelay);
}
function drainLogs() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const batch = logRing.splice(0, logRing.length);
  for (const r of batch) wsSend("log", { level: r.level, message: r.message });
}

async function cmdStart() {
  daemonFileLog = process.platform === "win32"; // launchd/journald capture stdout elsewhere
  // ONE runtime per machine — see acquireLock(). Waits (never dies) so the
  // service daemon and a manual foreground `start` can hand over cleanly.
  await acquireLock();
  let cfg = loadCfg();
  // A service may be started before `login`. Idle-wait for the link instead of
  // exiting (KeepAlive would otherwise crash-loop the daemon on a fresh install).
  if (!cfg.token || !cfg.bridgeId) {
    log("warn", "not linked yet — run `keyone-wa-bridge login`. Waiting for link…");
    while (!cfg.token || !cfg.bridgeId) { await sleep(5000); cfg = loadCfg(); }
    log("info", "link detected");
  }
  log("info", `keyone-wa-bridge ${VERSION} starting (bridge=${cfg.bridgeId}, transport=whatsapp-web.js, pid=${process.pid})`);
  connect();
  scheduleAutoUpdate();
  // Graceful shutdown: the Chromium child MUST be destroyed or it survives as an
  // orphan holding RAM + the LocalAuth profile lock. launchctl bootout sends
  // SIGTERM then SIGKILLs shortly after, so the teardown is time-boxed.
  const shutdown = async (sig) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log("info", `shutting down (${sig})`);
    clearTimeout(reconnectTimer); clearInterval(hbTimer); clearInterval(logTimer); clearInterval(updateTimer);
    try { if (ws) { ws.removeAllListeners(); ws.close(); } } catch {}
    try { await Promise.race([destroyWa("shutdown"), sleep(4500)]); } catch {}
    releaseLock();
    process.exit(0);
  };
  process.on("SIGINT", () => { shutdown("SIGINT"); });
  process.on("SIGTERM", () => { shutdown("SIGTERM"); });
}

// ------------------------------------------------------------ CLI: diagnostics
// Reachability probe: resolves true if the host answers ANY HTTP status (TCP+TLS
// ok), false on a network/DNS/TLS error. Used by status/doctor.
function reachable(url) {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, (r) => { r.resume(); resolve(true); });
      req.on("error", () => resolve(false));
      req.setTimeout(6000, () => { try { req.destroy(); } catch {} resolve(false); });
    } catch { resolve(false); }
  });
}

function sessionLinked() { return fs.existsSync(path.join(HOME, "wweb")); }
function engineState() {
  try { const p = require("puppeteer").executablePath(); if (p && fs.existsSync(p)) return "ready: " + p; } catch {}
  return fs.existsSync(PUP_CACHE) ? "downloaded (in " + PUP_CACHE + ")" : "downloads on first link (~150MB, one-time)";
}

async function cmdStatus() {
  const cfg = loadCfg();
  console.log(`keyone-wa-bridge ${VERSION}`);
  console.log(`  home:      ${HOME}`);
  if (!cfg.token || !cfg.bridgeId) {
    console.log("  linked:    NO — run `keyone-bridge login`");
  } else {
    console.log("  linked:    YES");
    console.log(`  bridge id: ${cfg.bridgeId}`);
    console.log(`  workspace: ${cfg.workspaceId || "?"}`);
    console.log(`  name:      ${cfg.name || os.hostname()}`);
  }
  console.log(`  whatsapp:  ${sessionLinked() ? "session present (scan not needed)" : "not linked — scan the QR from the Dashboard"}`);
  console.log(`  engine:    ${engineState()}`);
  console.log(`  cloud:     ${(await reachable(CLOUD_API)) ? "reachable" : "UNREACHABLE"} (${CLOUD_API})`);
}

async function cmdDoctor() {
  const cfg = loadCfg();
  const rows = [];
  rows.push(["config linked (token + bridgeId)", !!(cfg.token && cfg.bridgeId), cfg.bridgeId ? cfg.bridgeId : "run `keyone-bridge login`"]);
  rows.push(["node runtime", !!process.version, `${process.version} ${process.platform}/${process.arch}`]);
  rows.push(["cloud API reachable", await reachable(CLOUD_API), CLOUD_API]);
  let puppeteerOk = false, engineInfo = "";
  try { require("puppeteer"); require("@puppeteer/browsers"); puppeteerOk = true; engineInfo = engineState(); }
  catch (e) { engineInfo = "puppeteer missing: " + e.message; }
  rows.push(["WhatsApp engine deps", puppeteerOk, engineInfo]);
  rows.push(["home dir writable", (() => { try { fs.accessSync(HOME, fs.constants.W_OK); return true; } catch { return false; } })(), HOME]);
  rows.push(["whatsapp session", sessionLinked(), sessionLinked() ? "linked" : "not yet (optional until you scan)"]);
  let ok = true;
  for (const [name, pass, info] of rows) {
    console.log(`${pass ? "✓" : "✗"} ${name}${info ? "  (" + info + ")" : ""}`);
    if (!pass && name !== "whatsapp session") ok = false;
  }
  console.log(ok ? "\nOK — the bridge can link and run." : "\nSome checks failed — fix the ✗ items above.");
  return ok;
}

function cmdLogout() {
  // Local unlink on THIS host (clears token + WhatsApp session). Full revocation
  // (so a stale copy can never reconnect) is done from the Dashboard.
  try { fs.rmSync(CFG, { force: true }); } catch {}
  try { fs.rmSync(path.join(HOME, "wweb"), { recursive: true, force: true }); } catch {}
  console.log("Unlinked on this host (token + WhatsApp session cleared).");
  console.log("To fully revoke it, also remove this device from your KEYONE Dashboard.");
}

function cmdLogs(nArg) {
  const N = Math.max(1, Math.min(5000, Number(nArg) || 200));
  const files = [path.join(HOME, "bridge.out.log"), path.join(HOME, "bridge.err.log")];
  let printed = false;
  for (const f of files) {
    try {
      if (fs.existsSync(f) && fs.statSync(f).size > 0) {
        const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
        console.log(`--- ${f} (last ${N}) ---`);
        console.log(lines.slice(-N).join("\n"));
        printed = true;
      }
    } catch {}
  }
  if (!printed) {
    console.log("No local log file yet. The bridge logs via its service manager:");
    console.log("  macOS:   tail -f ~/.keyone-wa-bridge/bridge.out.log");
    console.log("  Linux:   journalctl -u keyone-wa-bridge -f");
    console.log('  Windows: schtasks /Run /TN "KEYONE WA Bridge", or run `keyone-bridge start` to watch live');
  }
}

// Restart/stop the OS service that supervises the bridge (best-effort, per-OS).
function cmdService(action) {
  const cp = require("child_process");
  const run = (c) => cp.execSync(c, { stdio: "ignore" });
  try {
    if (process.platform === "darwin") {
      const uid = process.getuid ? process.getuid() : "";
      if (action === "stop") run(`launchctl bootout gui/${uid}/com.keyone.wa-bridge`);
      else run(`launchctl kickstart -k gui/${uid}/com.keyone.wa-bridge`);
    } else if (process.platform === "linux") {
      run(`systemctl ${action === "stop" ? "stop" : "restart"} keyone-wa-bridge`);
    } else if (process.platform === "win32") {
      try { run(`schtasks /End /TN "KEYONE WA Bridge"`); } catch {}
      if (action !== "stop") run(`schtasks /Run /TN "KEYONE WA Bridge"`);
    }
    console.log(`service ${action}: ok`);
  } catch (e) {
    console.log(`Could not ${action} the service automatically (${String(e.message).split("\n")[0]}). Run manually:`);
    console.log("  macOS:   launchctl kickstart -k gui/$(id -u)/com.keyone.wa-bridge");
    console.log("  Linux:   sudo systemctl restart keyone-wa-bridge");
    console.log('  Windows: schtasks /End /TN "KEYONE WA Bridge" && schtasks /Run /TN "KEYONE WA Bridge"');
  }
}

// --------------------------------------------------------------------- main ---
const USAGE = "usage: keyone-wa-bridge <login|start|status|doctor|logs|restart|stop|logout|update|version>";
(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === "login") await cmdLogin(process.argv.slice(3).join(" "));
    else if (cmd === "start" || cmd === "run") await cmdStart();
    else if (cmd === "status") await cmdStatus();
    else if (cmd === "doctor") process.exit((await cmdDoctor()) ? 0 : 1);
    else if (cmd === "logs") cmdLogs(process.argv[3]);
    else if (cmd === "restart") cmdService("restart");
    else if (cmd === "stop") cmdService("stop");
    else if (cmd === "logout") cmdLogout();
    else if (cmd === "update") await cmdUpdate();
    else if (cmd === "version" || cmd === "-v" || cmd === "--version") console.log("keyone-wa-bridge", VERSION);
    else { console.error(USAGE); process.exit(2); }
  } catch (e) { console.error("error:", e.message); process.exit(1); }
})();
