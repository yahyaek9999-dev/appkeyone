# SECRETS_INVENTORY_AND_MIGRATION — KEYONE

**Date:** 2026-06-12
**Blocker addressed:** **B2** — secrets exist only on the VPS, with no off-server vault.
**Scope:** every secret the platform depends on — platform master secrets, external-service credentials, per-tenant credentials (AI / Meta / SMTP), and infra/access secrets — plus where each lives, whether it must be preserved or rotated, and a migration plan into an off-server vault.

> ⚠️ This document deliberately contains **NO secret values** — only names, locations, and handling. Do not paste real values into version control.

---

## 1. The five secret tiers

| Tier | Where it lives | Backed up by | Recovery rule |
|---|---|---|---|
| **T1 Platform master** | env files (`.env`) | off-site backup (encrypted) | preserve `AUTH_SECRET` verbatim; others may rotate |
| **T2 External services** | env files | off-site backup | re-issue from provider dashboards |
| **T3 Per-tenant** | **database** (encrypted) | DB backup **+ `AUTH_SECRET`** | restored automatically if AUTH_SECRET matches |
| **T4 Seed/bootstrap** | env (seed only) | n/a | regenerate (not runtime) |
| **T5 Infra / access** | external systems | **vault only** | document in vault — not derivable from code |

---

## 2. T1 — Platform master secrets (env, server-only)

| Secret | Used for | Generate | **Preserve on restore?** | Rotation |
|---|---|---|---|---|
| **`AUTH_SECRET`** | Signs session JWTs **and** derives the AES-256-GCM key (`scrypt(AUTH_SECRET,"keyone:provider-key:v1")`) that encrypts **all T3 secrets** | `openssl rand -hex 32` | **YES — verbatim.** Losing it makes every T3 secret in the DB permanently unreadable and logs out all users | Rotate only via the re-encryption migration in §6 |
| `SAAS_INTERNAL_SECRET` | saas ↔ whatsapp-service ↔ cron internal auth (constant-time) | `openssl rand -hex 24` | No (regenerate, set identically on both services) | Safe anytime |
| `WHATSAPP_SHARED_SECRET` | outbound saas → wa-service auth | `openssl rand -hex 24` | No (regenerate, both sides) | Safe anytime; **promote to required in prod** |
| `LLM_API_KEY` (saas) = `API_SECRET_KEY` (LLM proxy, default `change-secret-key-2026`) | saas ↔ CloakBrowser proxy auth | `openssl rand -hex 24` | No (regenerate, match both sides) | Safe anytime — **the proxy default is a known weak value; rotate it** |
| `ADMIN_INIT_SECRET` | guards `/api/admin/init` recovery endpoint | `openssl rand -hex 32` | No — set only temporarily when used | Unset normally |

> **`AUTH_SECRET` is THE recovery linchpin.** Back it up *with* the database, in the vault, and verify on every restore that a known `Bot.aiApiKeyEnc` decrypts.

---

## 3. T2 — External-service credentials (env, replaceable)

| Secret | Service | Required? | Recovery |
|---|---|---|---|
| `OPENAI_API_KEY` | OpenAI (Whisper transcription, Vision fallback) | optional | re-issue at platform.openai.com |
| `UPSTASH_REDIS_REST_TOKEN`, `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis (BullMQ, only if `ENABLE_BULLMQ=1`) | optional | Upstash dashboard |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Sentry (errors; token is build-time) | optional | Sentry dashboard |
| `META_APP_SECRET` | Meta Cloud webhook HMAC (only if `META_CLOUD_ENABLED=1`) | conditional | Meta App dashboard |

---

## 4. T3 — Per-tenant credentials (in the DB, encrypted)

These are **not env vars**. Tenants enter them in the dashboard; the app encrypts them with the `AUTH_SECRET`-derived key and stores ciphertext in the DB. They ride along in the DB backup and decrypt automatically **iff** `AUTH_SECRET` is unchanged.

| Category | Column / model | Format |
|---|---|---|
| **AI provider credentials** | `Bot.aiApiKeyEnc`; `TenantProviderCredential.secretEnc` / `secret2Enc` (domains: `ai`, `speech`, `image`, `sms`, `email`) | `gcm:<iv>:<tag>:<ct>` |
| **Meta credentials** | `Bot.metaAccessTokenEnc` (+ phone-number/WABA IDs) | `gcm:…` |
| **SMTP credentials** | `CommerceEmailProvider` → `provider` (`smtp`/`ses`/`http`), `host`, `username`, **`secretEnc`** (SMTP password / API key) | `gcm:…` |

> **SMTP is per-tenant, not a global env secret.** There is no platform `SMTP_*`/`SENDGRID_*`/`RESEND_*` variable. Each merchant configures their own sender via `CommerceEmailProvider`; the password/API key is `secretEnc` in the DB. Protection = DB backup + `AUTH_SECRET`. Integration code: `saas/lib/integrations/email/{smtp,ses,http}.ts`.

**Recovery for all of T3:** restore the DB, ensure `AUTH_SECRET` matches → all tenant AI/Meta/SMTP secrets work immediately. If `AUTH_SECRET` is lost, tenants must re-enter everything in the dashboard.

---

## 5. T5 — Infra / access secrets (vault-only — not in code or DB)

These cannot be recovered from Git, the DB, or backups. They must be written down in the vault **now**.

| Secret / access | Where used | Recovery action |
|---|---|---|
| **VPS administrator / SSH access** | logging into the server | document credentials + (current Windows) `Administrator` access; (Ubuntu) the `keyone` user SSH private key |
| **GitHub Actions secrets** (`VPS_SSH_KEY`, `VPS_HOST`, `VPS_PORT`, `VPS_APP_DIR`, `VPS_RELEASES_DIR`, `VPS_SERVICE_NAME`, `HEALTH_CHECK_URL`) | CI/CD deploy (`.github/workflows/deploy.yml`) | re-create in the repo's `production` environment settings if the org/repo changes |
| **DNS registrar / zone access** | re-point `app.keyone1.com` during recovery | document registrar, account, and 2FA recovery |
| **Off-site backup credentials** | `rclone` remote token (B2/R2/S3) | store in vault; scope to write-only + object-lock |
| **Backup encryption key** | the **private** `age` identity for `deploy/offsite/*` | store in vault — **this is what makes the off-site archives restorable** |
| **GHCR token** (`GHCR_TOKEN`, for the Docker path) | pulling `ghcr.io/.../keyone-saas` | GitHub PAT with `read:packages` |
| **ChatGPT login session** | the CloakBrowser proxy's `CHROME_PROFILE_DIR` | not a stored secret — re-login on recovery (or back up the profile dir) |
| **Stale `mse_ai_api-main/saas/.env`** | old monorepo copy on the Mac (may hold a prior `AUTH_SECRET`) | review; if it's the live `AUTH_SECRET`, secure it; if superseded, mark rotated and delete |

---

## 6. Migration plan — get secrets into an off-server vault

**Goal:** a single encrypted vault (1Password / Bitwarden / `age`-encrypted file in the off-site bucket) holding every T1/T2/T5 secret + a copy of `AUTH_SECRET`, so a VPS loss never loses the secrets.

| # | Action | Effort | Notes |
|---|---|---|---|
| S1 | Choose a vault (1Password/Bitwarden recommended; or an `age`-encrypted `secrets.vault` in the off-site bucket) | 10 min | off-server is the whole point |
| S2 | From the live server, capture the **names** of present secrets without printing values (redaction helper below) and use it as a checklist | 10 min | avoids missing any |
| S3 | Copy each real value into the vault: all of §2, §3, §5 | 30 min | do this on a trusted machine, not in chat/logs |
| S4 | **Verify `AUTH_SECRET`** in the vault matches production: confirm a known `Bot.aiApiKeyEnc` decrypts with it | 15 min | the most important check |
| S5 | **Rotate the weak/shared ones**: `LLM_API_KEY`/`API_SECRET_KEY` (off its `change-secret-key-2026` default), `SAAS_INTERNAL_SECRET`, `WHATSAPP_SHARED_SECRET`. Update both sides of each pair, restart services in a window. *(Plan only — execute with approval; this touches running services.)* | 30 min | do NOT rotate `AUTH_SECRET` here |
| S6 | Promote `WHATSAPP_SHARED_SECRET` to **required** in `validate-env.sh` / `lib/env.ts` (remove dev fallback) | 20 min | closes audit risk M6 |
| S7 | Store the **off-site age private key** + **rclone remote token** + **DNS** + **SSH** access in the vault | 15 min | T5 |
| S8 | Commit a **`secrets.manifest`** (names only, no values) to the repo so the inventory is versioned | 10 min | template below |
| S9 | Set a **rotation cadence**: T1 pairs every 6–12 months; T2 per provider policy; immediately on any suspected exposure | — | document in vault |

**Total effort (excluding the approval-gated S5 rotation): ~1.5 hours.**

### `AUTH_SECRET` rotation (the special case — plan, do not run here)
Rotating `AUTH_SECRET` re-keys all T3 ciphertext. Safe procedure:
1. Add a `crypto-util` path that can **decrypt with the OLD key and re-encrypt with the NEW** (additive migration; no rewrite of the send pipeline).
2. In a maintenance window: load OLD `AUTH_SECRET`, iterate every `*Enc` column, re-encrypt with NEW, write back inside a transaction.
3. Swap `AUTH_SECRET` to NEW, rebuild, restart. All sessions invalidate (expected — users re-login).
4. Keep the OLD value in the vault until the migration is verified, then retire it.
> Only do this if `AUTH_SECRET` is suspected exposed. Otherwise **preserve it** — it is the recovery linchpin.

### Redaction helper for S2 (prints names only, never values)
```bash
# Run on the server; lists which secret KEYS are set, values masked.
for k in AUTH_SECRET SAAS_INTERNAL_SECRET WHATSAPP_SHARED_SECRET LLM_API_KEY \
         OPENAI_API_KEY UPSTASH_REDIS_URL UPSTASH_REDIS_REST_TOKEN SENTRY_AUTH_TOKEN \
         META_APP_SECRET ADMIN_INIT_SECRET; do
  v="$(grep -E "^${k}=" saas/.env 2>/dev/null | cut -d= -f2-)"
  if [ -n "$v" ]; then echo "${k}=SET(${#v} chars)"; else echo "${k}=MISSING"; fi
done
```

---

## 7. `secrets.manifest.example` (commit this — names only)

```ini
# KEYONE secrets manifest — NAMES ONLY. Real values live in the vault (off-server).
# Tier legend: T1 master · T2 external · T5 infra/access
# ---- T1 platform master (env) ----
AUTH_SECRET            = vault://keyone/AUTH_SECRET          # PRESERVE verbatim; master enc key
SAAS_INTERNAL_SECRET   = vault://keyone/SAAS_INTERNAL_SECRET
WHATSAPP_SHARED_SECRET = vault://keyone/WHATSAPP_SHARED_SECRET
LLM_API_KEY            = vault://keyone/LLM_API_KEY          # == proxy API_SECRET_KEY
# ---- T2 external (env, optional) ----
OPENAI_API_KEY         = vault://keyone/OPENAI_API_KEY
UPSTASH_REDIS_URL      = vault://keyone/UPSTASH_REDIS_URL
UPSTASH_REDIS_REST_TOKEN = vault://keyone/UPSTASH_REDIS_REST_TOKEN
SENTRY_AUTH_TOKEN      = vault://keyone/SENTRY_AUTH_TOKEN
META_APP_SECRET        = vault://keyone/META_APP_SECRET      # only if META_CLOUD_ENABLED=1
# ---- T5 infra / access (vault only) ----
OFFSITE_AGE_PRIVATE_KEY = vault://keyone/offsite-age.key
OFFSITE_RCLONE_TOKEN    = vault://keyone/rclone-remote
VPS_SSH_KEY             = vault://keyone/vps-ssh
DNS_REGISTRAR_ACCESS    = vault://keyone/dns
GHCR_TOKEN             = vault://keyone/ghcr            # docker path only
# ---- T3 per-tenant (in DB, encrypted with AUTH_SECRET) — NOT stored here ----
# Bot.aiApiKeyEnc, Bot.metaAccessTokenEnc, TenantProviderCredential.*Enc,
# CommerceEmailProvider.secretEnc  → covered by DB backup + AUTH_SECRET
```

---

## 8. Outcome

- All recovery-critical secrets exist **off the VPS** (vault + encrypted off-site env backup).
- `AUTH_SECRET` is preserved and verified, so a DB restore actually works.
- Weak/shared secrets (`LLM_API_KEY` default, etc.) are rotated; `WHATSAPP_SHARED_SECRET` becomes required.
- Infra/access secrets (SSH, DNS, backup keys) are no longer tribal knowledge.

This lifts **Infrastructure independence** and **Disaster recovery readiness** substantially — see [READINESS_UPGRADE_PLAN](READINESS_UPGRADE_PLAN.md).
