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
const CHROME = process.env.KEYONE_CHROME || undefined;
const VERSION = "1.0.0-wweb";
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
  fs.renameSync(APPDIR, old); fs.renameSync(stage, APPDIR);
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
function ensureWa(cfg) {
  if (wa) return wa;
  log("info", "whatsapp: initializing real WhatsApp Web (Chromium)…");
  wa = new Client({
    authStrategy: new LocalAuth({ clientId: cfg.bridgeId || "keyone", dataPath: path.join(HOME, "wweb") }),
    puppeteer: {
      headless: true,
      executablePath: CHROME,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  });
  wa.on("qr", (code) => { linking = true; sendState("linking", ""); sendQr(code); log("info", "whatsapp: QR ready — scan from the Dashboard"); });
  wa.on("loading_screen", (p) => log("info", `whatsapp: loading ${p}%`));
  wa.on("authenticated", () => log("info", "whatsapp: QR scanned — authenticating"));
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
  ensureWa(cfg);
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
      ensureWa(cfg); break;
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
    if (fs.existsSync(path.join(HOME, "wweb"))) ensureWa(cfg);
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

// --------------------------------------------------------------------- main ---
(async () => {
  const cmd = process.argv[2];
  try {
    if (cmd === "login") await cmdLogin(process.argv.slice(3).join(" "));
    else if (cmd === "start" || cmd === "run") await cmdStart();
    else if (cmd === "update") await cmdUpdate();
    else if (cmd === "version" || cmd === "-v") console.log("keyone-wa-bridge", VERSION);
    else { console.error("usage: keyone-wa-bridge <login|start|update|version>"); process.exit(2); }
  } catch (e) { console.error("error:", e.message); process.exit(1); }
})();
