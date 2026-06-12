# WHATSAPP_RECOVERY_AUDIT — KEYONE

**Date:** 2026-06-12
**Scope:** WhatsApp session/auth persistence, what must be backed up, and how to restore WhatsApp connectivity after a loss event.

> 🔒 **CLAUDE.md hard rule:** never modify the WhatsApp send pipeline without explicit approval. This document is **read-only analysis + restore procedure** — it changes nothing.

---

## 1. WhatsApp architecture (recovery-relevant)

| Provider | Tech | Status | Session state location |
|---|---|---|---|
| **QR (whatsapp-web.js)** | Puppeteer + Chromium | **PRODUCTION** | `SESSIONS_DIR` → `.wwebjs_auth/session-<userId>/` |
| **Meta Cloud API** | Graph API v20.0 | Gated off (`META_CLOUD_ENABLED=0`) | Token in DB (`Bot.metaAccessTokenEnc`) |
| **Baileys** | `@whiskeysockets/baileys` | Experimental, disabled (`ENABLE_BAILEYS=0`) | `BAILEYS_AUTH_DIR` (`exp-*` only) |

**Production send path (single chain):** caller → `lib/wa.ts` `send()` → (optional smart queue) → `lib/messaging` router → QR provider → HTTP `POST {WHATSAPP_SERVICE_URL}/sessions/{userId}/send` with `X-Internal-Secret` → `whatsapp-service` (Puppeteer) → WhatsApp.
**Inbound:** `whatsapp-service` → `POST {SAAS_INCOMING_URL}` (`/api/whatsapp/incoming`) with `X-Internal-Secret`.

---

## 2. Session & authentication files

### Production (whatsapp-web.js)
- **Root:** `SESSIONS_DIR`
  - prod (deploy template): `C:/KEYONE/data/wa-sessions`
  - default (code): `./sessions` relative to `whatsapp-service/`
- **Per-tenant subtree:** whatsapp-web.js `LocalAuth` (clientId = `userId`) writes the Chromium profile + WA Web credentials under `SESSIONS_DIR/.wwebjs_auth/session-<userId>/`.
- **Cache (regenerable):** `.wwebjs_cache/` holds the WA Web build cache — not auth; safe to lose.
- **Format:** opaque browser/IndexedDB profile data; treat as an **opaque directory** — back up and restore the whole tree, do not cherry-pick files.

### Experimental (Baileys) — not production
- `BAILEYS_AUTH_DIR` (default `<cwd>/baileys-sessions`), namespaced `exp-*`. Irrelevant to production recovery.

### Meta Cloud — not session-file based
- No local session files. Auth is the encrypted access token in the DB (`Bot.metaAccessTokenEnc`), decryptable only with the matching `AUTH_SECRET`.

---

## 3. Required persistence (what to back up for WhatsApp)

| Artifact | In Git? | In DB? | Must back up? |
|---|---|---|---|
| `SESSIONS_DIR/.wwebjs_auth/session-*` (QR auth) | ❌ | ❌ | **Yes** — to avoid re-scanning QR per tenant |
| `.wwebjs_cache/` | ❌ | ❌ | No (regenerates) |
| `whatsapp-service/.env` (`SAAS_INTERNAL_SECRET`, `SESSIONS_DIR`, `SAAS_INCOMING_URL`) | ❌ | ❌ | **Yes** (secrets backup) |
| Bot/conversation/message records | ❌ | ✅ | Covered by DB backup |
| `Bot.metaAccessTokenEnc` (if Meta used) | ❌ | ✅ (encrypted) | Covered by DB backup **+ `AUTH_SECRET`** |

`backup-all.ps1` already copies `SESSIONS_DIR` via `robocopy /E` into the pre-deploy snapshot — but, like all current backups, **only to the VPS disk** (no off-site copy).

---

## 4. Backup locations (current)

- **Pre-deploy snapshot:** `C:\app\backups\pre-deploy-<ts>\wa-sessions\` (full `robocopy` of `SESSIONS_DIR`).
- **Daily DB backup** (`backup-db.ps1`) does **not** include WA sessions — only the SQLite file.
- ⚠️ **No off-site / scheduled WA-session backup.** Sessions are only captured opportunistically at deploy time. Between deploys, a fresh QR pairing is not backed up until the next deploy snapshot.

**Recommendation:** add WhatsApp sessions to a scheduled off-site backup (see [BACKUP_POLICY](BACKUP_POLICY.md)) — e.g. nightly `robocopy` + upload, or include `SESSIONS_DIR` in the daily job.

---

## 5. Restore procedure

### Case A — sessions backup available (avoid QR re-scan)
```bash
# 1. Stop the WhatsApp service
nssm stop mse-wa                         # Windows
# docker compose stop ...                # (n/a — wa-service runs on host)

# 2. Restore the session tree into SESSIONS_DIR
#    Windows:
robocopy "C:\app\backups\pre-deploy-<ts>\wa-sessions" "C:\KEYONE\data\wa-sessions" /E /COPY:DAT
#    Linux:
rsync -a /restore/wa-sessions/ /var/keyone/data/wa-sessions/

# 3. Ensure whatsapp-service/.env has the matching SESSIONS_DIR + SAAS_INTERNAL_SECRET
# 4. Start the service; it auto-restores sessions on boot (restoreSessions() scans SESSIONS_DIR)
nssm start mse-wa
```
On boot, `whatsapp-service` enumerates `session-*` folders and reconnects each. Valid auth → reconnects silently. Expired auth → emits a `qr` event (tenant must re-scan).

### Case B — no sessions backup (clean WhatsApp recovery)
1. Bring the SaaS + wa-service up with an **empty** `SESSIONS_DIR`.
2. Each tenant opens their dashboard WhatsApp connect page → a fresh QR is generated → tenant scans it from their phone (Linked Devices).
3. New auth is written to `SESSIONS_DIR/.wwebjs_auth/session-<userId>/`.
4. No message history is lost (history is in the DB); only the live device link is re-established.

### Verify after restore
- `whatsapp-service` health endpoint responds (port 3001/7799).
- A test send via the dashboard (or `deploy/smoke-test.ps1`) delivers.
- Inbound: send a message to a connected number; confirm it reaches `/api/whatsapp/incoming`.

---

## 6. Key recovery facts

- **Session loss is recoverable without data loss** — message history, customers, and bot config live in the DB. Only the live phone link must be re-established (restore dir or re-scan QR).
- **The DB alone cannot restore a WhatsApp link** — auth lives on disk (whatsapp-web.js), not in the DB.
- **Meta tokens need `AUTH_SECRET`** — if Meta Cloud is enabled, restoring the DB without the matching `AUTH_SECRET` loses the token (re-enter in dashboard).
- **`SAAS_INTERNAL_SECRET` must match** between saas and wa-service or all sends/inbound are rejected (401).
- **Re-pairing is low-friction** but requires each tenant's physical phone — coordinate tenant comms during a no-backup recovery.
