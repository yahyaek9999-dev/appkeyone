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
const VERSION = "1.0.2-wweb";
const PROVIDER = "whatsapp";
fs.mkdirSync(HOME, { recursive: true });
const CFG = path.join(HOME, "config.json");

// ------------------------------------------------------------------ logging ---
const logRing = [];
function log(level, msg) {
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${msg}`;
  console.log(line);
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
async function cmdUpdate() {
  const APPDIR = __dirname;                 // <bundle>/app
  const ROOT = path.dirname(APPDIR);        // <bundle>
  const bundled = fs.existsSync(path.join(ROOT, "node")) || fs.existsSync(path.join(ROOT, "node.exe"));
  if (!bundled) { console.log("update: not an installed bundle (run the installer to update)."); return; }
  // `update --rollback`: restore the previous app/ that a prior update staged as
  // app.old (recovery after a bad update). Restart the service to apply.
  if (process.argv.slice(3).includes("--rollback")) {
    const old = path.join(ROOT, "app.old");
    if (!fs.existsSync(old)) { console.log("rollback: no previous version (app.old) to restore — reinstall from the KEYONE store."); return; }
    const tmp = path.join(ROOT, "app.rollback.tmp"); fs.rmSync(tmp, { recursive: true, force: true });
    fs.renameSync(APPDIR, tmp);
    // If putting app.old in place fails (e.g. a lock/AV on Windows), restore the
    // current app/ from tmp so the running app dir is NEVER left missing.
    try { fs.renameSync(old, APPDIR); }
    catch (e) { try { if (!fs.existsSync(APPDIR)) fs.renameSync(tmp, APPDIR); } catch {} throw e; }
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("rolled back to the previous version — restart the service to apply.");
    return;
  }
  const man = JSON.parse((await getURL(DL_BASE + "/version.json")).toString());
  if (!man.app || !man.app.file) { console.log("update: manifest has no app package."); return; }
  if (!isNewer(VERSION, man.version)) { console.log("already up to date (" + VERSION + ")"); return; }
  console.log("updating " + VERSION + " → " + man.version + " …");
  const buf = await getURL(DL_BASE + "/" + man.app.file);
  const sum = crypto.createHash("sha256").update(buf).digest("hex");
  if (man.app.sha256 && sum !== man.app.sha256) throw new Error("checksum mismatch — aborting update");
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
let ws = null, wsAlive = false, hbTimer = null, logTimer = null, reconnectDelay = 1000;
let wa = null, waReady = false, waIdentity = "", linking = false;

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

// Safety net: `ready` is the primary "connected" signal. If it is merely LATE,
// confirm via getState() so the Dashboard still flips to Connected once WhatsApp
// is genuinely CONNECTED. Never publishes before WhatsApp reports CONNECTED.
function confirmConnectedViaState() {
  let ok = 0, tries = 0;
  const iv = setInterval(async () => {
    if (waReady || !wa) { clearInterval(iv); return; }
    if (++tries > 24) { clearInterval(iv); return; } // ~72s cap
    let st = "";
    try { st = String((await wa.getState()) || "").toUpperCase(); } catch { return; }
    if (st !== "CONNECTED") { ok = 0; return; }
    if (++ok >= 4 && !waReady) {                       // ~12s stably CONNECTED
      waReady = true; linking = false;
      waIdentity = (wa.info && wa.info.wid && wa.info.wid.user) || waIdentity || "";
      sendState("connected", waIdentity);
      log("info", `whatsapp: connected as ${waIdentity} (confirmed via state)`);
      clearInterval(iv);
    }
  }, 3000);
  if (typeof iv.unref === "function") iv.unref();
}

async function ensureWa(cfg) {
  if (wa) return wa;
  const exe = await ensureChromium();
  log("info", "whatsapp: initializing real WhatsApp Web (Chromium)…");
  wa = new Client({
    authStrategy: new LocalAuth({ clientId: cfg.bridgeId || "keyone", dataPath: path.join(HOME, "wweb") }),
    puppeteer: {
      headless: true,
      executablePath: exe,
      // Match the production Recovery/Import client exactly (the known-good args).
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-accelerated-2d-canvas", "--no-first-run", "--no-zygote", "--disable-gpu"],
    },
  });
  wa.on("qr", (code) => { linking = true; sendState("linking", ""); sendQr(code); log("info", "whatsapp: QR ready — scan from the Dashboard"); });
  wa.on("loading_screen", (p) => log("info", `whatsapp: loading ${p}%`));
  wa.on("authenticated", () => { log("info", "whatsapp: QR scanned — authenticating"); confirmConnectedViaState(); });
  wa.on("auth_failure", (m) => { log("error", `whatsapp: auth failure: ${m}`); sendState("disconnected", ""); });
  wa.on("ready", () => {
    waReady = true; linking = false;
    waIdentity = (wa.info && wa.info.wid && wa.info.wid.user) || "";
    sendState("connected", waIdentity);
    log("info", `whatsapp: connected as ${waIdentity}`);
  });
  wa.on("disconnected", (r) => { waReady = false; sendState("disconnected", ""); log("warn", `whatsapp: disconnected (${r})`); });
  wa.on("message", (m) => {
    if (m.fromMe || m.isStatus) return;
    const text = m.body || "";
    if (!text) return; // media in a later phase
    const phone = String(m.from || "").replace(/@.*/, "");
    wsSend("inbound", {
      provider: PROVIDER, from: { phone, name: m._data?.notifyName || "" },
      mediaType: "text", text,
      providerMessageId: m.id?._serialized || "", providerTimestamp: (m.timestamp || 0) * 1,
    });
  });
  wa.initialize().catch((e) => { log("error", `whatsapp: init error: ${e.message}`); wa = null; });
  return wa;
}

async function startLink(cfg) {
  try { await ensureWa(cfg); }
  catch (e) { log("error", `whatsapp: engine prep failed: ${e.message}`); sendState("disconnected", ""); return; }
  if (waReady) { sendState("connected", waIdentity); log("info", `whatsapp: already linked as ${waIdentity}`); return; }
  // If wwebjs is mid-init it will emit `qr` shortly; nothing else to do.
  log("info", "whatsapp: link requested — a QR will stream to the Dashboard");
}

async function sendMessage(to, text) {
  if (!wa || !waReady) return { ok: false, error: "not linked" };
  const jid = `${String(to).replace(/[^\d]/g, "")}@c.us`;
  try { const m = await wa.sendMessage(jid, text); return { ok: true, providerMessageId: m.id?._serialized || "" }; }
  catch (e) { return { ok: false, error: e.message }; }
}

async function control(action) {
  log("info", `dashboard control received: ${action} (${PROVIDER})`);
  const cfg = loadCfg();
  switch (action) {
    case "start_qr": await startLink(cfg); break;
    case "disconnect": if (wa) { try { await wa.destroy(); } catch {} wa = null; waReady = false; sendState("disconnected", ""); } break;
    case "reconnect": case "restart":
      if (wa) { try { await wa.destroy(); } catch {} wa = null; waReady = false; }
      try { await ensureWa(cfg); } catch (e) { log("error", `whatsapp: engine prep failed: ${e.message}`); sendState("disconnected", ""); } break;
    case "logout":
      if (wa) { try { await wa.logout(); } catch {} try { await wa.destroy(); } catch {} wa = null; waReady = false; sendState("logged_out", ""); }
      break;
    default: log("warn", `unknown control action: ${action}`);
  }
}

// ------------------------------------------------------------ gateway link ----
function connect(cfg) {
  const url = `${CLOUD_WS}?token=${encodeURIComponent(cfg.token)}`;
  ws = new WebSocket(url);
  ws.on("open", () => {
    wsAlive = true; reconnectDelay = 1000;
    wsSend("hello", { protocolVersion: 1, version: VERSION, os: process.platform, arch: process.arch, providers: [PROVIDER] });
    log("info", "cloud link up");
    // Resume an existing WhatsApp session automatically (LocalAuth → no QR needed).
    // Non-blocking so the heartbeat/log timers below start immediately even if
    // the one-time Chromium download is still in progress.
    if (fs.existsSync(path.join(HOME, "wweb"))) ensureWa(cfg).catch((e) => log("error", `whatsapp: resume error: ${e.message}`));
    clearInterval(hbTimer); hbTimer = setInterval(() => wsSend("heartbeat", {}), 25000);
    clearInterval(logTimer); logTimer = setInterval(drainLogs, 3000);
  });
  ws.on("message", (buf) => {
    let f = null; try { f = JSON.parse(buf.toString()); } catch { return; }
    if (!f || !f.type) return;
    const p = f.payload || {};
    switch (f.type) {
      case "control": control(p.action); break;
      case "start_link": control("start_qr"); break;
      case "outbound":
        sendMessage(p.to, p.text).then((ack) => wsSend("outbound_ack", { ok: ack.ok, providerMessageId: ack.providerMessageId, error: ack.error }, f.id));
        break;
      case "error": log("warn", `cloud error frame: ${JSON.stringify(p)}`); break;
      // hello_ack / heartbeat_ack / *_ack — nothing to do.
    }
  });
  ws.on("close", () => { wsAlive = false; clearInterval(hbTimer); clearInterval(logTimer); scheduleReconnect(cfg); });
  ws.on("error", (e) => { log("warn", `cloud link error: ${e.message}`); try { ws.close(); } catch {} });
}
function scheduleReconnect(cfg) {
  reconnectDelay = Math.min(30000, reconnectDelay * 2);
  log("warn", `cloud link down — retry in ${Math.round(reconnectDelay / 1000)}s`);
  setTimeout(() => connect(cfg), reconnectDelay);
}
function drainLogs() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const batch = logRing.splice(0, logRing.length);
  for (const r of batch) wsSend("log", { level: r.level, message: r.message });
}

async function cmdStart() {
  let cfg = loadCfg();
  // A service may be started before `login`. Idle-wait for the link instead of
  // exiting (KeepAlive would otherwise crash-loop the daemon on a fresh install).
  if (!cfg.token || !cfg.bridgeId) {
    log("warn", "not linked yet — run `keyone-wa-bridge login`. Waiting for link…");
    while (!cfg.token || !cfg.bridgeId) { await sleep(5000); cfg = loadCfg(); }
    log("info", "link detected");
  }
  log("info", `keyone-wa-bridge ${VERSION} starting (bridge=${cfg.bridgeId}, transport=whatsapp-web.js)`);
  connect(cfg);
  process.on("SIGINT", () => process.exit(0));
  process.on("SIGTERM", () => process.exit(0));
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
