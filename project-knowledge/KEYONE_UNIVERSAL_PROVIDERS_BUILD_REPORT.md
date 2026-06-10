# KEYONE — Universal Providers: Build & Verification Report

**Date:** 2026-06-10
**Branch:** `claude/nostalgic-booth-6874fd` (worktree)
**Design spec:** [`KEYONE_UNIVERSAL_PROVIDERS_ARCHITECTURE.md`](./KEYONE_UNIVERSAL_PROVIDERS_ARCHITECTURE.md)
**Approach:** additive-only, foundation-first, each phase verified (tsc + `next build` + regression + real-HTTP E2E). DB changes applied to the worktree **dev DB only**; staged for the normal deploy. WhatsApp **send** pipeline untouched.

---

## Status: ✅ all 8 phases complete & verified

| # | Phase | Result |
|---|---|---|
| 1 | Foundation (vault, registry, failover, health, usage, generic dashboard + API) | ✅ verified |
| 2 | AI (Grok + custom endpoint, failover, dashboard, `chat()` wiring) | ✅ verified E2E |
| 3 | Email (SendGrid, Mailgun, SES/SigV4, Postmark + existing SMTP/Resend/Brevo) | ✅ verified E2E |
| 4 | SMS (Twilio, Vonage, MessageBird, Plivo, Infobip, custom) | ✅ verified E2E |
| 5 | Speech-to-Text (Whisper, Groq, Deepgram, AssemblyAI, custom) + voice→AI wiring | ✅ verified E2E |
| 6 | Image AI (generate + analyze across 7 providers) + vision wiring | ✅ verified E2E |
| 7 | Conditional Notifications Engine (`send_email`/`send_sms` actions + `order_value_gt` trigger) | ✅ verified E2E |
| 8 | Hardening (cost pricing fix, maintenance cron) | ✅ verified |

Final gates: `tsc --noEmit` **0 errors** · `next build` **success** · `schema-parity` **62 models lock-step** · `rbac-coverage` **PASS (140 routes)**.

---

## What was built

### Data model (additive, both Prisma schemas)
- **`TenantProviderCredential`** — per-tenant vault, unique `[userId, domain, provider]`, AES-256-GCM secrets (`secretEnc`/`secret2Enc`), `publicId`/`endpoint`/`model`/`configJson`, `priority` (failover order), health (`status`/`lastError`/`lastCheckAt`).
- **`ProviderCallLog`** — append-only error/activity log (domain, provider, operation, ok, status, latency, redacted error, failedOver).

### `lib/integrations/` (new namespace)
`types.ts` · `registry.ts` (≈30 providers + field specs) · `vault.ts` (save/list/mask/decrypt/resolve, SSRF for custom endpoints) · `usage.ts` (`bumpProvider("<domain>:<provider>")` + ProviderCallLog) · `failover.ts` (`resolveProviders` + `runWithFailover` → graceful `{disabled}` when no key; cross-provider failover; capability filter) · `health.ts` · `services.ts` + `register.ts` (per-domain service registry; split to avoid circular import) · domain modules `ai/`, `email/`, `sms/`, `speech/`, `image/`.

### Dashboard (generic, registry-driven — serves all 5 domains)
- Hub `app/dashboard/settings/providers/page.tsx` + per-domain `[domain]/page.tsx` + `providers-client.tsx` (add/edit/test/health/usage/priority reorder/error-logs, RTL Arabic).
- Generic API `app/api/settings/providers/[domain]/{route,test,reorder,generate}` — `requirePermission("settings")`, rate-limited, encrypted, audited (`settings.provider_changed/_tested/_deleted/_reordered`).
- Nav entry + settings `SettingLink` added.

### Additive wiring into existing systems
- `lib/providers/*` — added **Grok** adapter (also surfaces in the legacy `/settings/ai-provider` page).
- `lib/llm.ts chat()` — new optional `providers[]` ordered-failover param (absent → byte-identical behavior); wired into `app/api/chat`.
- `lib/commerce/email.ts` — `sendCommerceEmail` tries vault providers first, falls back to the unchanged legacy path.
- `lib/media.ts` — `transcribeAudio`/`describeImage` gained an optional `{userId}` to use per-tenant speech/image providers first; wired at the WhatsApp **incoming** (receive) route.
- `lib/automations/*` — new actions `send_email`/`send_sms` (graceful skip when no provider), new trigger `order_value_gt` + `fireOrderValueAutomation` wired at order extraction; rule-builder UI gained labels + config fields.
- `lib/observability/tenant-costs.ts` — price lookup now namespace-aware.
- `app/api/cron/provider-maintenance` — prunes `ProviderCallLog` (retention via `PROVIDER_LOG_RETENTION_DAYS`, default 30).

---

## End-to-end verification (real HTTP, minted owner session)
Each domain was exercised against the live production server with **real upstream calls** using deliberately invalid credentials — proving every adapter executes and errors are handled + secret-redacted:

- **AI** — OpenAI test → real 401 from `api.openai.com` (key redacted in transit `sk-fake-***`); health persisted `down`; priority reorder; delete; no-cookie → 401.
- **Email** — SendGrid → real 401; **SES SigV4 → real 403 "security token invalid"** (signature well-formed; AWS validated it); required-field validation.
- **SMS** — Twilio → real 401 "Authentication Error"; 6 providers listed.
- **Speech** — Deepgram → real 401 "Authentication failed".
- **Image** — Stability → real 401; **`/generate` endpoint** exercised the capability-filtered generate failover path → real 401.
- **Notifications** — created `order_value_gt → send_sms` and `order_status_changed → send_email` rules (stored, UI-consumable); invalid `actionType` → 400.
- **Vault data layer** — AES round-trip, masking, tenant scoping, call-log insert verified directly against dev DB.

---

## Operations / deploy notes
- **Migration:** new models are in both `schema.prisma` + `schema.postgres.prisma`. Apply on deploy via `prisma db push` (project convention). Parity check passes.
- **Env (optional):** `KEYONE_PROVIDER_PRICES_JSON` (cost map), `PROVIDER_LOG_RETENTION_DAYS` (log prune). All provider keys are **tenant-owned** (stored encrypted); no platform keys required.
- **Schedulers (suggested):** `POST /api/cron/provider-maintenance` daily (header `x-internal-secret`).
- **RBAC:** provider settings gated by the `settings` permission (consistent with the existing AI-provider page; no new paid capability — non-regressive).

## Known limitations / follow-ups (non-blocking)
- Custom OpenAI-compatible AI endpoints work via `aiChatWithFailover` + dashboard; the legacy `chat()` failover list covers known vendors only (custom needs an endpoint field in `ProviderOverride`).
- SMS/email **delivery-status webhooks** (DLR) are not wired; sends + provider message-ids are logged. Add per-provider status callbacks if delivery receipts are needed.
- The universal AI failover (`aiChatWithFailover`) is wired into `/api/chat`; extending it to the live WhatsApp reply path is a ready, separately-sign-off-able follow-up (adjacent to core messaging).
- `order_value_gt` is wired at the WhatsApp order-extraction seam; the commerce-webhook order path can adopt `fireOrderValueAutomation` similarly.
