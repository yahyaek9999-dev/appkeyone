# KEYONE Bridge — Security & Performance Review

**Date:** 2026-07-06  **Scope:** Cloud bridge APIs + `bridge-gateway` + the Go Bridge (`keyone-bridge/`).
**Verdict:** No high/critical issues. Auth, isolation, and encryption are sound and fail-closed. Remaining gates are external (code-signing certs) or deployment (public `/bridge` route), not code defects.

## 1. Authentication & token lifecycle

- **Linking:** RFC 8628 device-code + **PKCE S256**. The Bridge sends `BASE64URL(SHA256(verifier))` at `device/start`; proves possession with the verifier at `device/token`. No Bridge account/password.
- **Token at rest:** the Cloud stores **only `sha256(bridge_token)`** (`BridgeToken.tokenHash`); the raw token is returned once. The Bridge keeps it in the **OS keychain** (Keychain/DPAPI/libsecret) or an **AES-256-GCM** file vault (0600) on headless hosts.
- **Rotation + reuse-detection:** `token/rotate` mints a new token, revokes the old, records `prevHash`. Presenting a revoked token ⇒ **the whole Bridge is revoked** (stolen-token replay defense). The Bridge rotates every 24h (`KEYONE_BRIDGE_ROTATE_HOURS`) and on `keyone-bridge rotate`, persisting the new token before reuse.
- **WS auth:** verified at the **upgrade** (`verifyClient`) via `sha256(token)` against a live, non-revoked `BridgeToken`+`Bridge`. Bad/missing token ⇒ HTTP 401, no socket. Verified live in prod: bad token → 401.
- **Fail-closed everywhere:** no `SAAS_INTERNAL_SECRET` ⇒ inbound relay + `/internal/*` rejected; no `POSTGRES_URL` ⇒ every WS connection rejected; `BRIDGE_ENABLED` off ⇒ all `/api/bridge/*` → 404.

## 2. Workspace / multi-bridge isolation

- Every `Bridge` is scoped to a `userId` (workspace). The gateway resolves `bridgeId → userId` from the token at connect and **only** relays inbound for **that** user (`ws.userId`, never a frame-supplied id) → no cross-tenant injection.
- Outbound is addressed by `userId`; the gateway delivers to that user's **primary online** bridge (`isPrimary`, else any). Multi-bridge per workspace is supported from day one.
- `/internal/qr` and `/internal/outbound` require the internal secret (timing-safe compare); the trusted Cloud scopes `bridgeId`/`userId` to the authenticated dashboard user.

## 3. Confidentiality of transport data

- **Auth artifacts never leave the host.** The WhatsApp session lives in a local SQLite store (`whatsmeow.db`); only the QR **string**, connection **state**, and message **content** transit the link.
- Link is **WSS** (Caddy TLS) in production; internal Cloud↔gateway HTTP is localhost-only.
- Media (future phase) is transport-only with checksums; no inference on the Bridge.

## 4. Blast-radius / send-pipeline safety

- The one send-pipeline touch (`wa.sendNow`) is additive and **double-gated** (`BRIDGE_ENABLED` + per-bot `connectionMode==bridge`). Flag off ⇒ byte-identical (verified: 901-file source rollup unchanged; prod QR/Meta users unaffected).
- Adversarial multi-lane review (correctness / security / pipeline-safety) of the Phase 2 relay: **0 confirmed findings of 13 raised** after independent verification.

## 5. Performance & resource budget

Measured (idle, fake provider, connected to a mock gateway, `TestIdleFootprint`):

| Metric | Value | Budget |
|---|---|---|
| Heap in use | **0.3 MB** | — |
| Heap reserved | 7.6 MB | — |
| **Total from OS (Sys)** | **12.7 MB** | < 150 MB ✅ |
| Goroutines | 9 | — |
| Binary (stripped, cgo-free) | ~21 MB | — |

- Bounded everywhere: event channels (128), offline queue (10k, drops-oldest), ack map self-clears on timeout, per-bridge registries cleaned on disconnect, QR payload capped (8KB).
- Reconnect uses **capped exponential backoff + jitter** (1s→30s). Heartbeats 25s; server staleness sweep 90s. No busy loops.
- cgo-free (`modernc.org/sqlite`) ⇒ no C runtime, trivial cross-compilation, smaller attack surface.
- Connected whatsmeow adds session + protobuf overhead; expected steady-state well under budget (typical whatsmeow bridges 40–80 MB). To be re-measured on a real linked device (see blockers).

## 6. Recovery & availability

- Crash recovery via the service manager: systemd `Restart=on-failure` + start-limit backoff; launchd `KeepAlive`; Windows SCM `failure … restart`.
- Auto-updater: GitHub-Releases check → download → **SHA-256 verify against `checksums.txt`** (refuses on mismatch or missing checksums unless explicitly overridden) → **atomic swap** (`exe`→`.old`, new→`exe`) → `update --rollback` restores `.old`.
- Durable offline queue: outbound accepted while a provider is down is persisted (JSONL) and drained on reconnect (verified by `TestOfflineQueueDrainsOnProviderRecovery`).
- `keyone-bridge doctor`: config/link/token/writability/provider + Cloud API & WS reachability + update-channel diagnostics.

## 7. Residual risks & external blockers (not code defects)

1. **Code signing** — macOS (Developer ID + notarization) and Windows (Authenticode) certs are not in the repo; artifacts ship **unsigned** until provisioned. Integrity is still enforced by the updater's SHA-256 chain. *(Highest-priority pre-GA item.)*
2. **Public `/bridge` WS route** — Caddy currently proxies everything to :3000; the gateway is localhost-only. Wiring `reverse_proxy /bridge* localhost:3002` is a Phase-2 go-live deploy step (documented). Until then `BRIDGE_ENABLED` stays off.
3. **Real-device E2E** — full WhatsApp link/relay needs a real phone to scan the QR; validated so far via the fake provider + protocol E2E. Connected-state memory to be confirmed on a live link.
4. **Headless secret fallback** — the AES-GCM file vault's key is a sibling 0600 file; protects against casual reads, not a determined local root. Prefer the keychain where a secret service exists.

## 8. Recommendation

Ship-ready as a **flag-gated, off-by-default** capability. Before enabling in production: provision signing certs, wire the Caddy `/bridge` route, and run one real-device link to confirm end-to-end + connected memory. No code changes are blocking.
