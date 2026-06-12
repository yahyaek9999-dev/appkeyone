# ENVIRONMENT_AUDIT — KEYONE

**Date:** 2026-06-12
**Scope:** Full environment-variable inventory across `saas/`, `whatsapp-service/`, workers, scripts, and deploy templates — with required/optional/secret classification, example values, undocumented vars, and unused vars.
**Sources:** `saas/lib/env.ts` (central schema), `process.env.*` greps, `deploy/validate-env.sh`, and the five `.env.example` files.

---

## 1. Boot-critical behavior (`lib/env.ts` + `validate-env.sh`)

**HARD-REQUIRED in production — the app refuses to boot if missing/placeholder:**

| Var | Rule enforced |
|---|---|
| `AUTH_SECRET` | Present, **≥ 32 chars**, not a placeholder (`REPLACE_WITH*`, `change-me*`, `dev-secret*`, etc.) |
| `DATABASE_URL` | Present, not a placeholder |
| `SAAS_INTERNAL_SECRET` | Present, **≥ 16 chars**, not a placeholder (`dev-internal-secret*`) |
| `META_APP_SECRET` | Required **only if** `META_CLOUD_ENABLED=1` |
| `UPSTASH_REDIS_URL` | Required **only if** `ENABLE_BULLMQ=1` |

> 🛑 **Deploy prerequisite (from memory + security audit):** `SAAS_INTERNAL_SECRET` and `AUTH_SECRET` must be rotated off their public dev defaults or production will hard-fail at startup (`validateEnv()` reject). This is now enforced — a fresh server with empty/default values will not boot.

**WARN (non-blocking) in production:** `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SENTRY_DSN`, `LLM_API_URL`, `WHATSAPP_SERVICE_URL` (warn if absent); `LLM_API_KEY`, `WHATSAPP_SHARED_SECRET` (warn if placeholder). Everything else has a code default.

---

## 2. Required variables (must set on a new server)

| Var | Example value | Secret | Purpose |
|---|---|---|---|
| `NODE_ENV` | `production` | no | Runtime mode |
| `PORT` | `3000` (saas) / `7799` (wa-service) | no | HTTP bind port |
| `NEXT_PUBLIC_SITE_URL` | `https://app.keyone1.com` | no | Canonical URL (SEO, callbacks) |
| `AUTH_SECRET` | `openssl rand -hex 32` → 64 hex | **YES** | Signs session JWTs **and** derives AES-256-GCM key for tenant provider keys |
| `DATABASE_URL` | `file:/var/keyone/data/saas.db` (Linux) / `file:C:/KEYONE/data/saas.db` (Win) | no | Prisma SQLite connection |
| `SAAS_INTERNAL_SECRET` | `openssl rand -hex 24` | **YES** | Authenticates saas↔whatsapp-service & cron routes (constant-time compare) |
| `WHATSAPP_SERVICE_URL` | `http://127.0.0.1:7799` | no | Base URL of WhatsApp bridge |
| `WHATSAPP_SHARED_SECRET` | `openssl rand -hex 24` | **YES** | Authenticates outbound saas→wa-service calls (must match on both sides) |
| `LLM_API_URL` | `http://127.0.0.1:7788` | no | In-house CloakBrowser LLM proxy |
| `LLM_API_KEY` | match CloakBrowser `API_KEY` | **YES** | Bearer token for the LLM proxy |
| `LLM_MODEL` | `gpt-4o-mini` | no | Default model name |
| `TRUSTED_PROXY_COUNT` | `1` | no | Reverse-proxy hop count for real-IP extraction (Caddy = 1) |

**whatsapp-service side (its own `.env`):**

| Var | Example | Secret | Purpose |
|---|---|---|---|
| `PORT` | `7799` | no | Bridge listen port (default 3001) |
| `SAAS_INTERNAL_SECRET` | *(same value as saas)* | **YES** | Must match saas |
| `SAAS_INCOMING_URL` | `http://127.0.0.1:3000/api/whatsapp/incoming` | no | Where inbound WA messages are POSTed |
| `SESSIONS_DIR` | `/var/keyone/data/wa-sessions` | no | WhatsApp session auth storage |

**LLM proxy side (root `.env`, consumed by `main.py`):**

| Var | Example | Secret | Purpose |
|---|---|---|---|
| `HOST` / `PORT` | `127.0.0.1` / `7788` | no | Bind |
| `API_KEY` | *(match `LLM_API_KEY`)* | **YES** | Auth from saas |
| `HEADLESS` | `true` | no | Chromium headless |
| `PROFILE_DIR` | `/var/keyone/data/cloak-profile` | no | Browser profile |
| `MAX_CONCURRENT` / `REQUEST_TIMEOUT_SEC` | `3` / `120` | no | Throughput |

---

## 3. Optional variables

| Group | Vars | Default behavior if unset |
|---|---|---|
| **Postgres (future)** | `POSTGRES_URL`, `POSTGRES_DIRECT_URL` (code reads `DATABASE_DIRECT_URL`) | SQLite used |
| **Redis / BullMQ** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_URL`, `ENABLE_BULLMQ` | Disabled; cron+SQLite queue used |
| **Sentry** | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Error tracking off |
| **Media AI** | `OPENAI_API_KEY`, `WHISPER_API_URL`, `VISION_API_URL`, `VISION_MODEL`, `MEDIA_AI_TIMEOUT_MS`, `MAX_AUDIO_BYTES`, `MAX_IMAGE_BYTES` | Graceful placeholder transcription/vision |
| **Meta Cloud** | `META_CLOUD_ENABLED`, `META_APP_SECRET`, `META_GRAPH_VERSION` | Meta path off |
| **Admin recovery** | `ADMIN_INIT_SECRET` | `/api/admin/init` returns 403 (disabled) |
| **Signup** | `SIGNUP_AUTO_APPROVE` | New signups land as `pending` |
| **Free-tier gate** | `FREE_TIER_ENFORCEMENT` | `0` (no enforcement) |
| **Anti-ban tuning** | `ANTI_BAN_PER_MIN`, `ANTI_BAN_PER_10M`, `ANTI_BAN_NEW_CHATS_10M`, `ANTI_BAN_DAILY_SOFT_CAP`, `ANTI_BAN_COOLDOWN_MS` | Built-in defaults (12 / 80 / 25 / 600 / 90000) |
| **Cache/memory tuning** | `KB_CACHE_TTL_MS`, `KB_CACHE_MAX`, `MEMORY_EXTRACT_EVERY`, `MEMORY_EXTRACT_TIMEOUT_MS` | Defaults |
| **LLM scaling** | `LLM_API_URLS`, `LLM_MAX_CONCURRENT` | Single URL, concurrency 3 |
| **DB tuning** | `DATABASE_WAL`, `PRAGMAS_SKIP`, `DATABASE_DIRECT_URL` | WAL on, pragmas applied |
| **Seed only** | `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `SUPPORT_EMAIL`, `SUPPORT_WHATSAPP` | used by `seed.ts` only |

---

## 4. Secret variables — regeneration guide for a new server

| Secret | How to generate | Reusable from old server? |
|---|---|---|
| `AUTH_SECRET` | `openssl rand -hex 32` | **Must reuse the OLD value** if restoring an existing DB — otherwise all encrypted tenant provider keys become unreadable and all sessions invalidate. Generate fresh **only** for a clean install. |
| `SAAS_INTERNAL_SECRET` | `openssl rand -hex 24` | Can regenerate freely (set identically on saas + wa-service) |
| `WHATSAPP_SHARED_SECRET` | `openssl rand -hex 24` | Can regenerate freely (set identically on both sides) |
| `LLM_API_KEY` / `API_KEY` | `openssl rand -hex 24` | Can regenerate (must match saas ↔ LLM proxy) |
| `ADMIN_INIT_SECRET` | `openssl rand -hex 32` | Set temporarily only when using the recovery endpoint; unset otherwise |
| `OPENAI_API_KEY`, `UPSTASH_*`, `SENTRY_AUTH_TOKEN`, `META_APP_SECRET` | from the respective provider dashboards | Reuse existing |

> ⚠️ **The single most important recovery secret is `AUTH_SECRET`.** It is the AES-256-GCM master key (`scrypt(AUTH_SECRET, "keyone:provider-key:v1")`) for every `Bot.aiApiKeyEnc`, `Bot.metaAccessTokenEnc`, and `TenantProviderCredential.*Enc`. If you restore the database but lose `AUTH_SECRET`, those columns are permanently lost and tenants must re-enter every provider key.

---

## 5. Detected: referenced in code but UNDOCUMENTED in any `.env.example`

These are read by `process.env.*` but appear in **no** template — undocumented tuning/operational knobs. Most have safe defaults, but they should be added to `saas/.env.example` / `deploy/env.*.example` for operability.

- **whatsapp-service tuning:** `ENABLE_SESSION_HIBERNATION`, `ENABLE_CHROMIUM_OPTIMIZATION`, `HIBERNATE_MAX_ACTIVE`, `HIBERNATE_IDLE_MINUTES`, `HIBERNATE_MAX_CONCURRENT_WAKES`, `HIBERNATE_WAKE_TIMEOUT_SEC`, `AUTH_RESTORE_QR_GRACE_SEC`, `AUTH_RESTORE_QR_MAX_RETRIES`, `WA_HEALTH_CHECK_SEC`, `WA_HEALTH_MAX_FAILURES`, `WA_SEND_MAX_ATTEMPTS`, `WA_SEND_MIN_SESSION_SPACING_MS`, `WA_SEND_MIN_RECIPIENT_SPACING_MS`, `WA_MAX_SESSIONS`, `WA_IDLE_HOURS`, `WA_HTTP_RATE_WINDOW_MS`, `WA_HTTP_RATE_MAX`, `RESTORE_STAGGER_MS`, `WA_SMART_QUEUE_ENABLED`
- **Baileys (experimental):** `BAILEYS_LOG_LEVEL`, `BAILEYS_RECONNECT_BASE_MS`, `BAILEYS_RECONNECT_MAX_MS`, `BAILEYS_DUP_TTL_MS`, `BAILEYS_WORKER_URL`, `BAILEYS_WORKER_SECRET` *(secret)*, `BAILEYS_WORKER_HEARTBEAT_MS`
- **App feature flags:** `ENABLE_SNAPSHOT_CACHE`, `ENABLE_MESSAGE_COALESCING`, `ENABLE_BACKGROUND_OFFLOADING`, `SIGNUP_AUTO_APPROVE`, `PROVIDER_LOG_RETENTION_DAYS`
- **DB:** `DATABASE_WAL`, `PRAGMAS_SKIP`, `DATABASE_DIRECT_URL`
- **Workers / broadcast:** `MSE_AI_API_URLS`, `MSE_AI_API_KEY` *(secret)*, `AI_BASE_URL`, `WORKER_HEALTH_PORT`
- **URL aliases (drift):** `PUBLIC_BASE_URL`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_APP_URL` — three additional base-URL vars distinct from `NEXT_PUBLIC_SITE_URL`
- **Verify/ops:** `KEYONE_VERIFY_BASE_URL`, `KEYONE_VERIFY_AUTH_COOKIE` *(secret)*, `KEYONE_VERIFY_HTTP_TIMEOUT_MS`, `KEYONE_VERIFY_RSS_WARN_MB`, `KEYONE_BACKUP_DIR`, `KEYONE_PROVIDER_PRICES_JSON`
- **Build-injected (do not set manually):** `NEXT_PUBLIC_BUILD_ID`, `BUILD_ID`, `NEXT_RUNTIME`

---

## 6. Detected: documented but UNUSED / stale names

| In template | Issue |
|---|---|
| `SHARED_SECRET` (`deploy/env.whatsapp.example`) | Stale — code reads `SAAS_INTERNAL_SECRET`. Setting only `SHARED_SECRET` leaves the service unauthenticated. |
| `SAAS_WEBHOOK_URL` (`deploy/env.whatsapp.example`) | Stale — code reads `SAAS_INCOMING_URL`. |
| `POSTGRES_DIRECT_URL` (commented in `saas/.env.example`) | Code actually reads `DATABASE_DIRECT_URL` — naming mismatch. |
| `HOST`, `HEADLESS`, `API_KEY`, `MAX_CONCURRENT`, `PROFILE_DIR`, `REQUEST_TIMEOUT_SEC` (`deploy/env.llm.example`) | Not consumed by Node — these configure the **Python** CloakBrowser process. Valid for the LLM proxy, not the SaaS. |

**Action:** fix the three stale/mismatched names in the deploy templates so a fresh operator copying them gets a working config.

---

## 7. Migration notes (Windows → Ubuntu / SQLite → Postgres)

1. **Path style:** change `DATABASE_URL` and `SESSIONS_DIR` from `C:/KEYONE/...` to Linux paths (e.g. `/var/keyone/data/saas.db`, `/var/keyone/data/wa-sessions`). For Docker, the compose file overrides `DATABASE_URL=file:/data/saas.db`.
2. **Preserve `AUTH_SECRET` verbatim** when carrying the DB across — see §4.
3. **Postgres cutover:** set `POSTGRES_URL` + `POSTGRES_DIRECT_URL`, swap to `schema.postgres.prisma`, rebuild. Keep SQLite `DATABASE_URL` set during the transition for rollback. See [DATABASE_MIGRATION_AUDIT](DATABASE_MIGRATION_AUDIT.md).
4. **Port reconciliation:** decide one WhatsApp port (3001 vs 7799) and set it consistently in `WHATSAPP_SERVICE_URL`, the wa-service `PORT`, and the Caddy `/wa/*` upstream.
5. **Secrets vault:** store the full `.env` set off-server (password manager / vault). Today the only copies are on the VPS — a loss event takes the secrets with it.
6. **Regenerate `SAAS_INTERNAL_SECRET`/`WHATSAPP_SHARED_SECRET`/`LLM_API_KEY`** on the new box if desired (they have no data-binding), but keep them identical across the cooperating services.
