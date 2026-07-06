# KEYONE Bridge

A **headless** connector that moves the WhatsApp transport **off** the KEYONE
Cloud and onto a machine you control. It behaves like a Cloudflare Tunnel /
Tailscale / GitHub Actions runner: a small daemon that maintains a secure link to
the Cloud and relays messages. **The Dashboard is the only UI** — the Bridge
renders nothing and stores no business data.

> **Scope (v1): WhatsApp only.** The internal design keeps a transport-agnostic
> `Provider` interface so more transports can be added in a later version, but
> **no other provider is built or shipped in v1** — no multi-transport UI, no
> transport selection.

## Why

The Cloud must never run a browser, hold WhatsApp sessions, or execute WhatsApp
Web. The Bridge owns the transport + local encrypted session; the Cloud owns CRM,
AI, orders, analytics, billing. Only messages, connection state, and the QR
*string* transit the link — **auth artifacts never leave the host**.

## Architecture (transport-agnostic core)

```
CLI (login/start/stop/status/logs/update/logout)
  └── Supervisor ──────────────── Cloud Link (protocol v1 WebSocket, heartbeats, reconnect)
        │                          Offline queue (durable, bounded)
        │                          Secret store (OS keychain + AES-GCM fallback)
        └── Provider registry ──── Provider interface (the ONLY contract the core knows)
              └── whatsapp (whatsmeow)   ← the ONLY provider shipped in v1
              ·  (the interface allows a future provider to plug in without a
              ·   core change — but none is built in v1)
```

Adding a provider = a new package that implements `transport.Provider` and calls
`transport.Register` in its `init()`. The core never imports a concrete provider
directly — `cmd/keyone-bridge/main.go` blank-imports the ones to include.

- `internal/transport` — the `Provider` interface, transport-neutral message/event
  types, and the registry. **The centerpiece.**
- `internal/transport/whatsapp` — whatsmeow provider (local QR streamed, encrypted
  local session in `whatsmeow.db`, cgo-free via `modernc.org/sqlite`).
- `internal/transport/fake` — a transport-less provider for tests/CI.
- `internal/cloud` — device-code + PKCE linking (`link.go`) and the resilient
  protocol-v1 WebSocket client (`client.go`).
- `internal/supervisor` — wires providers ↔ cloud ↔ offline queue.
- `internal/secret` — keychain (Keychain/DPAPI/libsecret) + AES-256-GCM file fallback.
- `internal/queue` — durable, bounded FIFO for outbound during outages.
- `internal/updater` — GitHub-Releases update check + verified atomic swap + rollback.
- `internal/config`, `internal/logging` — per-OS paths + leveled rotating logs.

## Install / run

```bash
make build                 # -> bin/keyone-bridge (cgo-free)
bin/keyone-bridge login    # device-code link to your KEYONE workspace
bin/keyone-bridge start    # run it (or install as a service — see ../deploy/bridge)
bin/keyone-bridge status
```

`login` prints a short code + URL; approve it in the KEYONE Dashboard. The Bridge
then holds only `{WorkspaceID, BridgeID, BridgeToken}` — the token in the OS
keychain, never in the clear.

## Security posture

- Token stored in the OS keychain; AES-256-GCM encrypted file fallback (0600) on
  headless hosts without a secret service.
- PKCE (S256) on the device-code exchange; the Cloud stores only `sha256(token)`.
- WhatsApp session lives in a local SQLite store and **never** leaves the host.
- Fail-closed: no token ⇒ no link; the Cloud gateway rejects unknown tokens at
  the WebSocket upgrade.

## Build matrix

`make dist` cross-compiles `darwin/{amd64,arm64}`, `linux/{amd64,arm64}`,
`windows/amd64` into `dist/` with a `checksums.txt` the auto-updater verifies.
All targets are cgo-free (no C toolchain needed).

## Protocol

Speaks protocol **v1** to the Cloud `bridge-gateway` (see
`../bridge-gateway/README.md`). Every frame is versioned so a new Cloud never
breaks an old Bridge and vice-versa.
