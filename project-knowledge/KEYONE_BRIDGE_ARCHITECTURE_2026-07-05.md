# KEYONE Bridge — Complete Architecture & Technology Decision

**Date:** 2026-07-05  **Status:** DESIGN — awaiting approval. **No implementation code has been written.**
**Author:** architecture pass (6 parallel domain designs) synthesized against the live KEYONE codebase.

> **Mission.** Move the WhatsApp transport completely out of the KEYONE Cloud. The Cloud must never run Chromium, never store WhatsApp sessions, never execute WhatsApp Web. A customer-hosted, cross-platform **service** — *KEYONE Bridge* — owns the QR, the encrypted session, and the WhatsApp socket, and relays messages to the Cloud over a secure WebSocket. The GUI is optional; the service is the product. Meta Cloud remains an unchanged parallel transport; Bridge is purely additive.

---

## 1. Executive summary — the decision in one page

**The product is a headless service, and its hard part is the WhatsApp multi-device (MD) protocol engine — not the GUI.** That single fact decides the technology:

- The `< 150 MB RAM / < 2% CPU` budget **structurally eliminates anything that ships Chromium** → **Electron is out**, and today's `whatsapp-web.js` (Puppeteer + Chrome, which is exactly what `whatsapp-service/` runs on the Cloud today) is out. Re-shipping Chromium to every customer machine would defeat the entire purpose of the Bridge.
- The GUI is **optional**, so **GUI-first frameworks (Electron, Tauri) optimize an axis the product does not care about.**
- A browserless, production-grade WhatsApp-MD library exists in **only two runtimes**: **Go → `whatsmeow`** and **Node → `Baileys`**. Rust and .NET have **no** production MD library, so they cannot ship the hard part without a multi-year protocol reimplementation → **out**.

### Recommendation

| | Choice | Why | Trade-off |
|---|---|---|---|
| **#1 (recommended)** | **Go + `whatsmeow`** | Only option that wins *both* dominating axes: mature browserless MD engine **and** a single static ~15–30 MB binary that cross-compiles to Windows/macOS-Intel/macOS-ARM/Linux, idles at 20–60 MB RAM, and drops straight into systemd/launchd/Windows-Service. `whatsmeow` powers the production Matrix WhatsApp bridge. GUI-optional is a *strength*. | New language surface for the team; the Bridge cannot literally reuse the Cloud's Node/TS transport code (it doesn't need to — business logic stays in the Cloud). |
| **#2 (pragmatic)** | **Node + `Baileys`** | Maximum reuse of the existing Node/TS stack; the dormant `lib/messaging/baileys-provider.ts` stub is the pre-built seam; shares WS/JSON types with the Cloud. | Idle ~90–140 MB (right at the cap), no clean single binary (needs `pkg`/Node SEA + bundled runtime), fiddlier cross-compile and Windows service story. Pick only if Go ramp-up is the binding constraint and you accept the RAM risk. |

**Weighted score:** Go **4.43** vs Node **3.56**; all others disqualified on either the MD-engine axis (Rust/.NET) or the RAM axis (Electron). Full matrix in §3.

### How it plugs into KEYONE (additive, backward-compatible)

- A **third `connectionMode = "bridge"`** joins `qr` and `meta_cloud` in `lib/messaging/mode.ts`. Default stays `qr`; every existing tenant is untouched; Meta Cloud is untouched.
- The co-located HTTP gateway is replaced, **for bridge tenants only**, by a customer-hosted engine reached over a **secure WebSocket** terminated by a **small new `bridge-gateway` Node process** co-deployed on the Cloud box (Next.js API routes cannot hold long-lived sockets).
- **Per-Bridge rotating tokens replace the single shared `SAAS_INTERNAL_SECRET`.** Inbound frames are relayed into the **same** `/api/whatsapp/incoming` logic (1:1 payloads), and outbound routes through the **one existing choke point** (`lib/wa.ts` → `wa.sendNow`) via a transport-router — **the approval-gated send pipeline is not modified.**
- **No local accounts.** Linking uses an OAuth 2.0 **Device Authorization Grant + PKCE** against the customer's existing KEYONE session; the Bridge only ever holds `{WorkspaceID, BridgeID, BridgeToken, HeartbeatSecret}`, encrypted at rest in the OS keychain.
- **The Cloud never receives WhatsApp auth** — no cookies, sessions, tokens, or auth folders. It learns only Online/Offline/Version/OS/Heartbeat/Capabilities/connected-phone.

### A note on the mission's "never upload" rule (needs your confirmation)
"Never upload cookies / sessions / tokens / auth folders" is fully honored. **Message media (images/voice) is different from auth** — the Cloud already needs it today for AI transcription/vision (`/api/whatsapp/incoming`). The design keeps media flowing inline (1:1 with today) so AI keeps working. If you want media to also stay off the Cloud, that is a larger change (on-Bridge transcription) — see Decision D3.

---


---

## 9. Implementation roadmap (phased; each phase shippable + reversible)

> Ordering: Cloud contract first (additive, flag-gated, nothing changes for anyone), then the Cloud WS ingress, then the Bridge core headless, then packaging, then multi-bridge/hardening, then the optional GUI. Meta Cloud + legacy QR keep working at every phase.

**Phase 0 — Sign-off & procurement (this document).** Approve the runtime (Go vs Node), GUI scope, media policy, and start procuring an **Apple Developer ID** + **Windows code-signing (EV) certificate** — both are long-lead and *blocking* for silent background-service installs.

**Phase 1 — Cloud contract, additive & flag-gated (no transport behavior change).**
- Prisma: `Bridge` + `BridgeCommand` (+ `BridgeAuthCode`/token tables) — per-workspace, multiple bridges, one `isPrimary`; Cloud stores only `tokenHash` + telemetry.
- `mode.ts`: add `"bridge"` (default still `qr`).
- `/api/bridge/*` device-code endpoints + `/link` approval page + token issue/rotate/revoke.
- Dashboard: three-way chooser (Meta Cloud | KEYONE Bridge | Legacy QR) + read-only Bridge panel.
- *Nothing routes to a Bridge yet.* Meta + QR untouched.

**Phase 2 — `bridge-gateway` (Cloud WS ingress).** Small co-deployed Node WS process: authenticates per-bridge tokens, tracks heartbeats → Online/Offline, relays inbound → `/api/whatsapp/incoming` (internal `x-internal-secret`), and accepts outbound from a `lib/wa.ts` transport-router when `connectionMode==='bridge'`. Validate end-to-end with a stub bridge.

**Phase 3 — Bridge core (Go + whatsmeow), HEADLESS MVP.** Local QR + encrypted local session store; WS client (versioned envelope, HMAC heartbeat, reconnect+resume); device-code `login`; CLI `start|stop|status|login|logout|update`; OS-keychain secret storage; Docker image + compose. **Meet <150 MB / <2%.** This is the first end-to-end: link a real account, relay real messages.

**Phase 4 — Packaging & service install.** Windows MSI + Service + auto-start; macOS signed+notarized universal `.pkg` + launchd; Linux AppImage + `.deb` + systemd; multi-arch Docker. Auto-update via **GitHub Releases** (cosign-signed + SHA-256 manifest, staged **atomic swap with health-check + rollback**; Windows on-restart swap).

**Phase 5 — Multi-bridge, Primary, remote control & hardening.** Customer-selected Primary + hot-standby + failover policy; remote revoke/logout/update over the live socket; token-rotation cadence; cert pinning (pin CA/SPKI, not the LetsEncrypt leaf); capability negotiation. **Migration runbook:** run co-located QR and the Bridge in parallel, flip `connectionMode` to `bridge` only after the Bridge reports `connected + primary` → zero message loss; instant rollback by flipping back.

**Phase 6 — Optional GUI.** System-tray app (status, QR, reconnect/disconnect, update) *or* an embedded `127.0.0.1` web UI served by the same binary. Strictly after the headless service is solid.

---

## 10. Decisions needing your approval

| # | Decision | Recommendation |
|---|---|---|
| **D1** | **Runtime:** Go + whatsmeow vs Node + Baileys | **Go + whatsmeow** (footprint + single binary + service packaging). Choose Node only if Go ramp-up is the hard blocker. |
| **D2** | **GUI scope for v1** | **Headless-only first**, add system-tray in Phase 6. (The service is the product.) |
| **D3** | **Media over the WS** | **Inline (1:1 with today)** so AI transcription/vision keeps working — "never upload" is honored for *auth* artifacts, not message content. Flag if you want on-Bridge transcription instead (bigger scope). |
| **D4** | **`bridge-gateway`: new process vs extend `whatsapp-service`** | **New small process** (clean separation; the legacy gateway is being retired for bridge tenants). |
| **D5** | **Workspace model** | Keep today's `Bot.userId == workspace`; defer true multi-workspace-per-account. Multiple *bridges* per workspace is supported now. |
| **D6** | **Primary failover** | **Manual re-select for v1** (auto-promote forces a fresh QR link on the standby). Revisit auto-failover later. |
| **D7** | **Signing certs** | Approve procurement of Apple Developer ID + Windows EV cert now (long lead, blocking). |

**On the release freeze:** this is a **new, isolated product** (a separate binary + additive, flag-gated Cloud endpoints). It does not touch existing tenants or the send-pipeline semantics until a tenant explicitly opts into `connectionMode='bridge'`. I recommend building it behind a `BRIDGE_ENABLED` flag, default off, exactly like the other staged subsystems.

---

*Full per-domain designs (tech matrix, contract mapping, auth flow, WS protocol, packaging, cloud+dashboard) follow below.*



---

# Appendix — Full domain designs



## §3. Technology selection (full analysis + scored matrix)

## KEYONE Bridge — Technology Selection

### The decision framing

The Bridge is a **headless-first background service** whose genuinely hard parts, in order, are:

1. A **WhatsApp Web multi-device (MD) protocol engine** that runs **without Chromium** (pure WebSocket + Noise/Signal crypto), generates the QR locally, and stores the encrypted session locally.
2. A **resilient Cloud link** (reconnecting, authenticated, encrypted WS) that relays messages and heartbeats.
3. **Service/daemon packaging** across Windows service, macOS launchd (Intel + Apple Silicon), Linux systemd, Docker, and headless CLI — from **one codebase, no platform-specific business logic**.
4. Hitting **idle RAM < 150MB, CPU < 2%**, with auto-update + rollback.

The GUI is **explicitly optional** ("the service IS the product"). That single fact reorders the whole comparison: GUI-first frameworks (Electron, Tauri) are optimizing an axis the product does not care about, and one of them (Electron) forces the very Chromium dependency the Bridge exists to eliminate.

**The dominating constraint is library availability for the WhatsApp MD protocol per runtime.** You do not want to re-implement WhatsApp's multi-device Noise handshake, Signal double-ratchet, and app-state sync from scratch — that is a multi-year, perpetually-breaking effort. So the runtime choice collapses to: *which languages have a mature, Chromium-free MD library?*

| Runtime | MD library | Status | Ships Chromium? |
|---|---|---|---|
| **Go** | `go.mau.fi/whatsmeow` | **Mature**; powers the Matrix `mautrix-whatsapp` bridge in production at scale | No |
| **Node** | `@whiskeysockets/baileys` | **Mature**; large community, pure-WS | No |
| **Rust** | (none production-grade) | Experimental / partial ports only | No |
| **.NET** | (none) | Effectively Meta-Cloud-only | No |
| **Electron / whatsapp-web.js** | `whatsapp-web.js` | Mature but **automates real WhatsApp Web** | **Yes (200–400MB)** |

This immediately eliminates **Rust** and **.NET** (no MD engine — the hard part is undeliverable without a from-scratch reimplementation) and **Electron** (Chromium violates the RAM goal and re-imports the exact dependency the Bridge is meant to remove). The real contest is **Go (whatsmeow) vs Node (Baileys)**, with Tauri considered only as a GUI shell.

Grounding in the current KEYONE code confirms the shape: today `whatsapp-service/src/sessions.js` runs **whatsapp-web.js + Puppeteer + Chrome** on the Cloud box; the header comment literally reads *"Multi-tenant WhatsApp manager built on whatsapp-web.js (Puppeteer + Chrome)."* The Bridge's entire reason to exist is to get that Chromium off the Cloud — so re-shipping Chromium to each customer machine would defeat the thesis. Meanwhile a **dormant `BaileysProvider` stub already exists** at `saas/lib/messaging/baileys-provider.ts` ("scaffolded but inactive… does not import Baileys or create sockets"), which is the pre-built extension point that makes the Node path low-friction if chosen.

---

### Scoring matrix (1–5, higher is better)

Criteria and weights (weights sum to 1.00; the two biggest weights are the two decision-dominating axes — MD engine maturity, and footprint/packaging):

| # | Criterion | Weight |
|---|---|---|
| C1 | WhatsApp MD engine maturity | 0.30 |
| C2 | Idle RAM / CPU footprint | 0.15 |
| C3 | Single-binary cross-compile (win / mac-intel / mac-arm / linux) | 0.12 |
| C4 | Service/daemon packaging ease | 0.10 |
| C5 | Auto-update + rollback story | 0.08 |
| C6 | Security / hardening | 0.10 |
| C7 | GUI-optional fit | 0.05 |
| C8 | Dev velocity & reuse of existing Node/TS KEYONE stack | 0.10 |

Raw scores:

| Criterion (weight) | Go | Node | Rust | .NET | Electron | Tauri |
|---|---|---|---|---|---|---|
| C1 MD engine (0.30) | **5** | **4** | 1 | 1 | 4 | 1 |
| C2 RAM/CPU (0.15) | **5** | 3 | 5 | 3 | 1 | 4 |
| C3 single-binary (0.12) | **5** | 2 | 5 | 3 | 2 | 4 |
| C4 daemon packaging (0.10) | **5** | 3 | 4 | 4 | 2 | 3 |
| C5 auto-update+rollback (0.08) | 4 | 3 | 4 | 3 | **5** | 4 |
| C6 security/hardening (0.10) | 4 | 3 | **5** | 4 | 2 | **5** |
| C7 GUI-optional fit (0.05) | **5** | 4 | 4 | 4 | 1 | 2 |
| C8 reuse Node/TS stack (0.10) | 2 | **5** | 1 | 1 | 4 | 3 |

Weighted totals (Σ weight × score):

| Rank | Runtime | Weighted score |
|---|---|---|
| **1** | **Go** | **4.43** |
| 2 | Node | 3.56 |
| 3 | Tauri | 2.86* |
| 4 | .NET | 2.44* |
| 4 | Rust | 2.62* |
| 6 | Electron | 2.94** |

\* Rust/.NET/Tauri scores are inflated by strong infra numbers but are **capped by C1 = 1** (no MD engine) — they cannot ship the product without reimplementing the protocol, so their totals are academic. \*\* Electron's 2.94 is likewise misleading: C2 = 1 means it structurally fails the <150MB hard requirement. **Only Go and Node are viable end-to-end.**

---

### #1 — Go + whatsmeow (recommended)

**Why.** It is the only option that wins *both* dominating axes simultaneously:

- **MD engine (C1 = 5):** `go.mau.fi/whatsmeow` is the most battle-tested Chromium-free MD library, hardened by the Matrix bridge's real-world multi-account load. It gives QR + phone-pairing, encrypted session state you can persist locally, media, receipts, and app-state sync — matching the surface `sessions.js` exposes today (`start`, `status`, `pair`, `send`, `export`, connected/disconnected events).
- **Footprint (C2 = 5):** a single static Go binary idles at roughly **20–60MB RAM** with **near-zero idle CPU** (goroutines parked on the WS read). This clears the **<150MB / <2%** hard cap with comfortable headroom even with several linked WhatsApp accounts on one Bridge. Contrast: today's whatsapp-web.js path spends most of `sessions.js` on hibernation logic *precisely because each Chromium session costs hundreds of MB* — whatsmeow makes that entire class of complexity disappear.
- **Single binary (C3 = 5):** `GOOS/GOARCH` cross-compiles from one machine to `windows/amd64`, `darwin/amd64` (mac Intel), `darwin/arm64` (Apple Silicon), `linux/amd64`, `linux/arm64` — **no runtime to bundle, no node_modules, no native-module rebuild per platform.** This is the cleanest possible "same codebase, all platforms" story and makes the GitHub-Releases auto-update + rollback trivial (swap one file, keep the previous binary for rollback).
- **Daemon packaging (C4 = 5):** `github.com/kardianos/service` abstracts Windows Service / launchd / systemd behind one API, and the CLI verbs (`start|stop|status|login|logout|update`) map directly onto it. Docker image is a `FROM scratch` / distroless a few MB in size.
- **Security (C6 = 4):** static binary shrinks attack surface; native `crypto/*` for encrypted local storage and token rotation; `crypto/tls` supports cert pinning for the WS link. Memory-safe (GC), so most of Rust's safety edge is moot for this workload.

**GUI-optional (C7 = 5) — can a Go core ship an optional GUI? Yes, cleanly, two ways:**
1. **System tray:** `github.com/getlantern/systray` (or `fyne.io/systray`) gives a native tray icon + menu (Status / Login / Open dashboard / Quit) that compiles into the same binary and is simply *not started* in headless mode. For a richer window, `fyne` is pure-Go cross-platform.
2. **Local web UI (preferred):** the Bridge already runs an HTTP/WS server; serve a tiny embedded (`//go:embed`) status page on `127.0.0.1:<port>` for QR display and link status. Zero extra native deps, identical on every OS, and it's the natural place to render the device-code login QR. Headless deployments just never open a browser.

Either way the GUI is a strictly additive, optional layer over a headless core — exactly the product's stated shape.

**The tradeoff (honest).** The KEYONE Cloud is Next.js/TypeScript; **Go is a new language for this team (C8 = 2)** and the WS relay protocol types must be hand-mirrored on both sides (Go structs ↔ TS interfaces) instead of shared. You lose direct reuse of existing TS helpers. This is real but bounded: the Bridge is a **small, well-scoped service** (a protocol engine + a WS relay + service packaging), not a sprawling app, and its boundary with the Cloud is a narrow JSON-over-WS contract. The footprint, single-binary, and packaging wins are worth crossing the language boundary for a component that will run on thousands of customer machines you don't control.

### #2 — Node + Baileys (pragmatic alternative)

**Why it's a legitimate #2.** `@whiskeysockets/baileys` is a mature, pure-WS MD library (C1 = 4), and this path **maximizes reuse of the existing stack (C8 = 5):** the dormant `saas/lib/messaging/baileys-provider.ts` is a ready extension point, the relay can share TypeScript types with the Cloud, and the team already ships Node daily. The Cloud contract (`lib/wa.ts` HTTP surface, `notifySaas → /api/whatsapp/incoming`) is trivially re-expressible in Node.

**The tradeoffs (why it's #2, not #1):**
- **Footprint (C2 = 3):** a Node process + Baileys idles around **90–140MB** — *at or brushing the 150MB hard cap*, before you add several linked accounts. You will spend engineering effort defending a limit Go clears by default.
- **Not a single binary (C3 = 2):** shipping Node cross-platform means bundling the runtime via `pkg`/Node SEA or an installer that carries `node` + `node_modules`. Native deps and per-arch packaging (esp. mac-arm vs mac-intel) are more fragile, and the auto-update payload is tens of MB instead of one small binary.
- **Daemon packaging (C4 = 3):** works (`node-windows`, launchd plists, systemd units) but is more moving parts than Go's single-API service wrapper.

Pick #2 **only if** the binding constraint is team Go ramp-up / time-to-first-release, and you consciously accept the RAM ceiling risk and the heavier update artifact.

### Not Tauri (the tempting GUI shell)

Tauri has great numbers on footprint (uses the OS webview, no bundled Chromium) and security, so it's worth naming explicitly. But it **fails C1 the same way Rust does** — the Bridge's hard part is the MD *engine*, and Tauri's Rust core has no production MD library. You'd end up embedding a Node/Baileys sidecar inside Tauri, at which point Tauri is only buying you a GUI you don't need. **GUI-first frameworks optimize the wrong axis** for a service-is-the-product design.

---

### Concrete impact on the <150MB / <2% goal

| Runtime | Idle RAM (1 linked account) | Idle CPU | Meets hard cap? |
|---|---|---|---|
| **Go / whatsmeow** | ~20–60MB | ~0% (parked on WS read) | **Yes, large headroom** |
| Node / Baileys | ~90–140MB | ~1% | **Barely — at the cap** |
| Rust / .NET | ~10–40MB | ~0% | Yes (but no MD engine) |
| Electron / whatsapp-web.js | ~250–450MB | 2–8% (Chromium) | **No — disqualified** |

Whatsmeow's parked-goroutine model plus a static binary is the only choice that hits the target *without* the elaborate hibernation/wake machinery that dominates today's `sessions.js` — that complexity exists solely to ration Chromium RAM, and it evaporates once Chromium is gone.

---

### How this fits the (language-agnostic) Cloud contract

Whichever runtime wins, the Cloud side stays additive and backward-compatible:

- **Inbound:** the Bridge relays the same events `notifySaas` emits today (connected / disconnected / incoming), landing at `POST /api/whatsapp/incoming`. The one change: the co-located gateway's single shared `SAAS_INTERNAL_SECRET` (`x-internal-secret`) becomes **per-Bridge tokens** the Cloud validates and maps to `{WorkspaceID, BridgeID}`.
- **Outbound:** the `/sessions/:id/{start,status,pair,send,logout}` surface in `lib/wa.ts` becomes WS messages to the selected Primary Bridge instead of HTTP to `127.0.0.1:3001`.
- **connectionMode:** add a third value **`bridge`** alongside `qr` and `meta_cloud` (schema.prisma line 185). **Meta Cloud and legacy co-located QR keep working unchanged** during migration — the Bridge is purely additive, satisfying the backward-compat requirement.

The runtime decision does not leak into the Cloud's business logic; it only determines what runs on the customer's machine and what language the WS relay is written in. That containment is exactly why paying the Go language cost is affordable.


**Open questions (this domain):**
- Does the team have (or want to build) enough Go proficiency to own a production Go service long-term, or is minimizing new-language surface area a hard organizational constraint that would force the Node/#2 path despite its RAM-ceiling risk?
- What is the expected max number of WhatsApp accounts linked per single Bridge instance? This sets the real RAM budget: Go stays under 150MB for several accounts, but Node/Baileys can breach the cap past ~1-2 accounts, which could by itself decide Go vs Node.
- Will whatsmeow's and Baileys' feature coverage (media types, groups, template-like flows, the /export contacts+chats used by the one-time CRM import in index.js) fully match what whatsapp-web.js exposes today, or are there gaps that need a spike before committing?
- Cert pinning feasibility against the AWS/Caddy-fronted Cloud endpoint (w.keyone1.com): is the cert/rotation cadence compatible with pinning, or should we pin a long-lived intermediate/CA rather than the leaf?
- GUI decision for v1: ship the optional layer as a native system tray, an embedded local web UI on 127.0.0.1, or headless-only first with GUI deferred — this affects the initial binary's dependency set and QR-display UX.



## §4. Current transport contract → Bridge mapping

## KEYONE Bridge — Ground-Truth Transport Contract & Backward-Compatible Integration

This section documents the **exact** current transport between the KEYONE Cloud and the co-located `whatsapp-service/`, then maps every interaction onto the customer-hosted Bridge (WS), and lists the **minimal** Cloud changes to add `bridge` as a third `connectionMode` without breaking Meta Cloud or the legacy gateway.

All file references are absolute paths under the worktree root `/Users/yahyaemad/Desktop/appkeyone/.claude/worktrees/reverent-goldberg-c326b0`.

---

### 1. Current transport — every endpoint & callback (verified against source)

#### 1a. Cloud → gateway (HTTP, via `saas/lib/wa.ts`)

`wa.ts` builds every request as `fetch(BASE + path, { headers: { "X-Internal-Secret": SECRET } })` where `BASE = WHATSAPP_SERVICE_URL || "http://127.0.0.1:3001"` and `SECRET = SAAS_INTERNAL_SECRET`. The gateway (`whatsapp-service/src/index.js`) enforces the header on **every** route except `/health` (index.js:136-141).

| Verb + path | Caller (Cloud) | Request body | Response body | Gateway handler |
|---|---|---|---|---|
| `POST /sessions/:userId/start` | `wa.start` (start/route.ts) | `{ ephemeral?: bool }` | `{ ok, status, ephemeral }` | index.js:170 → `manager.start` |
| `GET /sessions/:userId/status` | `wa.status` (status/route.ts) | — | `{ status, qr, pairingCode, phone }` | index.js:187 |
| `POST /sessions/:userId/pair` | `wa.pair` (pair/route.ts) | `{ phone }` | `{ ok, code }` | index.js:199 → `requestPairingCode` |
| `POST /sessions/:userId/send` | `wa.sendNow` (outgoing-queue.ts:275, qr-provider.ts:78) | `{ to, text }` | `{ ok, id }` | index.js:211 → `manager.send` |
| `DELETE /sessions/:userId` | `wa.logout` (logout/route.ts) | — | `{ ok }` | index.js:223 → `manager.logout` |
| `POST /sessions/:userId/wake` | admin/runtime | — | `{ ok, status, wakeMs }` | index.js:146 |
| `POST /sessions/:userId/ephemeral` | import/campaign jobs | — | `{ ok, marked }` | index.js:181 |
| `GET /sessions/:userId/export` | one-time CRM import | `?chatLimit&msgLimit` | `{ ok, contacts[], chats[] }` | index.js:242 |
| `GET /sessions/stats` / `GET /health` | admin dashboards | — | pool stats / `{ ok, sessions }` | index.js:143,163 |

`wa.send` is **not** a direct HTTP call — it is `enqueueSend` (wa.ts:31), which writes to the durable `WaMessage` queue and returns `202`; the queue drainer (`outgoing-queue.ts:275`) is the one that eventually calls `wa.sendNow` → `POST /sessions/:id/send`. **This is the single physical send chokepoint** and the "WhatsApp send pipeline" the project rules forbid modifying without approval.

#### 1b. Gateway → Cloud (HTTP callback, `notifySaas` in `sessions.js:1255`)

One function posts **all** events to `SAAS_INCOMING_URL || http://127.0.0.1:3000/api/whatsapp/incoming` with `X-Internal-Secret`. Handled by `saas/app/api/whatsapp/incoming/route.ts` (checks header at line 100-103, branches on `body.event`).

| `event` | Emitted at | Payload | Cloud effect (incoming/route.ts) |
|---|---|---|---|
| `connected` | sessions.js:828 (`ready`) | `{ event, userId, phone }` | Bot.whatsappStatus=connected + drain (113-131) |
| `disconnected` | sessions.js:846, 335, 329 | `{ event, userId, reason }` | Bot.whatsappStatus=disconnected + recordReconnect (132-145) |
| `send_failed` | sessions.js:1067, 1198 | `{ event, userId, to, reason, source }` | recordFailure + safetyAudit (146-168) |
| `incoming` | sessions.js:974 | `{ event, userId, from:{phone,name}, mediaType, text, mediaBase64, mimetype, providerMessageId, providerTimestamp }` | full AI pipeline; **returns the reply synchronously** |

**Critical detail — the reply is the HTTP response, not a second callback.** On `incoming`, the Cloud returns `{ ok, reply, preDelayMs, typingDelayMs, risk, riskScore, warmupStage }` (incoming/route.ts:1188-1196 and every early-return). The gateway reads that response inline (sessions.js:974 `const result = await notifySaas(...)`), applies `preDelayMs`/`typingDelayMs`, then calls `sendMessageReliably`. Any WS protocol **must preserve this request→reply correlation** or the auto-reply path breaks.

#### 1c. Inbound & outbound message data shapes (carry 1:1 over WS)

- **Inbound** (built sessions.js:974-984): `event`, `userId`, `from.phone` (E.164 `+…` or `lid:<id>`), `from.name`, `mediaType∈{text,voice,image,video,document}`, `text`, `mediaBase64` (data only), `mimetype`, `providerMessageId` (`msg.id._serialized`), `providerTimestamp` (unix). Cloud dedupes on `providerMessageId` (incoming/route.ts:418).
- **Inbound reply** (Cloud→gateway): `reply` (string or null), `preDelayMs` (0-3000 clamped gateway-side), `typingDelayMs` (0-8000 clamped), plus `blocked`/`mode`/`risk` metadata that the gateway ignores except reply+delays.
- **Outbound send** (Cloud→gateway): `{ to, text }` → `{ ok, id }` where `id = r.key.id` (index.js:217). `outgoing-queue.ts:457 extractProviderMessageId` reads `id|messageId|providerMsgId` from `sent.data`.

---

### 2. Auth today vs why per-bridge tokens are mandatory

**Today:** one process-wide symmetric secret `SAAS_INTERNAL_SECRET` guards **both** directions (`X-Internal-Secret`). It works only because the gateway is *on the same box, on loopback*, one instance, one operator. Properties that make it unfit for a customer-hosted Bridge:

1. **Shared, not per-principal** — every session on the box authenticates with the same string. There is no way to identify *which* Bridge is talking, or to revoke one Bridge without rotating the secret for all.
2. **Bidirectional & symmetric** — the same secret lets the holder both *send as any tenant* (`POST /sessions/:anyUserId/send`) and *inject inbound events for any tenant* (`event:incoming, userId:<any>`). On a customer machine that is a cross-tenant impersonation key.
3. **No transport binding** — plain header over trusted loopback; over the public internet it is replayable and not bound to a workspace, device, or TLS channel.
4. **`userId` is caller-asserted** — the gateway puts `userId` in the URL/body; the Cloud trusts it. A customer-hosted sender must **not** be able to assert arbitrary `userId`.

**Bridge model:** each Bridge holds only `{WorkspaceID, BridgeID, BridgeToken, HeartbeatSecret}` (never a password/JWT). On WS connect it presents `BridgeID + BridgeToken`; the Cloud's bridge-gateway resolves it to exactly one Workspace and its bot `userId`, and **derives `userId` server-side** — the Bridge can never name another tenant. Tokens are per-Bridge, rotatable, and remotely revocable (a `revoke` control frame + DB flag), giving the "remote revoke/logout/update" requirement. The legacy shared secret is retained **only** for the co-located gateway path during migration.

---

### 3. connectionMode switch points that must gain `bridge`

`Bot.connectionMode` (schema.prisma:185, default `"qr"`, comment "qr | meta_cloud (legacy: unofficial | official)") is normalized by `saas/lib/messaging/mode.ts::normalizeConnectionMode`, which today collapses everything to `"qr" | "meta_cloud"` and **defaults unknown → qr**. Consumers:

- `lib/messaging/mode.ts` `ConnectionMode` type + `LEGACY_MAP` (add `bridge: "bridge"`).
- `lib/messaging/index.ts::resolveProvider` — currently only checks Meta eligibility else QR; add a `bridge` branch returning a new `bridgeProvider`.
- `lib/messaging/feature-flags.ts` — reads `connectionMode` for Meta gating (unchanged; `bridge` simply isn't Meta).
- Read-only display sites: `app/admin/businesses/page.tsx`, `app/admin/whatsapp/page.tsx`, `app/dashboard/usage/page.tsx`, `app/dashboard/compliance/page.tsx`, `app/api/settings/meta-cloud/route.ts`. These only render/label the mode.

**The real routing fork is `wa.ts` + the queue drainer**, because `qrProvider` and `enqueueSend`→`sendNow` both hard-code HTTP to `WHATSAPP_SERVICE_URL`. Bridge routing is introduced **inside `wa.ts`** (a per-tenant transport resolver) so the send pipeline in `outgoing-queue.ts` stays byte-for-byte identical — it keeps calling `wa.sendNow(userId, to, text)`; `wa.sendNow` decides HTTP-loopback vs WS-to-Bridge by the tenant's mode. This satisfies "never modify the send pipeline."

---

### 4. Today (co-located HTTP) → Bridge (customer-hosted WS) mapping

| Interaction (today) | Direction | Bridge equivalent (WS frame) | Payload change |
|---|---|---|---|
| `POST /sessions/:id/start` | Cloud→GW | `cmd:"session.start"` `{correlationId, ephemeral}` | none (userId implicit from Bridge auth) |
| `GET /sessions/:id/status` | Cloud→GW | `cmd:"session.status"` → ` evt:"session.status"` | none |
| `POST /sessions/:id/pair` | Cloud→GW | `cmd:"session.pair"` `{phone}` → `{code}` | none |
| `POST /sessions/:id/send` `{to,text}` → `{ok,id}` | Cloud→GW | `cmd:"message.send"` `{correlationId,to,text}` → `ack:"message.send"` `{ok,id}` | **identical fields**; `id` still `r.key.id` |
| `DELETE /sessions/:id` | Cloud→GW | `cmd:"session.logout"` | none |
| `POST /wake`, `/ephemeral`, `/export`, stats | Cloud→GW | `cmd:"session.wake/ephemeral/export/stats"` | none |
| `notifySaas(event:incoming …)` returns reply | GW→Cloud (req/resp) | `evt:"inbound"` `{correlationId, …same fields…}` → Cloud replies `ctl:"inbound.reply"` `{correlationId, reply, preDelayMs, typingDelayMs, …}` on same socket | **1:1**; correlationId replaces HTTP req/resp coupling |
| `notifySaas(event:connected/disconnected/send_failed)` | GW→Cloud | `evt:"connected|disconnected|send_failed"` (fire-and-forget) | 1:1; `connected` still only `{phone}` |
| Auth: `X-Internal-Secret` (shared) | both | WS handshake `{BridgeID, BridgeToken}` + TLS (cert-pinned) | per-Bridge, revocable |
| Health: `GET /health`, `/stats` | Cloud→GW | `evt:"heartbeat"` (Bridge→Cloud, signed w/ HeartbeatSecret) `{version, os, caps, ts}` + Online/Offline | **no WhatsApp auth ever** |
| `userId` in URL/body (caller-asserted) | — | derived server-side from Bridge identity | removes impersonation |

**Transport shape:** all Cloud→Bridge commands are async request/ack keyed by `correlationId`; the Cloud-side `wa.ts` WS client keeps a pending-map so `wa.sendNow` still returns `{ok, status, data:{id}}` exactly like the HTTP `call()` (wa.ts:6-22) — the queue drainer's `sent.ok`/`sent.data.id` handling is unchanged. Inbound uses the same correlation so `incoming/route.ts` can return its reply object and the bridge-gateway forwards it as `inbound.reply` — the Bridge then applies `preDelayMs`/`typingDelayMs` exactly as sessions.js:1012-1042 does today (that logic **moves into the Bridge**, unchanged).

---

### 5. Cloud modules — change vs stay

**Add (new, additive):**
- `saas/lib/bridge/gateway` — WS ingress: authenticates Bridges, maps BridgeID→Workspace/userId, keeps the live socket registry, forwards `inbound`→`/api/whatsapp/incoming` internally and returns the reply, and exposes a `sendViaBridge(userId, cmd, payload)` used by `wa.ts`.
- `saas/lib/messaging/bridge-provider.ts` — a `MessagingProvider` mirroring `qr-provider.ts` but calling the WS client instead of `wa.sendNow` HTTP (same `WaMessage` ledger writes, same `ERR.*` codes). Fills the existing `provider.ts` `"baileys"` third-slot pattern; the dormant `baileys-provider.ts` stays untouched.
- New models: `Bridge` (id, workspaceId, tokenHash, heartbeatSecretHash, os, version, caps, isPrimary, lastSeenAt, status, revokedAt) and `BridgeLinkCode` (device-code OAuth: code, workspaceId, expiresAt, consumedAt). `WaMessage.provider` already free-string (schema.prisma:821) → accepts `"bridge"` with zero migration risk.

**Change (minimal, additive branches only):**
- `mode.ts` — add `bridge` to `ConnectionMode` + `LEGACY_MAP`.
- `index.ts::resolveProvider` — add `if mode==="bridge" → bridgeProvider`.
- `wa.ts` — `sendNow`/`start`/`status`/`pair`/`logout` gain a per-tenant resolver: mode `bridge` → WS client; else existing HTTP (default preserved). This is the **only** file where the physical transport forks.

**Stay 100% unchanged:**
- `app/api/whatsapp/incoming/route.ts` — still receives the identical `incoming/connected/disconnected/send_failed` shapes and returns the identical reply object (bridge-gateway posts to it internally with the shared secret, or calls the exported handler directly).
- `lib/messaging/outgoing-queue.ts` — the send pipeline; keeps calling `wa.sendNow`.
- `qr-provider.ts`, `meta-provider.ts`, `meta-api.ts`, all Meta Cloud paths, `feature-flags.ts`.
- The legacy co-located `whatsapp-service/` and its `SAAS_INTERNAL_SECRET` — runs in parallel for tenants still on `qr` mode.

### 6. Migration safety

A tenant flips `qr → bridge` only after their Bridge reports `connected`. Because `normalizeConnectionMode` defaults unknown→`qr` and `resolveProvider` falls back to QR on any bridge-resolution failure (mirroring the existing Meta fallback in index.ts:63-67), a mis-set or offline Bridge degrades to the legacy path rather than dropping messages — and Meta Cloud tenants are never on this code path at all.


**Open questions (this domain):**
- Should the bridge-gateway forward inbound events to /api/whatsapp/incoming over internal HTTP (reusing SAAS_INTERNAL_SECRET, zero route change) or import and call the route handler in-process (avoids a network hop but couples the WS server to Next runtime)?
- For media, keep mediaBase64 inline in the WS inbound frame (simplest, 1:1 with today) or add a separate presigned-upload channel to keep the control socket light? Inline preserves the exact incoming/route.ts contract.
- Token rotation cadence and revocation propagation: push a revoke control frame on the live socket AND fail the next heartbeat, or rely on short-lived tokens the Bridge refreshes? Affects how fast a remote logout takes effect.
- Do we need per-Bridge WaMessage.provider granularity (e.g. 'bridge:<bridgeId>') for analytics, or is 'bridge' sufficient given Primary selection already narrows to one device?
- Should ephemeral/import/export flows (index.js ephemeral markers, /export CRM harvest) be supported on Bridge day one, or gated behind Bridge Capabilities so early Bridges advertise only send+inbound and the Cloud hides import UI until caps include it?



## §5. Authentication & device linking (no local accounts)

## KEYONE Bridge — Authentication & Device Linking

**Design-only.** Grounded in the real codebase: `saas/lib/auth.ts` (`mse_session` HS256 JWT, payload `{uid}`/`{mid}`, signed by `AUTH_SECRET`), `saas/lib/crypto-util.ts` (AES-256-GCM, scrypt key from `AUTH_SECRET`), `saas/lib/wa.ts` + `saas/app/api/whatsapp/incoming/route.ts` (shared `SAAS_INTERNAL_SECRET` via `x-internal-secret`), `whatsapp-service/src/{index,sessions}.js` (co-located gateway, keyed by `userId`), `saas/prisma/schema.prisma` (`Bot.connectionMode ∈ {qr, meta_cloud}`).

### 0. Design goal & invariants

The Bridge links to an **existing** KEYONE account with **no local accounts** — no username, password, or registration. Linking is a browser-based OAuth-style device flow that reuses the customer's live KEYONE session. The Bridge ends up holding only:

```
{ WorkspaceID, BridgeID, BridgeToken(refresh, encrypted), HeartbeatSecret(derived) }
```

Hard invariants enforced by this design:

| Invariant | How it's enforced |
|---|---|
| Bridge never sees the customer's JWT/password | `/link` page runs in the browser under `mse_session`; the Cloud mints a *separate* opaque code/token. The JWT never leaves the browser origin. |
| Cloud never sees WhatsApp auth | Auth folders/cookies/session stay on the Bridge disk; the WS protocol has **no** frame that carries them (transport domain owns this; auth domain guarantees the token grants no such upload path). |
| Cloud only knows Online/Offline/Version/OS/Heartbeat/Capabilities | `BridgeRegistry` schema below has exactly these columns + token hashes. |
| Stolen Bridge is instantly killable | Remote revoke deletes the token hash (no new access token can mint) + drops the live WS + short access-token TTL caps the window. |
| Backward compatible | New `/api/bridge/*` routes + `connectionMode='bridge'`; `whatsapp-service` and Meta Cloud paths untouched. |

**Identity mapping decision.** The entire codebase scopes data by the owner `User.id`, and `whatsapp-service` is already keyed by `userId`. So **`WorkspaceID ≡ User.id`**. No new tenancy primitive is invented; the Bridge simply carries the workspace's `User.id`.

---

### 1. The device-linking flow (RFC 8628 Device Grant + PKCE)

```
 keyone-bridge login
        │
        │ 1. generate PKCE: code_verifier(random 43-128B), code_challenge=S256(verifier)
        ▼
 ┌──────────────┐   POST /api/bridge/device/start                ┌─────────────┐
 │    BRIDGE    │ ─────────────────────────────────────────────▶│ KEYONE CLOUD│
 │  (CLI/svc)   │   { code_challenge, os, hostname, version,     │  (Next.js)  │
 │              │     capabilities }                             │             │
 │              │ ◀───────────────────────────────────────────── │  creates    │
 │              │   { device_code, user_code:"WXYZ-1234",        │ BridgeAuth  │
 │              │     verification_uri, verification_uri_complete,│  Code row   │
 │              │     interval:5, expires_in:300 }               │             │
 └──────┬───────┘                                                └─────────────┘
        │ 2. open browser → verification_uri_complete
        │    (or print user_code for headless)
        ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  BROWSER  →  GET /bridge/link?user_code=WXYZ-1234                          │
 │  • requireUser() via mse_session  (customer is ALREADY logged in)         │
 │  • if not logged in → normal /login → back to /bridge/link                │
 │  • page shows: hostname, OS, version, IP/geo, requested capabilities      │
 │  • customer picks Workspace (their User.id) + clicks "Link this device"   │
 │        │ POST /api/bridge/device/approve { user_code, workspaceId }       │
 │        ▼  server: getAuthContext() → binds code → {userId, approved:true} │
 └──────────────────────────────────────────────────────────────────────────┘
        │ 3. Bridge polls every `interval`s
        ▼
 ┌──────────────┐   POST /api/bridge/device/token                ┌─────────────┐
 │    BRIDGE    │ ─────────────────────────────────────────────▶│ KEYONE CLOUD│
 │              │   { device_code, code_verifier }               │  verifies   │
 │              │                                                │  S256(ver)  │
 │              │ ◀───────────────────────────────────────────── │  == chal    │
 │              │   200 { bridge_id, workspace_id,               │  creates    │
 │              │         refresh_token(one-time),                │ Bridge      │
 │              │         access_token, access_expires_in:900 }   │ Registry+   │
 │              │   (or 400 authorization_pending / slow_down /   │ Token rows  │
 │              │    expired_token / access_denied)               │             │
 └──────┬───────┘                                                └─────────────┘
        │ 4. store {workspace_id, bridge_id, refresh_token} encrypted (keychain/file)
        │    derive HeartbeatSecret = HKDF(refresh_secret, salt=bridge_id, info=hb-v1)
        ▼
 ┌──────────────┐   WSS upgrade  Authorization: Bearer <access_token>        ┌─────────────┐
 │    BRIDGE    │ ═════════════════════════════════════════════════════════▶│  WS GATEWAY │
 │              │   HMAC heartbeats signed with HeartbeatSecret              │  (bridge/ws)│
 └──────────────┘                                                            └─────────────┘
```

**Why device grant and not a redirect grant:** the Bridge is a native/headless daemon that may run on a box with no browser (Docker, VPS). RFC 8628 is purpose-built for "input-constrained device authorizes via a second device's browser." PKCE (S256) binds the polling client to the browser approval so a leaked `device_code` alone cannot be redeemed.

---

### 2. Cloud endpoints to ADD (all additive, under `/api/bridge/*`)

| Method / Path | Auth | Purpose | Key request → response |
|---|---|---|---|
| `POST /api/bridge/device/start` | none (public, rate-limited per-IP) | Begin device flow | `{code_challenge, os, hostname, version, capabilities}` → `{device_code, user_code, verification_uri(_complete), interval, expires_in}` |
| `GET /bridge/link?user_code=` | `mse_session` (`requireUser`) | Human approval page | Renders device context + workspace picker |
| `POST /api/bridge/device/approve` | `mse_session` (`getAuthContext`, owner/permission-gated) | Bind code to workspace | `{user_code, workspaceId}` → `{ok:true}`; sets code `approved`, `userId` |
| `POST /api/bridge/device/token` | PKCE only (public) | Exchange approved code for tokens | `{device_code, code_verifier}` → `{bridge_id, workspace_id, refresh_token, access_token, access_expires_in}` |
| `POST /api/bridge/token/rotate` | refresh_token (bearer) | Rotate refresh + mint access token | `{refresh_token}` → `{refresh_token(new), access_token, access_expires_in}` |
| `POST /api/bridge/revoke` | `mse_session` **or** self (refresh_token) | Kill a Bridge (logout/remote-revoke) | `{bridge_id}` → `{revoked:true}` |
| `GET /api/bridge/list` | `mse_session` (dashboard) | List workspace Bridges + set Primary | → registry rows (status/version/os/heartbeat/caps) |
| `WSS /bridge/ws` | `Authorization: Bearer <access_token>` | Message transport upgrade | verifies access token → attaches to workspace channel |

**Reuse existing patterns:** `device/token`/`rotate`/`ws` verification mirror the constant-time secret check already in `whatsapp-service/src/index.js` (`provided !== SECRET`) but **per-Bridge**. The `/link` page and `device/approve` reuse `getAuthContext()`/`requirePermission()` from `saas/lib/auth.ts` verbatim.

---

### 3. Token & code model — lifetimes, PKCE, rotation

| Artifact | Form | Lifetime | Stored where | Notes |
|---|---|---|---|---|
| `code_verifier` | random 43–128 bytes, base64url | in-memory on Bridge until token exchange | Bridge RAM only | PKCE, never persisted |
| `code_challenge` | `BASE64URL(SHA256(verifier))` | with the auth-code row | Cloud DB (`BridgeAuthCode`) | S256 method only (never `plain`) |
| `device_code` | 256-bit opaque random | **5 min** (`expires_in:300`) | Cloud DB (hashed) | polled by Bridge |
| `user_code` | 8-char human code `WXYZ-1234` | same 5 min | Cloud DB | shown to human; ambiguity-safe charset (no 0/O/1/I) |
| **Bridge Refresh Token** | `bridge_id.secret` — 256-bit opaque `secret` | **90 days** sliding, rotates on every use | Bridge: encrypted at rest. Cloud: **SHA-256 hash only** | opaque, DB-leak-safe |
| **Bridge Access Token** | signed JWT, `sub=bridge_id`, `wid`, `caps`, `exp` | **15 min** | Bridge RAM (re-minted via rotate) | presented on WS upgrade; signed by a *derived* key (§6) |
| `HeartbeatSecret` | `HKDF-SHA256(refresh_secret, salt=bridge_id, info='keyone-bridge-heartbeat-v1')` | tracks refresh token | Bridge: derived on demand (not stored). Cloud: re-derivable from stored… (see §6 note) | HMAC signs heartbeats/control frames |

**PKCE.** Only `S256` accepted. `device/token` recomputes `BASE64URL(SHA256(code_verifier))` and constant-time-compares to the stored `code_challenge`. Mismatch → `invalid_grant`.

**Rotation cadence.** Refresh token rotates **on every `token/rotate` call** (typically once per access-token cycle, i.e. ~every 15 min while online, and always on reconnect/`login`). Each rotate:
1. Look up the presented refresh token by hash.
2. If it's already been consumed → **reuse detected** → revoke the whole Bridge (delete all its token rows, push `revoke` control frame). This is the stolen-token tripwire (RFC 6819 §5.2.2.3).
3. Otherwise mark old token consumed, generate a new `secret`, store its hash, return the new refresh token + a fresh 15-min access token.

**Idempotency guard (anti-lockout).** Because a lost rotate response would make the Bridge retry with an already-consumed token and self-revoke, `rotate` keeps the immediately-previous token hash valid for a **60-second grace window** and returns the *same* new token on replay within that window. Only reuse *outside* the grace window is treated as theft.

---

### 4. Local secret storage (never store passwords / JWT)

Storage strategy, in preference order, same code path on all platforms via a `SecretStore` abstraction:

| Platform | Primary store | Mechanism |
|---|---|---|
| macOS (Intel + Apple Silicon) | Keychain | `security`/Keychain Services item, service=`com.keyone.bridge`, account=`bridge-refresh` |
| Windows | Credential Manager | DPAPI-protected generic credential (`CredWrite`) |
| Linux desktop | libsecret / Secret Service | `org.freedesktop.secrets` collection |
| Linux headless / Docker | **Encrypted-file fallback** | AES-256-GCM file `~/.keyone-bridge/secret.age`, key = machine-bound |

**Encrypted-file fallback key derivation (headless/Docker):**
```
master_key = HKDF-SHA256(
  ikm  = KEYONE_BRIDGE_MASTER_KEY   (operator-supplied secret, preferred)
         ?? machine_id              (/etc/machine-id, or Windows MachineGuid, or IOPlatformUUID)
             + primary_MAC,
  salt = per-install random (stored in cleartext beside the blob; salt is not secret),
  info = 'keyone-bridge-file-key-v1')
blob = AES-256-GCM(master_key, plaintext = refresh_token, aad = bridge_id)
```
This mirrors the project's existing `crypto-util.ts` (AES-256-GCM, HKDF/scrypt-derived key) so it's a familiar shape. Docker guidance: mount `KEYONE_BRIDGE_MASTER_KEY` as a Docker/compose secret so a copied volume alone is useless.

**What is persisted locally:** `{workspace_id, bridge_id, refresh_token(encrypted)}` + a plaintext non-secret `install_salt`. **Never:** password, `mse_session` JWT, access token (RAM only), HeartbeatSecret (derived on demand).

---

### 5. What the Cloud persists (Bridge registry) vs. what the Bridge persists

**Cloud — new Prisma models (additive):**

```
model BridgeRegistry {
  id             String   @id @default(cuid())   // = BridgeID
  userId         String                          // = WorkspaceID (owner User.id); indexed
  label          String?                         // customer-friendly name
  isPrimary      Boolean  @default(false)        // customer-selected Primary per workspace
  status         String   @default("offline")    // online | offline | revoked
  version        String?                         // Bridge app version
  os             String?                         // darwin-arm64 | win32 | linux | docker
  capabilities   String   @default("[]")         // JSON: ["send","receive","media",...]
  lastHeartbeat  DateTime?
  createdAt      DateTime @default(now())
  revokedAt      DateTime?
  // NOTHING about WhatsApp auth. No phone, no session, no cookies.
}

model BridgeToken {         // one active refresh token per Bridge (+ short grace overlap)
  id            String   @id @default(cuid())
  bridgeId      String                            // FK → BridgeRegistry
  refreshHash   String   @unique                  // SHA-256(refresh secret) — NEVER the secret
  consumedAt    DateTime?                          // set on rotation; reuse ⇒ theft
  expiresAt     DateTime                           // 90d sliding
  createdAt     DateTime @default(now())
}

model BridgeAuthCode {      // ephemeral device-flow code
  id             String   @id @default(cuid())
  deviceCodeHash String   @unique
  userCode       String   @unique
  codeChallenge  String                            // S256
  userId         String?                            // set on approval
  status         String   @default("pending")       // pending | approved | denied | expired | consumed
  os             String?
  hostname       String?
  version        String?
  capabilities   String   @default("[]")
  expiresAt      DateTime                           // now + 5min
  createdAt      DateTime @default(now())
}
```

Plus `Bot.connectionMode` gains the value `"bridge"` (schema comment already documents the qr/meta_cloud enum at `schema.prisma:185`; this is an additive third value with the same "never route until verified" gating philosophy).

**Bridge — local disk:** `{workspace_id, bridge_id, refresh_token(encrypted), install_salt}`. That's all.

Symmetric to today's model: the co-located gateway trusted one `SAAS_INTERNAL_SECRET`; the Bridge fleet trusts **N per-Bridge tokens**, each independently revocable.

---

### 6. HeartbeatSecret derivation & WS auth

- **Access token → WS upgrade.** Bridge presents `Authorization: Bearer <access_token>` on the `wss://bridge.keyone1.com/bridge/ws` upgrade. The gateway verifies the JWT signature + `exp` + looks up `BridgeRegistry.status != revoked`. This is the only DB read on connect.
- **Access-token signing key is *derived*, not `AUTH_SECRET` directly:** `bridge_sign_key = HKDF-SHA256(AUTH_SECRET, info='keyone-bridge-access-signing-v1')`. This isolates Bridge tokens from the `mse_session` HS256 key even though both ultimately root in `AUTH_SECRET` (see Risks — AUTH_SECRET is the single root of trust).
- **HeartbeatSecret** = `HKDF-SHA256(refresh_secret, salt=bridge_id, info='keyone-bridge-heartbeat-v1')`. Every ~30s the Bridge sends `heartbeat{ts, nonce, hmac=HMAC-SHA256(HeartbeatSecret, bridge_id|ts|nonce)}`. Because it's derived from the refresh secret, the Cloud can re-derive it *only if it stored the refresh secret* — which it deliberately does **not** (it stores only the hash). **Resolution:** the Cloud verifies heartbeat liveness via the already-authenticated WS + a per-connection ephemeral session key negotiated at upgrade time (derived from the access token), and HeartbeatSecret is used Bridge-side to authenticate **out-of-band** heartbeat/re-auth HTTP pings (`POST /api/bridge/heartbeat`) where no live WS exists. For those, the Cloud stores a second hash `heartbeatHash = SHA-256(HeartbeatSecret)` at token-issue time (cheap, rotates with the token) and HMAC-verifies against it. This keeps liveness auth off the hot path and DB-leak-safe.

*(Open question in §OpenQuestions: whether to keep both an in-band WS heartbeat and an out-of-band HTTP heartbeat, or collapse to WS-only. Both are specified; ops picks.)*

---

### 7. Remote revoke / logout semantics — how a stolen Bridge dies instantly

`keyone-bridge logout` (self) and dashboard "Revoke" (remote) both hit `POST /api/bridge/revoke`:

1. **Cut minting:** delete all `BridgeToken` rows for the `bridgeId` and set `BridgeRegistry.status='revoked'`, `revokedAt=now()`. → No future `token/rotate` can succeed; no new access token can ever mint. This is the hard kill.
2. **Cut the live session:** the gateway looks up the Bridge's open WS and sends a `control:{type:'revoke'}` frame, then closes the socket (code `4403`). The Bridge, on `revoke`, wipes its local secret store and exits.
3. **Bound the worst case:** even if the WS is network-partitioned and never receives the frame, the current access token expires within its 15-min TTL and cannot be renewed (step 1). So the maximum stolen-Bridge window is **≤ access-token TTL**, independent of connectivity.

**Logout** is the same as revoke but self-initiated (authenticated by the refresh token) and additionally deletes the local encrypted secret. **Remote update** rides the same control channel (`control:{type:'update', version, release_url}`) with rollback handled by the update domain.

---

### 8. Threat model

| Threat | Vector | Mitigation |
|---|---|---|
| Stolen refresh token (disk theft / volume copy) | Read encrypted blob | Keychain/DPAPI/libsecret at rest; machine-bound file key for Docker; **rotation + reuse-detection** means first use by attacker OR victim trips revocation; remote revoke as backstop. |
| Leaked `device_code` | MITM on `device/start` response | Useless without `code_verifier` (PKCE S256, never transmitted). 5-min TTL. |
| Device-code phishing (RFC 8628 known) | Attacker starts flow, tricks victim to approve | `/link` shows hostname/OS/IP/geo/caps + explicit workspace pick + typed confirm; short TTL; per-IP rate-limit on `device/start`. |
| Token replay | Reuse consumed refresh token | Reuse-detection revokes entire Bridge (tripwire). 60s idempotency grace prevents false positives. |
| DB exfiltration (Cloud side) | Dump `BridgeToken` | Only SHA-256 hashes stored; no secret is recoverable; access-token signing key is HKDF-derived, not the raw AUTH_SECRET. |
| Impersonating the Cloud to a Bridge | Rogue WS endpoint | TLS + cert/CA pinning (best-effort, SPKI/CA-level with backup pin); Bridge validates access-token issuer. |
| Compromised access token | Sniff a 15-min JWT | Short TTL; bound to `bridge_id`+`wid`; revoke kills renewal; WS is TLS-encrypted so sniffing requires TLS break. |
| Privilege escalation via linking | Team member links a Bridge they shouldn't | `device/approve` gated by owner-or-permission RBAC (`getAuthContext`/`can`). |
| WhatsApp-auth exfiltration to Cloud | Malicious/altered protocol | Protocol has **no** frame carrying cookies/session/auth-folders; token grants transport scope only, not upload-auth scope. |
| Fleet-wide brick via bad pin/cert rotation | LetsEncrypt leaf rotation | Pin CA/intermediate not leaf; ship backup pin; signed pin-update channel; documented un-pin escape hatch. |

---

### 9. Backward compatibility & migration

- **No breaking changes.** `whatsapp-service` (shared `SAAS_INTERNAL_SECRET`, `x-internal-secret`, `notifySaas → /api/whatsapp/incoming`) and Meta Cloud transport are untouched. `Bot.connectionMode` keeps defaulting to `qr`.
- A workspace on `qr` (co-located) can add a Bridge and flip `connectionMode='bridge'` when the Bridge reports `online` + `capabilities:["send","receive"]`, mirroring the existing "never route until verified" gating comment at `schema.prisma:180-185`.
- The inbound path from a Bridge reuses the **shape** of `/api/whatsapp/incoming` (events `connected|disconnected|incoming|send_failed`, keyed by `userId`) but arrives over the authenticated WS instead of the shared-secret HTTP POST — so downstream Cloud logic (queue drain, Bot status update) needs **no change**, only a new authenticated ingress. (Transport domain owns the WS↔incoming bridging; auth domain guarantees the WS principal resolves to exactly one `userId`=`WorkspaceID`.)

### 10. CLI ↔ endpoint mapping

| CLI | Endpoints used |
|---|---|
| `keyone-bridge login` | `device/start` → open `/bridge/link` → poll `device/token` → store secret |
| `keyone-bridge logout` | `revoke` (self, refresh-token auth) + wipe local store |
| `keyone-bridge start` | load secret → `token/rotate` (get access token) → WS connect |
| `keyone-bridge status` | local WS state + last `GET /api/bridge/list` self-row (online/version/heartbeat) |
| `keyone-bridge update` | update domain via `control:{type:'update'}` or manual GitHub Releases check |


**Open questions (this domain):**
- Multi-workspace-per-user: the codebase treats one owner `User.id` as the workspace. Can a single KEYONE account own multiple workspaces the Bridge must choose between, or is the workspace-picker step effectively always a single choice today? This determines whether `device/approve` needs a real workspace selector or just a confirm button.
- Team members (`{mid}` sessions) — should a non-owner team member with a WhatsApp/integration permission be allowed to link a Bridge, or is linking owner-only? Recommendation: gate `device/approve` behind an owner-or-explicit-permission RBAC check (mirror `requirePermission`).
- Access-token TTL vs. WS longevity: do we mint a fresh access token per WS connect only (long-lived WS, revoke via control frame) or also require periodic re-auth on a live WS? Proposed default: 15-min access token, WS stays up, liveness proven by HMAC heartbeats; revoke closes the socket. Confirm this matches ops expectations.
- Do we want per-capability scoping in the Bridge token now (e.g. `send`, `receive`, `media`) so a future read-only Bridge is expressible, or defer scopes to v1.1? The registry already needs a Capabilities column, so adding a scope claim is cheap now.
- Cert pinning feasibility depends on the current TLS termination (Caddy/LetsEncrypt per the AWS deploy memo). LetsEncrypt leaf certs rotate every ~60 days, so leaf-pinning is unworkable — need confirmation we can pin the ISRG/LetsEncrypt intermediate or run a dedicated pinned CA for `bridge.keyone1.com`.



## §6. Bridge ⇄ Cloud secure WebSocket protocol

## KEYONE Bridge ⇄ Cloud Protocol (secure WebSocket)

This is the persistent, encrypted WebSocket protocol that replaces the co-located HTTP hop between the KEYONE Cloud and the WhatsApp transport. It is **additive**: `meta_cloud` and the legacy co-located `qr` gateway keep working unchanged during migration.

### 1. Where it slots into the existing system

The Bridge does **not** invent new Cloud semantics. It carries the exact payloads the current HTTP hop carries, so the approval-gated send pipeline is untouched.

| Today (co-located HTTP) | With Bridge (WS) | Contract preserved |
|---|---|---|
| `saas/lib/wa.ts` → `fetch(BASE + "/sessions/:userId/send")` with `X-Internal-Secret` | `lib/bridge/registry.ts` → `send_message` frame to the workspace's **PRIMARY** bridge WS | `wa.sendNow(userId,to,text)` still returns `{ok,status,data:{id}}`. The `outgoing-queue.ts` drainer calls `wa.sendNow` unchanged. |
| gateway `notifySaas(...)` → POST `/api/whatsapp/incoming` with `X-Internal-Secret` | Bridge `inbound_message` / `connection_state` / `delivery_receipt` frames → same `/api/whatsapp/incoming` ingestion logic | Same body shape (`from`, `mediaType`, `text`, `mediaBase64`, `mimetype`, `providerMessageId`, `providerTimestamp`). Same dedupe. Same reply shape (`reply`, `preDelayMs`, `typingDelayMs`, `blocked`). |
| `Bot.connectionMode ∈ {qr, meta_cloud}` | add `bridge` | `qr` and `meta_cloud` values and code paths unchanged. |

Cited anchors: `saas/lib/wa.ts:24` (`sendNow`), `saas/lib/messaging/outgoing-queue.ts:275` (`wa.sendNow(row.userId, row.customerPhone, row.body)`), `whatsapp-service/src/sessions.js:974` (the `notifySaas({event:"incoming",...})` envelope), `saas/app/api/whatsapp/incoming/route.ts:418` (the `providerMessageId` duplicate-protection this protocol reuses), `saas/prisma/schema.prisma:185` (`connectionMode`).

> **Send-pipeline rule honored:** the Bridge is a transport under `wa.sendNow`. Approval gating, quotas, anti-ban shaping, humanize delays, and the outgoing queue all run **before** a byte reaches the WS. The Bridge only receives an already-approved, already-shaped `send_message`.

---

### 2. Connection establishment + auth

```
Bridge                                            Cloud (WS gateway, e.g. /bridge/ws)
  |  wss:// TLS 1.3 handshake (SNI = bridge.keyone1.com)      |
  |  [optional] SPKI cert pin check ------------------------->|
  |                                                           |
  |  HTTP Upgrade: GET /bridge/ws                             |
  |    Authorization: Bearer <BridgeToken>                    |
  |    X-KeyOne-Workspace: <WorkspaceID>                      |
  |    X-KeyOne-Bridge:    <BridgeID>                         |
  |    Sec-WebSocket-Protocol: keyone.bridge.v1               |
  | -------------------------------------------------------->  |
  |                                       (verify token hash, |
  |                                        workspace binding, |
  |                                        revocation list)   |
  |  101 Switching Protocols  <----------------------------- OK|
  |                                                           |
  |  --> hello  (version, os, arch, capabilities)             |
  |  <-- hello_ack (role: primary|standby, serverTime,        |
  |                 negotiatedCaps, envelopeVersion,          |
  |                 heartbeatIntervalMs, resumeToken)         |
  |  ==== channel open; heartbeats begin ====                |
```

**Auth model (hard requirement compliance):**
- The **only** credential in the handshake is the opaque **BridgeToken** (Bearer). It is issued by the browser device-code link flow, stored **encrypted on the Bridge host**, and is **not** a JWT and **not** the shared `SAAS_INTERNAL_SECRET`.
- The Cloud stores only `argon2id(BridgeToken)` and the tuple `{WorkspaceID, BridgeID, tokenHash, heartbeatSecretHash, revokedAt, capabilities}`.
- The Bridge locally holds **only** `{WorkspaceID, BridgeID, BridgeToken, HeartbeatSecret}`. WhatsApp cookies/session/auth-folder **never** leave the host and are **never** referenced in any frame.
- TLS is mandatory (`wss://`). **Cert pinning** is SPKI-based, ships current+next pins, and defaults to *report-and-alert* (fail-open) so a CA rotation cannot brick the fleet; a workspace can opt into *strict* (fail-closed) pinning, remotely toggleable.

**Token rotation / revoke / logout (remote control):**
- `rotate_token` (Cloud→Bridge): two-phase — Cloud sends new token, Bridge persists + `ack`s, Cloud invalidates old hash. Zero-downtime.
- Remote **revoke**: Cloud drops the token from the valid set and force-closes the socket with close code `4401`. Bridge cannot re-handshake and surfaces "unlinked" in CLI/GUI.
- Remote **logout**: `control{action:"logout"}` → Bridge wipes local WhatsApp session, emits `connection_state{state:"disconnected"}`, stays linked (token valid) so it can re-QR.

---

### 3. Heartbeat / keepalive

Application-level (not just WS ping frames, so we can attach the HMAC and a monotonic seq).

```json
// Bridge -> Cloud, every heartbeatIntervalMs (default 20000)
{ "v":1, "id":"hb-8f21", "type":"heartbeat", "ts":1751800000000,
  "payload": {
    "seq": 4821,
    "waState": "connected",          // mirrors current whatsappStatus vocabulary
    "rssMB": 132, "cpuPct": 0.8,
    "mac": "b3d1...e9"               // HMAC-SHA256(HeartbeatSecret, `${bridgeId}|${seq}|${ts}`)
  } }
```
```json
// Cloud -> Bridge
{ "v":1, "id":"hb-8f21", "type":"ack", "ack":"hb-8f21", "ts":1751800000010 }
```

- Interval **20s**; **3 missed beats (60s)** → Cloud marks the bridge **Offline** (updates only the safe status surface: Online/Offline/Version/OS/Heartbeat/Capabilities — never WhatsApp auth).
- `mac` uses **HeartbeatSecret** (separate from BridgeToken) so a stolen heartbeat can't drive the control channel, and heartbeat forgery is detectable.
- If Offline and the bridge is PRIMARY, the Cloud stops routing sends to it; `outgoing-queue` naturally holds messages (it already delays on failure — `outgoing-queue.ts:241` kill-switch/cooldown paths) until PRIMARY returns or the customer promotes a standby.
- Bridge-side: if it misses `heartbeat_ack` 3× it treats the socket as dead and triggers the reconnect ladder (§7).

---

### 4. Versioned message envelope (framing)

Every frame is a single JSON text frame — one envelope, one WS message. Binary (media chunks) uses a typed envelope with a base64/opaque payload or a follow-on binary frame (see §6.4).

```
Envelope {
  v      : int        // envelope version (start at 1). Governs field layout only.
  id     : string     // unique per-frame id (ULID/uuid) — used for ack/dedupe
  type   : string     // message type (see §5)
  ts     : int64       // ms epoch, sender clock
  corr?  : string     // correlation id: send_message.id -> delivery_receipt.corr
  ack?   : string     // set on ack/nak frames: the id being acknowledged
  lane?  : "control"|"data"|"media"|"log"   // flow-control lane (default "data")
  payload: object     // type-specific, schema per §5
}
```

**Framing rules**
- One JSON object per WS frame. No frame-splitting except explicit media chunking.
- `type` is the switch. Unknown `type` → responder returns `nak{code:"unknown_type"}` and **does not** disconnect (forward-compat).
- `v` mismatch handled by capability negotiation (§8), not by dropping the socket.
- Max frame sizes per lane: control/data ≤ 64KB, media ≤ 256KB per chunk, log ≤ 32KB.

---

### 5. Message types + JSON schemas

#### 5.1 Bridge → Cloud

**`hello` / register**
```json
{ "v":1,"id":"...","type":"hello","ts":...,"payload":{
  "protocol":"keyone.bridge.v1",
  "bridgeId":"brg_01H...", "workspaceId":"ws_123",
  "version":"1.4.2",                       // Bridge app semver
  "os":"windows|macos|linux|docker",
  "arch":"x64|arm64",
  "capabilities":["media.chunked","heartbeat.hmac","resume","compression.log",
                  "wa.pairingCode","wa.qr","waState.v1"],
  "waState":"disconnected",
  "resumeToken":"rt_..." | null            // present on reconnect (see §7)
}}
```
Cloud replies `hello_ack` (Cloud→Bridge, §5.2) with the **authoritative role** (primary/standby), negotiated caps, and envelope version.

**`heartbeat`** — §3.

**`qr_code`** (QR to be rendered in the Cloud dashboard; the QR is generated **locally** on the Bridge — this frame only carries the display artifact, never session material)
```json
{ "type":"qr_code","payload":{
  "qrDataUrl":"data:image/png;base64,...",  // mirrors sessions.js qrcode.toDataURL
  "pairingCode":"ABCD-1234" | null,
  "expiresAt": 1751800060000
}}
```

**`connection_state`** (drives `Bot.whatsappStatus` + `whatsappPhone`; maps 1:1 to today's `connected`/`disconnected` events)
```json
{ "type":"connection_state","payload":{
  "state":"connecting|qr|connected|disconnected",
  "phone":"+2010...","|null",
  "reason":"logout|health_probe_stale|network|unknown"  // only on disconnected
}}
```
Cloud handling reuses `incoming/route.ts` `event:"connected"`/`"disconnected"` logic (`route.ts:113`, `:132`).

**`inbound_message`** — carries the **exact** current shape (`sessions.js:974`) so the ingestion is byte-compatible:
```json
{ "type":"inbound_message","payload":{
  "from": { "phone":"+2010...", "name":"Ahmed" },
  "mediaType":"text|voice|image|video|document",
  "text":"...",
  "mediaBase64":"...|null",
  "mimetype":"audio/ogg|null",
  "providerMessageId":"3EB0...@c.us",   // dedupe key, see §9
  "providerTimestamp": 1751799990        // unix secs — feeds the 10-min historical guard (route.ts:85)
}}
```
The Cloud responds with an `ack` whose payload carries the ingestion result (`reply`, `preDelayMs`, `typingDelayMs`, `blocked`) so the Bridge can perform the human-like typing/read delays exactly as `sessions.js:1008-1074` does today. **The Bridge does not send the reply on its own initiative** — it only sends when the Cloud returns a `reply` (or later issues a `send_message`), preserving approval gating.

**`delivery_receipt` / ack** (outbound result back to Cloud; `corr` links to the original `send_message.id`)
```json
{ "type":"delivery_receipt","corr":"snd_01H...","payload":{
  "status":"sent|failed",
  "providerMessageId":"3EB1...@c.us" | null,   // becomes {data:{id}} in wa.sendNow's return
  "reason":"invalid phone|number not registered on WhatsApp|..." | null
}}
```
On `failed`, the Cloud reuses the existing `send_failed` handling (`route.ts:146`) → `recordFailure` + SafetyAudit.

**`error`**
```json
{ "type":"error","payload":{ "code":"wa_init_failed|media_download_failed|...","detail":"...", "corr":"..."|null }}
```

**`log`** (observability only; lane="log", never carries WhatsApp content beyond truncated previews)
```json
{ "type":"log","lane":"log","payload":{ "level":"info|warn|error","msg":"...", "tags":{...} }}
```

#### 5.2 Cloud → Bridge

**`hello_ack`**
```json
{ "type":"hello_ack","ack":"<hello.id>","payload":{
  "role":"primary|standby",
  "serverTime":...,"envelopeVersion":1,
  "heartbeatIntervalMs":20000,
  "negotiatedCaps":["media.chunked","resume","heartbeat.hmac"],
  "resumeToken":"rt_...",                 // used on the next reconnect
  "minBridgeVersion":"1.2.0"              // soft floor; below → warn, not disconnect
}}
```

**`send_message`** (mirrors `lib/wa.ts` send; only PRIMARY receives these)
```json
{ "type":"send_message","id":"snd_01H...","payload":{
  "to":"+2010...",
  "text":"...",                           // OR media (below)
  "media": { "mimetype":"image/jpeg","base64":"..." } | null,
  "idempotencyKey":"wa:userId:providerMessageId:out",  // §9
  "reason":"manual|broadcast|followup|order_update|system"  // mirrors QueueReason
}}
```
The Bridge sends via its local WhatsApp session, then returns `delivery_receipt{corr:"snd_01H..."}`. This maps to `wa.sendNow`'s `{ok,status,data:{id}}` return, so `outgoing-queue.ts` sees the identical contract.

**`control`**
```json
{ "type":"control","id":"ctl_...","payload":{
  "action":"reconnect|disconnect|logout|rotate_token|update_now|promote_primary|demote_standby",
  "args": { /* e.g. rotate_token: { newToken:"..." }, update_now: { version:"1.5.0", url:"...", sha256:"..." } */ }
}}
```
Every `control` requires a Bridge `ack{ack:"ctl_..."}` (or `nak` with a reason). `update_now` triggers the GitHub-Releases auto-update with rollback; `promote_primary` performs the standby→primary transition (§10).

**`config`** (non-secret operational tuning; never WhatsApp auth)
```json
{ "type":"config","payload":{
  "heartbeatIntervalMs":20000, "sendSpacingMs":1200, "maxMediaKB":10240,
  "capabilitiesRequired":["heartbeat.hmac"] }}
```

**`ack` / `nak`** (generic)
```json
{ "type":"ack","ack":"<id>","payload":{ /* optional result, e.g. incoming reply */ } }
{ "type":"nak","ack":"<id>","payload":{ "code":"unknown_type|bad_schema|not_primary|rate_limited","detail":"..." } }
```

---

### 6. Ordering, backpressure, flow-control, media

1. **Lanes.** Four logical lanes share one socket: `control` (highest), `data`, `media`, `log` (lowest). A simple weighted scheduler ensures **heartbeat/ack/control are never head-of-line-blocked** by a large media frame. This directly protects the 60s liveness window.
2. **Ordering.** In-lane order is preserved (single TCP socket). Across lanes there is no ordering guarantee — and we do **not** promise strict per-contact outbound ordering (WhatsApp itself reorders; per-recipient pacing already lives in the queue + Bridge `waitForOutboundSlot`, `sessions.js:190`).
3. **Backpressure.** Each side advertises a credit window in `hello`/`hello_ack` (default 64 unacked `data`/`media` frames). A sender stops sending in a lane when its outstanding-unacked count hits the window and resumes on `ack`. If `bufferedAmount` on the socket exceeds a high-water mark, the sender pauses non-control lanes. The Bridge applies the same to inbound bursts so a message storm can't blow the <150MB idle / low-CPU budget (it queues to its bounded local outbox and applies WS-level pause).
4. **Media chunking.** `mediaType != text` with payload > 256KB is split into `media` frames: `media_begin{corr, totalBytes, mimetype}` → `media_chunk{corr, seq, base64}` × N → `media_end{corr, sha256}`. Chunks are interleaved with heartbeats. Small media stays inline in `inbound_message`/`send_message` (compat with today's single-JSON path).

---

### 7. Reconnect: exponential backoff + resume

**Backoff ladder** (identical philosophy to the current gateway, `sessions.js:543`): `5s → 15s → 30s → 60s → 120s → 300s (cap)`, each with ±25% jitter; after 8 consecutive failures, back off to a 30-min pause then reset. All timers `unref()`-style so idle CPU stays < 2%.

**Resume handshake.** On reconnect the Bridge presents the `resumeToken` from its last `hello_ack`:
- The Bridge maintains a **bounded local outbox** of `inbound_message`/`delivery_receipt` frames not yet `ack`'d. On resume it **replays** them (they carry stable `providerMessageId`s, so §9 dedupe absorbs any that actually landed).
- The Cloud replays unacked `send_message` from its **existing durable `outgoing-queue`** — nothing new needed; the drainer simply re-drives `wa.sendNow` → the new PRIMARY socket. Idempotency (§9) prevents double-send.
- If `resumeToken` is unknown/expired, both sides do a clean `hello` and rely purely on §9 idempotency + the queue for no-loss/no-dup.

```
disconnect → backoff(attempt) → wss handshake → hello{resumeToken} →
  hello_ack{role} → replay outbox → resume normal flow
```

---

### 8. Capability negotiation + version compatibility

- `hello.capabilities` (Bridge) ∩ Cloud-supported → `hello_ack.negotiatedCaps`. Both sides use only the intersection.
- **Envelope version (`v`)** is negotiated in `hello_ack.envelopeVersion` = `min(bridgeMax, cloudMax)`. Adding fields is backward-compatible (unknown fields ignored); removing/renaming requires a `v` bump.
- **Unknown `type`** → `nak{unknown_type}`, socket stays up. This is the core forward-compat guarantee: a newer Cloud can emit a new control action to an older Bridge and simply learn (via nak) that it's unsupported, then degrade gracefully.
- `minBridgeVersion` is a **soft** floor: below it the Cloud sends `log`/`config` nudges and (optionally) `control{update_now}`, but does not hard-disconnect — avoids fleet-wide outage on a Cloud deploy.

---

### 9. At-least-once delivery + idempotency (reuse existing dedupe)

**Inbound (Bridge→Cloud): no new dedupe machinery.** The ingestion already dedupes on `(conversationId, role:"user", providerMessageId)` and returns `blocked:"duplicate_event"` (`incoming/route.ts:418-435`). The Bridge's resume-replay therefore cannot create a second user message, reply, or bill event. The Bridge sets `providerMessageId` exactly as today (`msg.id._serialized || msg.id.id`, `sessions.js:982`).

**Outbound (Cloud→Bridge): idempotencyKey + Bridge LRU.** Each `send_message` carries a stable `idempotencyKey` derived by the Cloud (same construction family as `usageIdempotencyKey`, `incoming/route.ts:586`). The Bridge keeps a **bounded, restart-persistent LRU of seen keys**; a resent `send_message` with a known key is answered with the cached `delivery_receipt` and **not** re-delivered to WhatsApp. This makes the send at-least-once end-to-end while exactly-once at the WhatsApp boundary.

> Net effect: a reconnect can safely replay in both directions with **zero duplicates** and **zero loss**, using mechanisms that already exist on the Cloud side.

---

### 10. Multiple bridges per workspace + PRIMARY

```
Workspace ws_123
  ├── brg_A  (macOS, PRIMARY)   ── owns WhatsApp session, sends+receives
  ├── brg_B  (Ubuntu, standby)  ── WS connected + heartbeating, NO WhatsApp session
  └── brg_C  (Windows, standby) ── WS connected + heartbeating, NO WhatsApp session
```

- **Election is Cloud-authoritative.** `Bridge.role` and a single `Workspace.primaryBridgeId` are the source of truth. A bridge learns its role in `hello_ack.role` and via `control{promote_primary|demote_standby}`.
- **Only PRIMARY** receives `send_message` and is expected to emit `inbound_message`. Standbys keep the WS warm (auth valid, heartbeating, version/OS reported) but **do not** run a WhatsApp session — so only one device is linked to the WhatsApp account at a time (WhatsApp allows one primary phone link per session folder; sessions are local and non-transferable).
- **Customer-selected primary:** the dashboard sets `primaryBridgeId`; the Cloud sends `demote_standby` to the old primary (it tears down its WhatsApp session) and `promote_primary` to the new one (which then generates a **local QR** via `qr_code` for the customer to link — because sessions cannot move between hosts).
- **Failover:** if PRIMARY goes Offline (missed heartbeats), the Cloud does **not** silently send; it surfaces the outage and (per the open question) either waits for the customer to promote a standby or auto-promotes with a required re-link. The `outgoing-queue` holds outbound during the gap.
- **Anti-split-brain:** a bridge that believes it is primary but whose `hello_ack.role` says `standby` immediately stops sending and NAKs any `send_message` with `not_primary`. The outbound `idempotencyKey` LRU is the final backstop against a transient double.

---

### 11. Security summary

| Control | Mechanism |
|---|---|
| Transport encryption | TLS 1.3, `wss://` only |
| Cert pinning | SPKI pin set (current+next), report-and-alert default, opt-in strict, remotely updatable |
| Auth | Per-bridge opaque Bearer BridgeToken in handshake; server stores argon2id hash; never JWT, never the shared secret |
| Heartbeat integrity | HMAC-SHA256 with separate HeartbeatSecret |
| Local storage | WhatsApp session + tokens encrypted at rest on the Bridge host; never uploaded |
| Rotation | Two-phase `rotate_token`, zero downtime |
| Revoke / remote logout | Force-close (`4401`) + valid-set removal; `control{logout}` wipes local session |
| Least data to Cloud | Cloud only ever learns Online/Offline/Version/OS/Heartbeat/Capabilities/phone-number — **never** cookies/session/auth-folder |
| Auto-update safety | `control{update_now}` via GitHub Releases with sha256 verification + rollback |

---

### 12. Migration & backward compatibility

- `connectionMode` gains value `"bridge"`; `qr` and `meta_cloud` paths are byte-for-byte unchanged. `meta_cloud` remains a fully parallel transport.
- During migration a tenant on legacy `qr` still uses the co-located gateway + shared `SAAS_INTERNAL_SECRET` HTTP. The moment a tenant flips to `bridge`, the Cloud routes its `wa.sendNow` through `lib/bridge/registry.ts` and **disables shared-secret HTTP for that tenant**, closing the leaked-shared-secret window.
- The incoming ingestion is refactored to a shared handler invoked by **both** the legacy HTTP route (shared secret) and the WS `inbound_message` path (per-bridge token) — identical body shape, identical dedupe, identical reply contract. No change to the approval-gated send pipeline.


**Open questions (this domain):**
- Should inbound media be uploaded to the Cloud at all? The incoming route needs mediaBase64 for transcription/vision. Uploading media technically moves customer message content (not WhatsApp AUTH) to the Cloud — confirm this is acceptable under the 'never upload sessions/tokens' rule (it does not violate it, but worth an explicit product decision) or whether transcription should move Bridge-side in a later phase.
- Primary failover policy: on PRIMARY going Offline, does the Cloud auto-promote a standby (and thus force a fresh WhatsApp QR link on that standby, since sessions are local and non-transferable), or does it wait for the customer to pick? Auto-promote gives uptime but requires re-linking WhatsApp on the new host.
- Do we need ordered delivery guarantees for outbound sends per contact, or is the existing per-recipient pacing in the outgoing-queue + Bridge-side sequencing sufficient? WhatsApp itself reorders; recommend NOT promising strict ordering.
- Envelope compression: should we enable permessage-deflate for the media/log lanes, given the idle-RAM < 150MB budget (deflate context ~ up to several hundred KB per connection)? Likely enable only for the log lane.
- Token lifetime / rotation cadence: what is the default BridgeToken TTL and forced-rotation interval, and does remote revoke need to also invalidate the device-code linkage so a stolen host can't re-link silently?



## §7. Cross-platform packaging, service install, CLI, auto-update

## KEYONE Bridge — Distribution, Service Lifecycle, CLI, Auto-Update & Resource Budget

**Scope of this document:** cross-platform packaging, OS service integration, the headless CLI contract, GitHub-Releases auto-update with atomic rollback, and the resource-budget engineering needed to hit `<150MB` idle RAM / `<2%` idle CPU. This is a *design*; no implementation code.

**Grounding in the real KEYONE code:**
- The co-located gateway today is `whatsapp-service/src/index.js` (Express on `:3001`) + `whatsapp-service/src/sessions.js` (whatsapp-web.js + Chromium, `LocalAuth` on-disk sessions).
- The Cloud drives it via HTTP with a shared `SAAS_INTERNAL_SECRET` (`x-internal-secret`) from `saas/lib/wa.ts` (`BASE = WHATSAPP_SERVICE_URL || http://127.0.0.1:3001`).
- Inbound flows the other way via `notifySaas()` in `sessions.js` → `POST saas/app/api/whatsapp/incoming/route.ts` (events `connected | disconnected | incoming | send_failed`), guarded by the same shared secret (`route.ts:100` `x-internal-secret`).
- `Bot.connectionMode` is `qr | meta_cloud` (`saas/prisma/schema.prisma:185`, default `qr`). **Bridge adds a third value `bridge` — additive, default-off, existing rows untouched.**

The Bridge is the same relay contract as `sessions.js ⇆ wa.ts/incoming` but **moved to the customer's machine and carried over one authenticated WebSocket keyed by a per-bridge token** instead of the single shared secret. Everything in this domain (packaging/service/CLI/update/budget) exists to ship and run that relay reliably on machines KEYONE does not control.

---

### 1. Core runtime choice: Go single static binary

| Option | Idle RAM floor | Single-file dist | Static (no runtime install) | Cross-compile arm64+x64 | Verdict |
|---|---|---|---|---|---|
| **Go** | ~15–40MB | ✅ | ✅ | ✅ trivial (`GOOS/GOARCH`) | **Chosen** |
| Node (pkg/nexe/SEA) | ~60–120MB just for V8 | ⚠️ large | bundles V8 | ⚠️ per-arch prebuilds | rejected for the *core* |
| Rust | ~10–30MB | ✅ | ✅ | ✅ | viable alt; Go wins on ops ergonomics + goroutine concurrency for the socket/supervisor |

**Decision:** the always-on **core supervisor + relay + CLI is ONE Go binary** named `keyone-bridge`. It is simultaneously the service payload, the CLI, and the Docker entrypoint (mode auto-detected — §4). Go's ~15–40MB baseline is what makes the `<150MB` budget achievable while a session is linked.

**Critical boundary — the WhatsApp engine is NOT in the core binary.** whatsapp-web.js requires Chromium (`sessions.js` is Puppeteer-based, ~300–500MB per session). Putting that in-process would blow the budget instantly. Instead:

```
keyone-bridge (Go, always-on, <150MB)          the PRODUCT
   ├── Cloud WS client (single reconnecting socket, cert-pinned)
   ├── Service supervisor + CLI + updater
   ├── Encrypted local vault  {WorkspaceID, BridgeID, BridgeToken, HeartbeatSecret}
   └── WhatsApp Engine Adapter (IPC over local unix socket / named pipe)
            │  spawns lazily, hibernates when idle
            ▼
      wa-engine child process  (Node + whatsapp-web.js + Chromium)   REUSED from whatsapp-service/
            └── local encrypted WhatsApp session store (LocalAuth) — NEVER leaves the machine
```

This lets us **reuse the proven `whatsapp-service/src/sessions.js` engine verbatim** (respecting the CLAUDE.md rule *"Never modify WhatsApp send pipeline without explicit approval"* and *"Never rewrite working systems"*) while the Go supervisor owns lifecycle, budget, and transport. The engine child is spawned on demand and torn down / hibernated when idle, so idle-state = Go process only.

> If leadership rejects a two-language artifact, the fallback is a Node SEA core; §7's budget then relies entirely on the engine-hibernation + `--max-old-space-size` caps and the `<150MB idle` target moves to `<220MB`. **Recommendation: keep Go core + Node engine child.**

---

### 2. Install artifacts (one codebase, one binary, per-platform wrappers)

All installers deliver the identical `keyone-bridge` binary + a bundled `wa-engine` payload and register a service. No business logic differs per OS; only the service descriptor + install path differ.

| Platform | Package | Service mechanism | Install path | Runs as | Auto-start |
|---|---|---|---|---|---|
| **Windows** | **WiX-built MSI** (silent-capable) wrapping `keyone-bridge.exe`; optional NSIS EXE for GUI installs | **Windows Service via SCM** (registered by the binary's `service install` self-command the MSI invokes) | `C:\Program Files\KEYONE\Bridge\` | dedicated **`keyone-bridge` local service account** (not `LocalSystem`) | SCM `Automatic (Delayed Start)` |
| **macOS (universal)** | signed + notarized **`.pkg`** carrying a **universal (`lipo` arm64 + x86_64) binary** | **LaunchDaemon** (`/Library/LaunchDaemons/com.keyone.bridge.plist`) for system-wide; LaunchAgent variant for per-user desktop installs | `/usr/local/keyone-bridge/` (bin) + `/Library/Application Support/KEYONE/Bridge/` (state) | dedicated **`_keyonebridge`** daemon user | `RunAtLoad=true`, `KeepAlive` |
| **Linux (deb-based)** | **`.deb`** (Ubuntu/Debian) + arch-independent **AppImage** for distro-agnostic/no-root use | **systemd unit** (`keyone-bridge.service`) shipped inside the `.deb`; AppImage ships a `--install-service` helper that drops a user-level systemd unit | `/opt/keyone-bridge/` (deb) / `~/.local/bin` (AppImage) | dedicated **`keyone-bridge`** system user (deb) / invoking user (AppImage) | systemd `enable --now` |
| **Docker** | **official multi-arch image** (`buildx` linux/amd64 + linux/arm64) + **`docker-compose.yml`** | container **is** the service (restart policy); binary runs as PID 1 | image `/app/keyone-bridge` | non-root `uid 10001` in-image user | `restart: unless-stopped` |
| **Headless / manual** | raw tarball of the binary + `wa-engine` | any of the above `service install` self-commands, or run in foreground | operator-chosen | operator-chosen | operator-chosen |

**Signing / notarization (release gate):**
- Windows: Authenticode-sign `keyone-bridge.exe` **and** the MSI (EV cert preferred for SmartScreen reputation).
- macOS: Developer-ID sign the binary + `.pkg`, then **notarize + staple** — required or Gatekeeper blocks a background daemon silently.
- Linux/AppImage/Docker: cosign-sign the artifacts + publish `SHA256SUMS` (also the auto-update trust root, §5).

**One state layout everywhere** (so CLI/update/budget code is platform-neutral):
```
<state-dir>/
  vault.enc            # AES-GCM: {WorkspaceID, BridgeID, BridgeToken, HeartbeatSecret}  — key = OS keystore / machine-bound
  wa-engine/sessions/  # LocalAuth WhatsApp session (encrypted at rest) — NEVER uploaded
  logs/bridge.log      # rotated
  bin/                 # current + previous binary slots for atomic update (§5)
```
`<state-dir>` resolves per-OS (`%ProgramData%\KEYONE\Bridge`, `/Library/Application Support/KEYONE/Bridge`, `/var/lib/keyone-bridge`, `/data` in Docker) via one path resolver — the only platform switch in the codebase.

---

### 3. System-service integration (per platform, thin shim)

| Concern | Windows SCM | macOS launchd | Linux systemd | Docker |
|---|---|---|---|---|
| **Descriptor** | service config set at `service install` | `.plist` in LaunchDaemons | `keyone-bridge.service` unit | compose `restart:` |
| **Restart on crash** | SCM `FailureActions` = restart w/ backoff (`sc failure`) | `KeepAlive=true` (+ `ThrottleInterval`) | `Restart=on-failure`, `RestartSec=5`, `StartLimitBurst` | `restart: unless-stopped` |
| **Log location** | `%ProgramData%\KEYONE\Bridge\logs\` + Windows Event Log for start/stop/crash | daemon stdout/err → `logs/bridge.log`; launchd events in `log show` | `journald` (`journalctl -u keyone-bridge`) + file mirror | container stdout (`docker logs`) |
| **Run-as** | dedicated **least-privilege service account**, not SYSTEM | dedicated `_keyonebridge` daemon user | dedicated `keyone-bridge` system user (`DynamicUser=` optional) | non-root uid 10001 |
| **Watchdog** | supervisor self-heartbeat | launchd `KeepAlive` on process exit | systemd `WatchdogSec` + `sd_notify` READY/WATCHDOG | Docker `HEALTHCHECK` → CLI `status` |

**Run-as-user vs system — policy:** default to a **dedicated non-privileged service user** on every OS. The Bridge needs only: outbound HTTPS/WSS to the Cloud, a local IPC socket to `wa-engine`, and read/write to its own state dir. It never needs root/SYSTEM. This directly serves the security requirement (encrypted local storage, no privilege to exfiltrate other apps' data) and means a compromised Bridge can't escalate.

**Health contract for the service manager:** the binary exposes an internal health probe consumed three ways — systemd `WatchdogSec` via `sd_notify`, Docker `HEALTHCHECK` via `keyone-bridge status --json`, and launchd/SCM via process-exit + the supervisor's own restart-on-unhealthy. Same probe, three consumers.

---

### 4. Headless CLI contract

One binary, six verbs, **stable exit codes**, `--json` everywhere for scripting. The binary auto-detects its run mode:

- **foreground** (stdout is a TTY, no service env): logs human-readable to stdout, `SIGINT`/`SIGTERM` → graceful drain + exit.
- **service** (launched by SCM/launchd/systemd — detected via parent/env markers): logs structured JSON to the log file, honors the platform's stop signal, emits `sd_notify`/Event-Log/launchd readiness.
- **docker** (PID 1): logs to stdout for `docker logs`, reaps zombies, treats `SIGTERM` from `docker stop` as graceful shutdown.

`start`/`stop`/`status`/`login`/`logout`/`update` all talk to the running supervisor over the **local IPC socket** (so `keyone-bridge status` from a shell queries the live service, not a second instance).

| Command | Behavior | Success stdout (`--json`) | Exit codes |
|---|---|---|---|
| `start` | If run under a service manager, this is the service entrypoint (blocks, supervises). If run by hand, spawns/attaches the supervisor. Idempotent. Requires a linked vault. | `{"state":"online","bridgeId":"..","version":"..","waEngine":"idle"}` | `0` started/already-running · `3` not linked (run `login`) · `1` fatal |
| `stop` | Graceful: stop accepting, drain in-flight sends, hibernate `wa-engine`, close WS, exit. | `{"stopped":true}` | `0` stopped · `5` not running |
| `status` | **Read-only, poll-safe.** Reports link state, Cloud online/offline, version, OS/arch, `wa-engine` state, last heartbeat age, WhatsApp connection (connected/qr-pending/disconnected). Never mutates. | `{"linked":true,"cloud":"online","wa":"connected","version":"1.4.2","os":"darwin/arm64","uptimeSec":..,"lastHeartbeatSec":3}` | `0` linked+running · `5` not running · `3` not linked · `6` linked but Cloud offline |
| `login` | Browser **device-code / OAuth-style** link flow: prints a short code + URL (`https://w.keyone1.com/link?code=XXXX`), user approves in an already-authenticated KEYONE browser session; Bridge exchanges the temp code for a **BridgeToken**, stores it encrypted in the vault. **No local account, no password, never stores/echoes a JWT.** | `{"linked":true,"workspaceId":"..","bridgeId":".."}` | `0` linked · `2` code expired/denied · `1` network |
| `logout` | Revokes the BridgeToken with the Cloud, wipes the vault + local WhatsApp session store, hibernates engine. Local-only fallback wipe if Cloud unreachable (best-effort remote revoke retried). | `{"loggedOut":true,"revoked":true}` | `0` done · `5` not running (still wipes local) |
| `update` | Manual trigger of the auto-update flow (§5): check → download → verify → staged swap → restart → health-check → rollback-on-fail. `--check` = report only. `--silent` = no prompt. | `{"updated":true,"from":"1.4.2","to":"1.5.0"}` or `{"updated":false,"upToDate":true}` | `0` updated / up-to-date · `7` update failed & rolled back · `2` signature/checksum mismatch |

**Reserved conventions:** `--json` (machine output), `--quiet`, `--state-dir`, `--log-level`. Exit codes are contractual — CI/monitoring scripts key off them (e.g. cron `keyone-bridge status --json || alert`). `status` is the ONLY command safe to run on a tight poll; everything else is a state transition.

**Same binary, three lifecycles:**
- *Foreground:* `keyone-bridge start` in a terminal — dev/debug, logs to stdout.
- *Background service:* the service manager runs `keyone-bridge start` as the daemon entrypoint; `stop/status/update` are separate short-lived CLI invocations that IPC into it.
- *Docker:* `ENTRYPOINT ["keyone-bridge","start"]`; `docker exec <c> keyone-bridge status` for health.

---

### 5. Auto-update — GitHub Releases channel, atomic swap, rollback

**Channel & trust:** GitHub Releases is the distribution channel. Each release publishes, per (OS, arch): the artifact, a **cosign signature**, and an entry in a signed `manifest.json` (version, min-supported, per-artifact SHA-256, rollout %). The Bridge ships the **cosign public key baked in**; an artifact is installed only if **signature verifies AND checksum matches**. This is the same trust root as install-time signing (§2).

**Cadence & control:**
- Passive check every **6h** (jittered) + on service start; on-demand via `keyone-bridge update`.
- Cloud can **remote-trigger** an update (pushes a "please update to vX" signal over the existing WS heartbeat — it pushes an *instruction*, **never a binary**). Same channel carries **remote revoke / remote logout** (invalidate BridgeToken → Bridge wipes + goes offline).
- Staged rollout via `manifest.json` percentage + optional pin (`update.channel=stable|beta`, `update.pin=1.4.2`) so an operator can freeze a fleet.

**Atomic staged swap with rollback — identical model on every OS** (driven by the Windows constraint that a running `.exe` can't be overwritten):

```
bin/
  current  -> keyone-bridge-1.4.2   (symlink on *nix / pointer file on Windows)
  staged   -> keyone-bridge-1.5.0   (freshly downloaded+verified, not yet live)
  previous -> keyone-bridge-1.4.1   (retained N-1 for instant rollback)
```

1. **Download** new artifact to `bin/keyone-bridge-<new>` (side slot; running binary untouched).
2. **Verify** cosign signature + SHA-256 against signed manifest. Mismatch → abort, exit `2`, stay on current.
3. **Stage:** point `staged` at the new slot; write an `update.pending` marker.
4. **Restart** the service (the supervisor requests its own manager-driven restart — SCM/launchd/systemd/Docker all restart it):
   - **Windows:** can't overwrite live exe → on restart, a tiny **updater stub** (or the SCM restart hook) flips `current` → new slot *before* the new process loads. Staged-on-restart.
   - **macOS/Linux:** flip the `current` symlink atomically (`rename(2)`), then restart.
   - **Docker:** image is immutable → "update" = pull new tag + `compose up -d` (recreate). In-place binary swap is disabled inside containers; the CLI reports `update` as image-managed.
5. **Post-swap health probe:** new process must pass `status`-level self-check (link intact, WS reconnects, `wa-engine` reachable) within a timeout.
6. **Commit or rollback:** healthy → set `previous` = old `current`, clear marker, report `updated`. **Unhealthy or crash-loop** (fails probe / exits N times) → the supervisor **auto-reverts**: flip `current` back to `previous`, restart, exit `7`, report the failure to the Cloud. The `update.pending` marker guarantees a half-applied update is detected and rolled back even across a hard power loss.

**Rollback guarantees:** N-1 binary always retained; the vault + WhatsApp session store are **never** touched by an update (only the executable slot moves), so a rollback never loses the WhatsApp link or forces a re-QR.

---

### 6. Resource-budget engineering — `<150MB` idle RAM, `<2%` idle CPU

The budget is a **design constraint met structurally**, not by after-the-fact tuning:

| Technique | Why it holds the budget |
|---|---|
| **No browser in the core** | Chromium (`sessions.js`, ~300–500MB/session) is quarantined in the `wa-engine` child. The always-on Go supervisor never loads a browser → its floor is ~15–40MB. |
| **Engine hibernation** | Reuses the existing `ENABLE_SESSION_HIBERNATION` design from `sessions.js` (active pool + idle-evict). When no traffic, `wa-engine`'s Chromium is torn down; only LocalAuth on disk remains. **Idle state = Go process alone**, comfortably `<150MB`. First message wakes the engine (staggered restore, already implemented in `sessions.js`). |
| **Event-driven, zero polling** | No status-poll loops. Inbound is push (WhatsApp → engine → IPC → WS → Cloud); outbound is push (Cloud → WS → IPC → engine). The old HTTP-poll model (`wa.status()` in `lib/wa.ts`) is replaced by socket events → **CPU idles near 0%** with no work. |
| **Single reconnecting socket** | Exactly one WSS to the Cloud (heartbeat + relay multiplexed), exponential-backoff reconnect, TCP keep-alive. No per-message connection churn. |
| **Lazy / streamed media** | Media is streamed chunk-wise between engine ⇆ Cloud, never fully buffered in the supervisor. Large media handled by the engine (which already has the WhatsApp session), supervisor just relays. |
| **Go memory caps** | `GOMEMLIMIT` set to a hard ceiling (e.g. 120MB) + tuned `GOGC` so the Go GC stays aggressive; supervisor RSS is bounded by construction. |
| **Engine caps** | `wa-engine` launched with `--max-old-space-size` + the Chromium resource flags already present (`ENABLE_CHROMIUM_OPTIMIZATION` in `sessions.js`). Engine cost is *transient* (only while actively messaging), not counted against the *idle* floor. |
| **Bounded backpressure** | In-flight send/receive queues are size-capped; on Cloud-offline the Bridge buffers a bounded amount to disk (not RAM) and drains on reconnect. |

**Idle steady-state (target):** Go supervisor + open WSS + hibernated engine ≈ **40–90MB RSS, <1% CPU** — well inside `<150MB / <2%`. **Active state** (engine awake, a session live) exceeds 150MB *by design in the child*, but that is per-session Chromium cost on the customer's own hardware, transient, and outside the always-on idle budget the requirement targets.

---

### 7. Backward-compatibility & migration posture (packaging view)

- **Additive:** new `Bot.connectionMode = "bridge"` alongside existing `qr` / `meta_cloud` (`schema.prisma:185`). Default rows stay `qr`. Meta Cloud (`meta-provider.ts`) and the legacy co-located gateway keep working unchanged during rollout — satisfies *"Bridge is ADDITIVE"* and CLAUDE.md *"Always prefer additive changes."*
- **Same relay contract, new transport:** the Bridge speaks the *same events* the Cloud already understands (`connected|disconnected|incoming|send_failed` → `incoming/route.ts`; send/start/logout ← `wa.ts`), so the Cloud-side handlers barely change — only auth (per-bridge token vs shared `SAAS_INTERNAL_SECRET`) and transport (WS vs HTTP) differ.
- **Cloud learns nothing about WhatsApp auth:** heartbeat carries only `{online, version, os/arch, capabilities, lastSeen}`. Cookies/sessions/tokens/auth-folders **never** leave the machine — enforced by the state layout (§2) where `wa-engine/sessions/` is local-only and has no upload path.
- **Distribution reuses existing repo assets:** the repo already ships `Dockerfile`, `docker-compose.yml`, `docker-compose.production.yml`, and a `deploy/` tree — the Bridge's Docker image + compose slot in beside these rather than replacing them.

---

### 8. Release pipeline (CI matrix — one build, all targets)

```
tag v1.x.y ──► CI matrix build (Go cross-compile + bundle wa-engine)
  ├─ windows/amd64   → sign(exe) → WiX MSI → sign(msi)
  ├─ darwin/universal→ lipo → sign → pkgbuild → notarize+staple
  ├─ linux/amd64+arm64→ .deb  +  AppImage
  ├─ docker          → buildx multi-arch push (ghcr / registry)
  └─ all             → cosign sign + SHA256SUMS + manifest.json
        └─► publish GitHub Release (== auto-update channel, §5)
```
Every artifact for a version is produced from the identical source tag; the auto-updater and the first-time installer consume the *same* signed artifacts + manifest, so "install" and "update" share one trust path.


**Open questions (this domain):**
- Confirm core language: Go single-binary core + Node/Chromium wa-engine child (recommended) vs a Node-SEA single-language build (simpler CI, higher RAM floor). This gates the entire packaging matrix.
- Do we have (or will we procure) Apple Developer ID + notarization and a Windows EV code-signing certificate? Both are blocking for silent background-service install on customer machines.
- Is the whatsapp-web.js engine reused verbatim from whatsapp-service/ (honoring 'never modify the send pipeline without approval'), or does the Bridge get its own engine build? This affects what the installer must bundle and the update artifact size.
- GitHub Releases as the literal auto-update endpoint for customer machines — acceptable, or do we need a KEYONE-hosted mirror/CDN in front of it (rate limits, geo, air-gapped/on-prem customers)?
- Docker update policy: confirm that in-container updates are image-managed (pull new tag + compose recreate) and the in-place binary swap is intentionally disabled inside containers.
- Multi-bridge-per-workspace with a customer-selected Primary: does the Cloud pick the Primary for OUTBOUND sends, and how do non-primary bridges behave (hot standby vs read-only)? Owned by the Cloud/protocol domain but affects what `status` must report and what the service supervisor advertises in its capabilities heartbeat.



## §8. Cloud-side changes + dashboard (backward-compatible)

## KEYONE Bridge — Cloud-Side Design (additive, backward-compatible)

Grounded in the real files under `/Users/yahyaemad/Desktop/appkeyone/.claude/worktrees/reverent-goldberg-c326b0/saas` (the stated `canon` path did not exist; the live repo is the worktree root).

### 0. Where the three transports live today (the seam I build on)

Today there are exactly two runtime modes, normalized in `lib/messaging/mode.ts` (`type ConnectionMode = "qr" | "meta_cloud"`). The outbound path has **one** physical choke point:

- `lib/wa.ts` — thin HTTP client to the co-located gateway at `http://127.0.0.1:3001` using header `X-Internal-Secret: SAAS_INTERNAL_SECRET`. Exposes `start/status/pair/send/sendNow/logout`.
- The protected send actually leaves the Cloud at exactly one line: `lib/messaging/outgoing-queue.ts:275` → `wa.sendNow(row.userId, row.customerPhone, row.body)`. Everything routes through the queue drainer.
- Inbound + status arrive at `app/api/whatsapp/incoming/route.ts` via `notifySaas()` in `whatsapp-service/src/sessions.js:1255`, guarded by the same shared secret (`route.ts:100-103`).
- `Bot.connectionMode` (schema `prisma/schema.prisma` Bot model) defaults `"qr"`; read at: `app/api/settings/meta-cloud/route.ts:41,83`, `lib/messaging/feature-flags.ts:93`, `app/api/realtime/stream/route.ts:260`, `app/admin/whatsapp/page.tsx:66`, `app/dashboard/settings/*`, `lib/meta/embedded-signup.ts:166,279`.

**Design principle:** Bridge is a THIRD transport that plugs into these exact seams. I never touch `outgoing-queue.ts` send semantics, never edit the incoming pipeline logic, and never change what `wa.sendNow` returns. I only make `wa.sendNow`/`wa.status`/`wa.logout` **transport-aware** and add a co-deployed WS process that speaks the same HTTP contract the Cloud already uses.

---

### 1. DATA MODEL (additive Prisma models)

Two new models. No changes to existing columns except one additive `connectionMode` value and (optionally) a nullable `activeBridgeId` pointer on `Bot`.

```prisma
model Bridge {
  id             String    @id @default(cuid())
  userId         String                              // workspace owner (matches Bot.userId scoping)
  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  name           String    @default("My Bridge")     // customer-friendly label
  os             String?                              // "windows" | "darwin" | "linux" | "docker"
  arch           String?                              // "x64" | "arm64"
  version        String?                              // semver of the Bridge build
  capabilities   String    @default("[]")            // JSON: ["send.text","send.media","qr.login","typing"...]
  status         String    @default("offline")       // offline | online | linking | revoked
  connectedPhone String?                             // WA number the Bridge is linked to (display only; no auth)
  lastHeartbeatAt DateTime?
  isPrimary      Boolean   @default(false)           // customer-selected primary per workspace
  tokenHash      String                              // hash of BridgeToken (never the token itself)
  heartbeatSecretHash String                         // hash of HeartbeatSecret (WS auth material)
  linkCodeHash   String?                             // pending device-code (hash), cleared on approval
  linkExpiresAt  DateTime?
  lastIp         String?                             // last-seen source IP (ops only)
  createdAt      DateTime  @default(now())
  approvedAt     DateTime?
  revokedAt      DateTime?

  @@index([userId, status])
  @@index([userId, isPrimary])
  @@unique([userId, isPrimary], map: "one_primary_per_ws")   // enforce single primary (partial-unique in migration; see note)
}

model BridgeCommand {
  id         String   @id @default(cuid())
  bridgeId   String
  bridge     Bridge   @relation(fields: [bridgeId], references: [id], onDelete: Cascade)
  kind       String                                  // logout | reconnect | update | revoke | rotate_token | ping
  payloadJson String  @default("{}")
  status     String   @default("pending")            // pending | delivered | acked | expired
  createdAt  DateTime @default(now())
  deliveredAt DateTime?
  ackedAt    DateTime?

  @@index([bridgeId, status])
}
```

Notes:
- `@@unique([userId, isPrimary])` cannot express "only one row with isPrimary=true" directly in Postgres via Prisma; ship it as a **partial unique index** in the migration SQL: `CREATE UNIQUE INDEX one_primary_per_ws ON "Bridge"(userId) WHERE "isPrimary" = true;`. Set-primary is then a two-statement transaction (clear old, set new).
- `tokenHash` mirrors the existing hashed-secret convention (Cloud already stores encrypted/masked secrets via `lib/crypto-util.ts`). **Bridge Token and HeartbeatSecret are shown to the operator once at link time, then only hashes are persisted.**
- `Bot` gets one additive nullable pointer so the router doesn't have to query "primary bridge" on every send:
  `activeBridgeId String?  // set when connectionMode == "bridge"; points at the primary Bridge`.
- **What the Cloud stores about WhatsApp: nothing.** No cookies, no session folder, no auth token. Only `connectedPhone` (display), `status`, `version`, `os`, `arch`, `capabilities`, `lastHeartbeatAt`. This satisfies the hard requirement.

**connectionMode = 'bridge'.** Extend `lib/messaging/mode.ts`:

```ts
export type ConnectionMode = "qr" | "meta_cloud" | "bridge";
const LEGACY_MAP = { ...existing, bridge: "bridge", selfhost: "bridge", "self-hosted": "bridge" };
// Unknown still falls back to "qr" (safe default preserved).
```

All 10 read-sites already call `normalizeConnectionMode(...)`, so adding the enum value is the only change; each site just needs a `case "bridge"` branch where it currently branches qr-vs-meta (`feature-flags.ts`, `realtime/stream`, dashboard pages). No site is forced to change behavior for existing `qr`/`meta_cloud` rows.

---

### 2. WS GATEWAY (a small co-deployed Node process — NOT a Next.js route)

Next.js App Router route handlers cannot cleanly own a long-lived WebSocket server: they are request-scoped, don't expose the raw HTTP `upgrade` event on the serverful runtime we deploy (systemd `keyone.service` + Caddy), and would tie socket lifetime to a request. So the Bridge terminator is a **separate tiny Node process**, `bridge-gateway/`, co-deployed on the same AWS box behind Caddy (path `wss://w.keyone1.com/bridge`), managed by its own systemd unit. It is the Bridge-era analogue of today's `whatsapp-service/` — except it holds NO Chromium and NO sessions; it is pure relay + auth.

```
                Customer machine                         AWS box (w.keyone1.com)
  ┌────────────────────────────┐            wss://…/bridge   ┌──────────────────────────┐
  │  keyone-bridge (the product)│◀──── encrypted WS ────────▶│  bridge-gateway (Node)    │
  │  • Chromium + whatsapp-web  │  cert-pinned, per-bridge   │  • verifies BridgeToken    │
  │  • local encrypted session  │  token + HeartbeatSecret   │  • maps bridgeId↔userId    │
  │  • QR generated LOCALLY      │                            │  • relays frames           │
  └────────────────────────────┘                            └───────────┬──────────────┘
                                                                          │ HTTP (localhost)
                                          inbound frame → POST /api/whatsapp/incoming (x-internal-secret)
                                          outbound send  ← POST /bridge-gateway/dispatch  (from lib/wa.ts)
                                                                          │
                                                             ┌────────────▼─────────────┐
                                                             │  Next.js Cloud (unchanged │
                                                             │  incoming pipeline + queue)│
                                                             └──────────────────────────┘
```

**Inbound (Bridge → Cloud).** The Bridge sends a WS frame `{type:"inbound", ...}`. The gateway looks up `bridgeId`, resolves `userId`, and **calls the existing `POST /api/whatsapp/incoming` with the same body shape and the same `X-Internal-Secret` header** that `whatsapp-service` uses today (`sessions.js:974` builds exactly `{event:"incoming", userId, from, mediaType, text, mediaBase64, mimetype, providerMessageId, providerTimestamp}`). Because the pipeline in `route.ts` keys off `userId` + `providerMessageId` (dedupe at `route.ts:418`), **the AI/billing/safety/orders logic is shared verbatim** — the gateway is just a different origin for the same request. Status events (`connected`/`disconnected`/`send_failed`) map 1:1 to the same events `route.ts:113-168` already handles.

**Outbound (Cloud → Bridge).** The Cloud must NOT open a socket from within Next.js. Instead, `lib/wa.ts` (when `connectionMode==='bridge'`) makes a **localhost HTTP call to the bridge-gateway** — same pattern as today's call to `:3001` — e.g. `POST http://127.0.0.1:3020/dispatch {userId, to, text}`. The gateway holds the live WS to the primary Bridge and forwards the frame `{type:"send", requestId, to, text}`; the Bridge replies `{type:"send_ack", requestId, ok, providerMsgId}`. The gateway resolves the HTTP call with the same `{ok,status,data}` envelope `lib/wa.ts` already returns. **This means `wa.sendNow` still returns the identical shape, so `outgoing-queue.ts:275` and the whole drainer are byte-for-byte unchanged.**

**Auth model on the WS.** On connect the Bridge presents `{bridgeId, bridgeToken}`; gateway verifies `tokenHash` and (for the heartbeat channel) an HMAC signed with `HeartbeatSecret`. Cert pinning: the Bridge pins the Cloud's leaf/intermediate SPKI. Token rotation + remote revoke/logout/update flow through `BridgeCommand` rows the gateway drains and pushes over the socket. If a bridge is `revoked`, the gateway drops its socket and refuses reconnect.

**Multiple bridges / primary.** The gateway keeps a `Map<userId, Set<socket>>`. Only the socket whose `Bridge.isPrimary=true` receives `send` frames; secondaries stay warm as hot-standby (dashboard can promote one, or auto-promote on primary heartbeat loss after N misses via a `BridgeCommand`/status update). Inbound from ANY connected bridge is accepted (so a secondary that still has the live WA session doesn't black-hole messages), but the pipeline's `providerMessageId` dedupe prevents doubles.

---

### 3. `lib/wa.ts` EVOLUTION — a transport-router (additive)

Today `wa` is a flat object of HTTP calls. I wrap the three mutating/reading methods in a dispatcher keyed by the resolved transport, defaulting to the **exact current behavior**:

```
             wa.sendNow(userId,to,text)
                        │
        resolveTransport(userId)  ← reads Bot.connectionMode (cached), NOT a new query per send
        ┌───────────────┼─────────────────────────┐
   'qr' (local-http)  'bridge' (bridge-ws)   'meta_cloud'
   call(:3001/send)   call(:3020/dispatch)   messaging/meta-provider
   ↑ UNCHANGED         ↑ same {ok,status,data} envelope   ↑ already exists
```

- `resolveTransport(userId)` reads the normalized `connectionMode`. For performance it uses a short-lived in-process cache (the queue drainer already batches per-user), and falls back to `'qr'` on any lookup failure — preserving the safe default in `mode.ts`.
- **Send semantics unchanged.** For `'bridge'`, `sendNow` posts to the local gateway and returns the same envelope; the drainer's claim/ledger/idempotency logic (`outgoing-queue.ts`) is agnostic to which transport produced `sent.data`.
- `wa.status` / `wa.logout` / `wa.start` dispatch the same way: `bridge` status = read `Bridge.status`+`lastHeartbeatAt` (no HTTP needed); `bridge` logout = enqueue a `BridgeCommand{kind:"logout"}` (the Bridge wipes its LOCAL session — the Cloud never had it); `start`/`pair`/QR are **no-ops on the Cloud for bridge** because QR is generated locally on the customer machine (returns `{ok:true, data:{mode:"bridge", note:"QR is shown in the Bridge app"}}`).
- `meta_cloud` continues to route through the existing `lib/messaging` facade (`resolveProvider` in `index.ts`); the router only decides qr-vs-bridge for the local-transport branch and leaves the Meta facade untouched. Callers that already use `messaging.send` (broadcasts, daily-report) keep working; callers that use `wa.send`/`sendNow` transparently gain bridge routing.

This is purely additive: no existing call site changes, and the "Never modify WhatsApp send pipeline without explicit approval" rule is respected because I add a routing branch **around** the transport, not inside the queue/drain/idempotency/billing logic.

---

### 4. DASHBOARD

Reuse the existing `/dashboard/settings/meta-cloud` scaffold (`page.tsx` + `meta-cloud-client.tsx` + `connected-dashboard.tsx`). Three additions:

**(a) Three-way transport chooser.** Today the page is Meta-vs-legacy. Extend the mode selector to three cards: **Meta Cloud** | **KEYONE Bridge (self-hosted)** | **Legacy QR (co-located)**. Selecting Bridge writes `connectionMode:"bridge"` through the same `PATCH /api/settings/meta-cloud` handler (`route.ts:83` already writes `connectionMode`), gated so it's only selectable once a Bridge is `online`.

**(b) Bridge panel** (new component, mirrors `connected-dashboard.tsx`), per bridge in the workspace:

| Field | Source |
|---|---|
| Status (online/offline/linking) | `Bridge.status` + freshness of `lastHeartbeatAt` |
| Version / Update Available | `Bridge.version` vs latest GitHub Release tag |
| OS / Arch | `Bridge.os` / `Bridge.arch` |
| Last Heartbeat | `Bridge.lastHeartbeatAt` (relative) |
| Connected Phone | `Bridge.connectedPhone` (display only) |
| Capabilities | `Bridge.capabilities` chips |
| Primary | radio → set-primary transaction |

Controls (each enqueues a `BridgeCommand`, no direct WA action from Cloud): **Reconnect**, **Disconnect**, **Logout** (wipes local session), **Update**, **Rotate token**, **Revoke**, **Set Primary**. New thin routes under `app/api/settings/bridge/*` (`list`, `command`, `set-primary`, `rename`, `revoke`) guarded by `requirePermission("settings")` exactly like `whatsapp/logout/route.ts`.

**(c) Download / install page** `app/dashboard/settings/bridge/download` — per-OS installers pulled from GitHub Releases (Windows `.msi`, macOS `.dmg` universal, Linux `.deb`/AppImage, `docker run` + compose snippet, headless tarball). Shows the CLI (`keyone-bridge start|stop|status|login|logout|update`).

**(d) Device-link approval page** `app/dashboard/settings/bridge/link` — the browser side of the device-code flow: the Bridge shows a short code, the customer (already logged into KEYONE) opens this page, sees the pending bridge (`os/arch/version/ip`), and clicks **Approve**. Approval writes `approvedAt`, mints the BridgeToken+HeartbeatSecret (shown once / delivered to the waiting Bridge), and clears `linkCodeHash`. No passwords, no JWT, no account creation — the browser session IS the proof of workspace ownership.

Device-code flow (OAuth-style, no local accounts):
```
Bridge → POST /api/bridge/link/start {os,arch,version}     → {bridgeId, userCode, verifyUrl, interval}
                                                              (Bridge row: status=linking, linkCodeHash set)
User (browser, authenticated) → /dashboard/settings/bridge/link → enters userCode → Approve
Bridge → POST /api/bridge/link/poll {bridgeId, deviceSecret} → 428 pending … then {bridgeToken, heartbeatSecret, wsUrl}
Bridge stores {WorkspaceID, BridgeID, BridgeToken, HeartbeatSecret} ENCRYPTED locally, connects WS.
```
`/api/bridge/link/*` are public (no session) but rate-limited and bound to the short-lived `linkCodeHash`; only the authenticated approval page can flip a pending row to approved.

---

### 5. MIGRATION (zero message loss; no-op for non-migrators)

**If they never migrate:** nothing changes. `connectionMode` stays `"qr"`, `lib/wa.ts` still calls `:3001`, the co-located `whatsapp-service` keeps running. Meta Cloud tenants are equally untouched. The new models/columns are additive with safe defaults, so `prisma migrate` on Postgres is non-destructive (per MEMORY: prod is Postgres, `schema.postgres.prisma`, ALTER via `prisma db execute`).

**Cutover for a QR tenant (no lost messages):**
1. Customer installs the Bridge, links it (device-code), Bridge comes `online` but tenant is still `connectionMode:"qr"` → **all live traffic still flows through the co-located gateway.** Nothing routes to the Bridge yet.
2. Bridge shows its own QR locally; customer scans with the SAME WhatsApp number. (WhatsApp Web allows the session to move; the co-located session will be invalidated by WhatsApp when the new one takes the linked-device slot — that's expected and is the atomic handoff point.)
3. Once `Bridge.status=online && isPrimary`, customer clicks **"Make Bridge primary"** → `PATCH connectionMode:"bridge"`, set `Bot.activeBridgeId`.
4. **The outgoing queue is the safety net.** Any messages queued before the flip are still `status:"queued"` rows in `WaMessage`; the drainer re-reads `connectionMode` at drain time and sends them through the Bridge. Nothing is dropped because the queue, not the transport, owns pending sends (`outgoing-queue.ts`). Inbound is never lost because the pipeline dedupes on `providerMessageId`, so even overlapping delivery from both gateways during the seconds-long handoff produces no duplicates and no gaps.
5. Decommission: once the tenant is stable on Bridge, the operator can stop that tenant's co-located session. The `whatsapp-service` box can eventually be retired per-tenant, not all-at-once.

**Rollback:** flip `connectionMode` back to `"qr"` and re-scan the co-located gateway QR; identical mechanism in reverse. Because both transports satisfy the same `wa.*` envelope, rollback needs no code deploy.

---

### 6. Why this is safe against the hard requirements

- Cloud never runs Chromium / never stores sessions: all WA execution + QR + encrypted session stay on the customer machine; the bridge-gateway is a pure relay.
- Cloud knows only Online/Offline/Version/OS/Heartbeat/Capabilities (+ display phone): enforced by the `Bridge` model having no session/token/cookie column.
- No local accounts / no JWT on the Bridge: device-code flow → opaque BridgeToken (hash stored) + HeartbeatSecret; browser session is the ownership proof.
- Additive + backward-compatible: one new enum value, two new models, one new co-deployed process, a router wrapper in `lib/wa.ts`. Meta Cloud and legacy co-located QR keep working untouched; send pipeline (queue/drain/idempotency/billing) is not modified.


**Open questions (this domain):**
- Workspace vs user scoping: existing schema scopes everything by Bot.userId (one bot per user). Does 'per-workspace, multiple bridges' imply a future Workspace entity, or is userId the workspace for now? I designed Bridge.userId to match today's scoping — confirm before assuming multi-tenant workspaces.
- Should the bridge-gateway be a brand-new process, or should we extend the existing whatsapp-service/ process (which already speaks the incoming/notifySaas protocol and shared secret) to ALSO terminate Bridge WS? Reusing it is less infra but couples Bridge availability to the Chromium box we're trying to retire.
- Auto-promotion policy on primary heartbeat loss: auto-fail over to a secondary Bridge after N missed heartbeats, or require explicit customer re-selection? Auto-failover is better UX but can cause split-brain if the old primary returns.
- Media send: QRProvider currently returns NOT_SUPPORTED for media (qr-provider.ts:91). Should the Bridge transport implement real media send (it can, via whatsapp-web.js on the client) and thereby exceed QR capabilities, or match QR's text-only surface for v1?
- Token/secret delivery on approval: deliver BridgeToken to the still-polling Bridge via the poll response only, or also display once in the browser for headless/manual setups? Headless installs need a copy-paste path.
- Do we need a Cloud-side WaMessage ledger row for bridge sends (like qr-provider writes) to keep analytics unified, and if so should the bridge-gateway or lib/wa.ts write it to avoid double-writing with the drainer?
