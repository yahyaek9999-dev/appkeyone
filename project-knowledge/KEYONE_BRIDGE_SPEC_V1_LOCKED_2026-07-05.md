# KEYONE Bridge — v1 LOCKED Specification (Transport-Agnostic Connector)

**Date:** 2026-07-05  **Status:** APPROVED to build Phase 1. Supersedes the open runtime/GUI/media questions in `KEYONE_BRIDGE_ARCHITECTURE_2026-07-05.md` (which remains the detailed appendix for auth/WS/packaging/cloud).

> **⚠️ SCOPE UPDATE (2026-07-06): KEYONE Bridge v1 is WhatsApp-ONLY.**
> The transport-agnostic `Provider` interface and architecture are **retained
> internally** for future extensibility, but **Telegram, Messenger, and Instagram
> are REMOVED from the roadmap** and out of scope until a later version. No other
> provider is built or shipped; there is **no multi-transport UI and no transport
> selection**. Everything below that names those transports is illustrative of the
> interface's extensibility only — not a v1 deliverable.

> **⚠️ RUNTIME CORRECTION (2026-07-13): Provider #1 did NOT ship on Go +
> whatsmeow.** Item 6 of the locked decisions below, and the Go `transport.
> Provider` interface in §2-3, describe the originally-approved runtime. In
> practice WhatsApp's pairing servers rejected the whatsmeow/Baileys protocol
> implementation (commit `613a682`) — the shipping engine is **Node.js +
> whatsapp-web.js + Puppeteer/Chromium** (`bridge-node/keyone-wa-bridge.js`),
> confirmed still current as of the `fix(bridge): v1.0.10` line of commits.
> `deploy/publish-downloads.sh` (the Go publisher) is retired and guarded
> against accidental use (`e54bb4d`). This doc's Go-specific architecture
> sections are historical context for the original decision, not a build
> target — don't implement against them.

This document folds in the customer's locked decisions. Read it first; the big doc is the reference.

---

## 0. What changed from the first draft (locked decisions)

1. **Internally transport-agnostic, but v1 ships WhatsApp only.** The core knows *nothing* about WhatsApp or business logic. WhatsApp is **the only provider** behind a generic **Transport Provider interface**. The interface exists so a *future* provider could implement the *same* contract and load as a **plugin** without modifying the core — but no such provider is in scope for v1 (see the SCOPE UPDATE banner above).
2. **Headless-only v1. No desktop app, no GUI, no system tray.** The Dashboard is the only UI. The Bridge exposes a minimal CLI: `login · start · stop · status · logs · update · logout`. Everything is designed so an optional GUI/tray can be added later **without changing the Bridge architecture or APIs**.
3. **QR is generated on the Bridge but rendered in the Dashboard.** The Bridge never renders UI. Flow: Dashboard → *Connect Bridge* → secure channel → user clicks *Start QR* → Bridge asks the provider to generate the QR locally → Bridge **streams the QR to the Cloud** → Dashboard renders it.
4. **Zero business logic in the Bridge.** No CRM / AI / orders / customers / reports / analytics / workflows / settings (except connection). It behaves like **GitHub Actions Runner / Cloudflare Tunnel / Tailscale connector** — a lightweight connector maintaining a secure link.
5. **Media = secure transport only.** The Bridge streams media to the Cloud (resumable upload, checksum integrity, ack, retry, encrypted in transit); it keeps only a **short retry buffer**, never permanent storage. It performs **no** OCR / STT / vision / inference. **Auth artifacts (sessions, cookies, keys, LocalAuth) NEVER leave the Bridge.**
6. **Runtime = Go + whatsmeow** for Provider #1 (per the approved recommendation), inside a transport-agnostic core.

### The 10 non-negotiables (contract for the whole build)
1. Core stays **transport-agnostic** — no WhatsApp-specific logic in the core. 2. **No** CRM/AI/orders/customers/analytics/workflows in the Bridge — transport only. 3. **Dashboard is the primary UI**; the Bridge runs untouched for months after first login. 4. **Versioned protocol from day one** (`protocol v1`) for backward compatibility. 5. **Auto-update** must never break existing Bridges. 6. **Multiple Bridges per workspace** supported from the start (UI may expose one). 7. **Complete integration test suite** (matrix in §7). 8. **No Meta Cloud regression.** 9. **No existing customer workflow changes** unless Bridge mode is explicitly enabled. 10. **Before any production release:** security review + scalability report + memory profile + failure-recovery report.

---

## 1. Layered architecture

```
┌──────────────────────────── KEYONE Bridge (customer host) ────────────────────────────┐
│                                                                                        │
│  CLI (login/start/stop/status/logs/update/logout)   ── thin, talks to the daemon      │
│      │                                                                                 │
│  ┌───────────────────────────── CORE (transport-agnostic) ─────────────────────────┐  │
│  │  • Cloud Link:  secure WebSocket client (protocol v1), auth, heartbeat, resume   │  │
│  │  • Provider Registry:  loads & supervises N providers via the Provider interface │  │
│  │  • Media Pipeline:  resumable up/down, checksum, ack, retry buffer, encrypt      │  │
│  │  • Secret Store:  OS keychain (Keychain/DPAPI/libsecret) + AES-GCM file fallback  │  │
│  │  • Updater:  GitHub Releases, signed, atomic swap + rollback                      │  │
│  │  • Supervisor:  service lifecycle, reconnect/backoff, health                      │  │
│  │  The core knows NOTHING about WhatsApp or business logic.                         │  │
│  └───────────────┬──────────────────────────────────────────────────────────────────┘  │
│                  │  Provider interface (the plugin contract)                            │
│      ┌───────────┴───────────┬───────────────┬───────────────┐                         │
│  ┌───▼────┐  ┌────▼─────┐ ┌──▼───────┐  ┌────▼─────┐   (future providers plug in       │
│  │WhatsApp│  │ Telegram │ │Messenger │  │Instagram │    without touching the core)      │
│  │whatsmeow│ │ (later)  │ │ (later)  │  │ (later)  │                                    │
│  └────────┘  └──────────┘ └──────────┘  └──────────┘                                    │
│   local QR • local encrypted session • send/recv • emits Events                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                         ▲  secure WebSocket (protocol v1, per-Bridge token)
                         ▼
┌──────────────── KEYONE Cloud ────────────────┐
│  bridge-gateway (WS ingress, Node)            │  ← terminates sockets, per-bridge auth
│  → /api/whatsapp/incoming  (unchanged)        │  ← inbound relayed 1:1
│  lib/wa.ts transport-router → primary bridge  │  ← outbound, at wa.sendNow choke point
│  Dashboard: Connect/QR/Status/Logs/Update     │  ← the ONLY user interface
│  CRM · AI · Orders · Analytics · Billing      │  ← all business logic stays here
└───────────────────────────────────────────────┘
```

**Responsibility split (locked):**
- **Bridge:** authentication (to Cloud), transport, QR/link generation, session management, WebSocket, heartbeats, media up/down, encryption, reconnect, updates.
- **Cloud:** CRM, AI, orders, customers, dashboard, automation, analytics, permissions, billing.

---

## 2. Transport Provider interface (the plugin contract) — the centerpiece

Every transport implements this. The core supervises providers only through it. Adding a provider in a *future* version = a new package implementing `Provider` + a registry entry; **no core change**. (v1 ships only the WhatsApp provider.)

```go
// package transport — the ONLY contract the core knows. Providers are plugins.
package transport

import "context"

type ProviderName string // "whatsapp", "telegram", "messenger", "instagram", ...

type Capabilities struct {
    SendText   bool
    SendMedia  bool
    Groups     bool
    Presence   bool
    LinkMethod LinkMethod // QR | PairingCode | OAuth
}

type ConnectionState string // "init" | "linking" | "connecting" | "connected" | "disconnected" | "logged_out"

type Provider interface {
    // identity
    Name() ProviderName
    Version() string
    Capabilities() Capabilities

    // lifecycle — core calls these; provider owns its local encrypted session
    Init(ctx context.Context, cfg ProviderConfig) error
    Start(ctx context.Context) error   // begin/resume connection, emit Events
    Stop(ctx context.Context) error    // graceful pause (keep session)
    Logout(ctx context.Context) error  // wipe local auth/session (never leaves host)

    // linking — provider decides the mechanism; QR/code is streamed as a LinkArtifact Event
    StartLink(ctx context.Context) error

    // messaging
    Send(ctx context.Context, msg OutboundMessage) (Ack, error)

    // event stream (inbound msgs, state changes, link artifacts, receipts, errors)
    Events() <-chan Event

    State() ConnectionState
}

// Events are transport-neutral; the core forwards them to the Cloud verbatim.
type Event struct {
    Type     EventType    // Inbound | StateChange | LinkArtifact | Receipt | Error | Log
    Inbound  *InboundMessage
    State    *ConnectionState
    Link     *LinkArtifact  // e.g. { Kind: "qr", Data: "<qr-string>", ExpiresAt } — streamed to Dashboard
    Receipt  *DeliveryReceipt
    Err      *ProviderError
}

// Registry — providers self-register; core loads only enabled ones.
type Factory func() Provider
func Register(name ProviderName, f Factory) // called from each provider's init()
func Load(name ProviderName, cfg ProviderConfig) (Provider, error)
```

**Design rules:** message shapes (`InboundMessage`, `OutboundMessage`, `LinkArtifact`, media refs) are **transport-neutral**, so the Cloud protocol and media pipeline are identical across providers. WhatsApp maps whatsmeow events → these types; nothing WhatsApp-specific escapes the provider package.

---

## 3. QR flow (corrected — Bridge streams, Dashboard renders)

```
Dashboard: "Connect Bridge"  ─────────────▶ Cloud verifies Bridge Online (heartbeat)
Dashboard: "Start QR" (provider=whatsapp) ─▶ Cloud → WS control{type:start_link, provider:whatsapp} → PRIMARY Bridge
Bridge core → whatsappProvider.StartLink() → whatsmeow generates QR LOCALLY
Provider emits Event{LinkArtifact: qr#1} → core → WS frame{type:link_artifact, kind:qr, data} → Cloud → Dashboard renders QR
(QR rotates every ~20s; each new artifact is streamed the same way)
Customer scans → provider emits StateChange: connected(identity=phone) → streamed → Dashboard shows "Connected: +20…"
```
The Bridge renders **nothing**. Auth/session stays on the host; only the QR *string* and connection *state* transit to the Cloud.

---

## 4. Protocol versioning (locked from day one)

- Every WS frame carries `{"v":1, ...}`. `hello/register` negotiates `protocolVersion` + `capabilities`. The Cloud supports **N and N-1** simultaneously so a new Cloud never breaks old Bridges and vice-versa.
- CLI ↔ daemon IPC and the `/api/bridge/*` REST surface are versioned (`/api/bridge/v1/*`).
- Any breaking change → `v2` added alongside `v1`; deprecation window announced via `capabilities`.

## 5. Data model (Cloud, transport-agnostic, additive)

```prisma
model Bridge {                    // one connector instance on a customer host
  id            String   @id @default(cuid())
  userId        String                        // workspace (existing scoping)
  name          String?                       // "Office PC", "prod-server-1"
  os            String?  arch String?  version String?
  capabilities  String?                       // JSON
  status        String   @default("offline")  // online | offline
  isPrimary     Boolean  @default(false)      // customer-selected primary (multi-bridge)
  lastHeartbeatAt DateTime?
  tokenHash     String                        // hash of the Bridge refresh token (never the token)
  revokedAt     DateTime?
  createdAt     DateTime @default(now())  updatedAt DateTime @updatedAt
  transports    BridgeTransport[]
  @@index([userId, status])
}
model BridgeTransport {           // a provider running on a bridge (whatsapp, telegram, …)
  id         String  @id @default(cuid())
  bridgeId   String
  bridge     Bridge  @relation(fields:[bridgeId], references:[id], onDelete: Cascade)
  provider   String                           // "whatsapp" | "telegram" | …
  state      String  @default("disconnected") // linking|connecting|connected|disconnected|logged_out
  identity   String?                          // connected phone/handle (display only)
  updatedAt  DateTime @updatedAt
  @@unique([bridgeId, provider])
}
// + BridgeAuthCode (device-code flow), BridgeToken (rotation) per the auth appendix.
// Bot.connectionMode gains "bridge"; for WhatsApp it means "route via the primary bridge's whatsapp transport".
```

## 6. Cloud integration (unchanged from the approved design)
Third `connectionMode="bridge"` in `lib/messaging/mode.ts`; `bridge-gateway` Node WS process terminates sockets and relays inbound → `/api/whatsapp/incoming` (1:1); outbound via a `lib/wa.ts` transport-router at the single `wa.sendNow` choke point (**send pipeline untouched**); Dashboard three-way chooser + Bridge panel (Status/Version/OS/Heartbeat/Connected identity/**Start QR**/Reconnect/Disconnect/Logout/**Logs**/Update/Primary-select). Meta Cloud + legacy QR unaffected; all behind `BRIDGE_ENABLED` (default off).

## 7. Integration test suite (required before production)

| Group | Cases |
|---|---|
| **Platforms** | Windows service · macOS Intel LaunchAgent · macOS Apple-Silicon LaunchAgent · Ubuntu systemd · Debian systemd · Docker |
| **Resilience** | network interruption → auto-reconnect · Cloud restart → resume · Bridge crash → service restart · primary offline → standby behavior |
| **Lifecycle** | Bridge upgrade (staged swap) · rollback (health-check fail) · workspace reconnect · remote revoke/logout/update |
| **Transport** | QR recovery (rotate/expire/rescan) · large media transfer (resumable + checksum) · concurrent message delivery (ordering + backpressure) · idempotent inbound dedupe |
| **Budget** | idle RAM < 150 MB · idle CPU < 2% · memory profile under sustained load |
| **Safety** | no Meta Cloud regression · no change for non-bridge tenants · auth artifacts never leave host (assert nothing sensitive on the wire) |

## 8. Revised roadmap (headless-first, transport-agnostic)

- **Phase 1 — Cloud contract (additive, flag-gated):** Prisma `Bridge`/`BridgeTransport` (+auth-code/token); `connectionMode="bridge"`; `/api/bridge/v1/*` device-code endpoints + `/link` page; Dashboard three-way chooser + read-only Bridge panel; `BRIDGE_ENABLED=off`. *Nothing routes to a bridge yet.*
- **Phase 2 — `bridge-gateway` WS ingress:** per-bridge token auth, heartbeat→online/offline, inbound→`/api/whatsapp/incoming`, outbound via `wa.ts` router; validated with a stub bridge.
- **Phase 3 — Bridge core (Go), headless:** transport-agnostic core + **Provider interface** + **WhatsApp provider (whatsmeow)**; local QR→streamed; encrypted local session; CLI; secret store; Docker. Meet the budget. First real link+relay.
- **Phase 4 — Packaging & service install + auto-update/rollback** (MSI/pkg/AppImage/DEB/multi-arch Docker; GitHub Releases signed; staged swap+rollback).
- **Phase 5 — Multi-bridge/Primary + remote control + hardening + zero-loss migration.**
- **Phase 6 — (optional, later) GUI/tray — no core/API change.**
- **Pre-production gate:** security review + scalability report + memory profile + failure-recovery report + full test matrix green.
