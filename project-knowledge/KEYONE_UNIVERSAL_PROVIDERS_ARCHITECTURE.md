# KEYONE — Universal Providers Architecture

**Status:** Design approved for phased implementation
**Date:** 2026-06-10
**Scope:** Per-tenant, multi-provider integration layer across AI, Speech-to-Text, Image AI, SMS, Email + a Conditional Notifications Engine, dashboards, RBAC, security, usage/cost monitoring.
**Guiding constraints (CLAUDE.md):** additive only · never rewrite working systems · never touch the WhatsApp **send** pipeline without approval · verify (typecheck + build + regression) before deploy · reports live here in `project-knowledge/`.

---

## 1. Principle: generalize what already exists — do not reinvent

KEYONE already ships the provider pattern in three working places. The universal layer is a **superset**, not a replacement. Every existing path keeps working; the new layer reads legacy config as a fallback so nothing regresses.

| Capability | What exists today | Reuse strategy |
|---|---|---|
| **AI text** | `lib/providers/*` bare-fetch router (OpenAI, Gemini, Claude, OpenRouter, Groq, + in-house `keyone`), retry/backoff, `testProviderKey`. Keys on `Bot.aiApiKeyEnc`. UI `/settings/ai-provider`. | Wrap router; **add Grok (xAI) + custom OpenAI-compatible**; add health, cross-provider failover, priority. |
| **Email** | `lib/commerce/email.ts` `sendCommerceEmail()` (SMTP, Resend, Brevo). `CommerceEmailProvider (userId,provider)`. `CommerceNotificationLog` delivery ledger. | Extend with **SendGrid, Mailgun, SES, Postmark**; route through universal vault + failover. |
| **STT (voice)** | `lib/media.ts` `transcribeAudio()` — OpenAI Whisper only, hardcoded. | Build speech router (**Whisper, Groq, Deepgram, AssemblyAI, Custom**); wire `transcribeAudio` to it, keep graceful fallback. |
| **Image** | `lib/media.ts` `describeImage()` — OpenAI Vision analyze only. | Build image router for **generate + analyze** (OpenAI Images, Gemini Vision, Claude Vision, OpenRouter, Replicate, Stability, Custom). |
| **SMS** | none | Greenfield router (**Twilio, Vonage, MessageBird, Plivo, Infobip, Custom**). |
| **Encryption** | `lib/crypto-util.ts` AES-256-GCM `encryptSecret/decryptSecret/maskSecret` (scrypt off `AUTH_SECRET`). | Reuse verbatim. |
| **SSRF** | `lib/ssrf.ts` `assertPublicHttpUrl()` | Reuse for every custom endpoint / SMTP host. |
| **Usage/cost** | `ProviderUsage` (per day/user/provider: calls, failures, in/out tokens, latency) + `bumpProvider()`; `getTenantCosts()` cost estimates; `MetricEvent` (`provider_fallback` kind already defined). | Reuse; namespace provider as `domain:provider` so the existing `[userId,day,provider,model]` unique + cost rollup keep working with **no schema break**. |
| **Automations** | `AutomationRule` (trigger/conditions/action/actionConfig), `evaluateAutomations`, throttle/caps, `AutomationActionLog`. `CommerceAutomation` + `dispatchCommerceAutomations`. Cron jobs. | Extend triggers/actions for the Conditional Notifications Engine. |
| **Audit / RBAC / Entitlement** | `auditCtx().writeAudit()` (redacts secrets); `requirePermission("settings")`; `pageGate/apiGate`; `lib/pricing/catalog.ts` capabilities. | Reuse; add a `providers` capability + audit actions. |
| **UI** | Server-page + client-form settings pattern; `nav-items.tsx` WORKSPACES; `lib/i18n` (ar/en, RTL); `EmptyState/Toast/ConfirmDialog/LiveBadge`; design tokens. | Reuse pattern for the 5 new provider pages. |

**Tenant key** is the owner's `User.id` everywhere (team members resolve to owner). Isolation is structural — every query is `where: { userId }`.

---

## 2. New code namespace

A new, isolated namespace so the working AI router and email sender are untouched:

```
lib/integrations/
  registry.ts            # domain + provider descriptors (auth fields, defaults, capabilities, pricing hints, needsEndpoint)
  vault.ts               # load/save/mask/decrypt TenantProviderCredential; legacy back-compat readers
  health.ts              # checkHealth(cred) -> ping adapter, persist status/lastError/lastCheckAt
  failover.ts            # resolveProviders(userId,domain) + runWithFailover(...) + graceful-disable result
  usage.ts               # recordProviderCall() -> bumpProvider(domain:provider) + ProviderCallLog
  types.ts               # shared domain types, ProviderDomain, GracefullyDisabled, results
  ai/        index.ts + adapters (wrap lib/providers; add grok.ts, custom.ts)
  speech/    index.ts + whisper.ts groq.ts deepgram.ts assemblyai.ts custom.ts
  image/     index.ts + openai.ts gemini.ts claude.ts openrouter.ts replicate.ts stability.ts custom.ts
  sms/       index.ts + twilio.ts vonage.ts messagebird.ts plivo.ts infobip.ts custom.ts
  email/     index.ts (wrap lib/commerce/email; add sendgrid.ts mailgun.ts ses.ts postmark.ts)
  notifications/ engine.ts (conditional rules), actions.ts
```

All adapters are **bare `fetch`** (no SDKs) with shared timeout + retry, mirroring `lib/providers`. Each adapter exports a `send/transcribe/generate/analyze/chat` + a `ping()` health probe.

---

## 3. Data model (additive — both `schema.prisma` and `schema.postgres.prisma`)

Portable types only (String for enums/JSON, Int, Boolean, DateTime). Mirrors `CommerceEmailProvider`.

### 3.1 `TenantProviderCredential` — the universal vault
```prisma
model TenantProviderCredential {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  domain      String                       // ai | speech | image | sms | email
  provider    String                       // openai | twilio | deepgram | sendgrid | ...
  enabled     Boolean  @default(true)
  priority    Int      @default(100)       // lower = tried first (failover order)
  label       String   @default("")        // user-friendly name
  secretEnc   String?                      // primary secret (API key / password / auth token)
  secret2Enc  String?                      // secondary secret (e.g. AWS secret, Twilio token vs SID)
  publicId    String   @default("")        // non-secret id (Account SID, AWS key id, from-number/region/domain)
  endpoint    String   @default("")        // custom base URL (SSRF-validated for *custom* + SMTP host)
  model       String   @default("")        // default model / voice
  configJson  String   @default("{}")      // provider-specific extras (fromEmail, fromName, region, senderId...)
  status      String   @default("unknown") // unknown | healthy | degraded | down
  lastCheckAt DateTime?
  lastError   String   @default("")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@unique([userId, domain, provider])
  @@index([userId, domain, enabled])
}
```

### 3.2 `ProviderCallLog` — append-only events for the dashboard "error logs" + recent activity
```prisma
model ProviderCallLog {
  id         String   @id @default(cuid())
  userId     String
  domain     String                        // ai | speech | image | sms | email
  provider   String
  operation  String                        // chat | transcribe | generate | analyze | send | health
  ok         Boolean  @default(true)
  status     Int      @default(0)          // upstream HTTP status (0 if network)
  latencyMs  Int      @default(0)
  error      String   @default("")         // redacted message (no secrets)
  failedOver Boolean  @default(false)      // true if this attempt triggered failover to next provider
  createdAt  DateTime @default(now())
  @@index([userId, domain, createdAt])
  @@index([userId, ok, createdAt])
}
```
(Pruned by an existing/added cron sweep; capped reads in UI. Aggregate cost/usage continues to use `ProviderUsage` via `bumpProvider("email:sendgrid", …)`.)

### 3.3 Conditional Notifications — extend the existing engine, no new core table needed
Reuse `AutomationRule` + `AutomationActionLog`. Add new **trigger** + **action** strings (Section 6). `actionConfig` JSON carries channel/template/threshold. Outbound deliveries land in `ProviderCallLog` (+ `CommerceNotificationLog` for order-scoped email/SMS to keep the existing ledger coherent).

> No `User` relation backfill issue: new relation arrays on `User` are additive and optional.

---

## 4. Resolve → Execute → Failover (the heart)

```ts
// failover.ts
type Attempt = { provider: string; ok: boolean; error?: string; status?: number };

resolveProviders(userId, domain): Promise<ResolvedProvider[]>
//  = enabled TenantProviderCredential rows for (userId,domain) sorted by priority
//    ⊕ legacy fallback (ai→Bot.aiApiKeyEnc; email→CommerceEmailProvider)
//    ⊕ platform env fallback (e.g. OPENAI_API_KEY) as last resort for media domains.

runWithFailover(userId, domain, op, { healthGate=true }):
  Promise<{ result } | { disabled: true; reason: "no_provider_configured" }>
//  iterate providers in priority order:
//    - skip status==="down" when healthGate (re-probe lazily if lastCheckAt stale)
//    - run op(adapter, cred); on success → recordProviderCall(ok) + return
//    - on RETRYABLE failure (408/429/5xx/network) → record, bump provider_fallback, try next
//    - on NON-retryable (401/403/400) → record, mark cred degraded, try next
//  if no provider configured at all → return { disabled:true } (NEVER throw → tenant-scoped graceful disable)
```

**Graceful per-tenant disable (Req 6):** callers treat `{disabled:true}` as "feature off for this tenant" — e.g. voice falls back to the existing Arabic placeholder; an email action is skipped + logged. One tenant lacking a key never affects another and never throws into a request path.

**Health checking (Req 1):** `health.checkHealth(cred)` runs the adapter's tiny `ping()` (≤5 tokens / HEAD / balance call), persists `status/lastError/lastCheckAt`. Invoked by the dashboard "Test" button, on save, and by a periodic `cron/provider-health` sweep.

**Usage tracking (Req 1):** every call → `recordProviderCall()` → `bumpProvider({ provider: "email:sendgrid", success, inputTokens, outputTokens, latencyMs })`. `getTenantCosts()` already rolls this into per-tenant USD via `KEYONE_PROVIDER_PRICES_JSON` (extended with new provider prices).

---

## 5. Domain adapter contracts

```ts
// ai      chat(messages, opts) -> { text, usage }           ; ping()
// speech  transcribe(audio, {mime, language?}) -> { text, language? } ; ping()
// image   generate(prompt, opts) -> { url|b64, ... }        ; analyze(image, prompt) -> { text } ; ping()
// sms     send({to, body, from?}) -> { id, status }         ; ping()  (+ delivery status webhook where supported)
// email   send({to, subject, html, text, from}) -> { id }   ; ping()
```
Custom providers (`*_custom`, SMTP host) **must** pass `assertPublicHttpUrl(endpoint)` before any fetch.

**Arabic / long-audio / auto-detect (Req 2):** speech adapters pass `language` when set, default to auto-detect; Deepgram/AssemblyAI handle long async audio (poll), Whisper/Groq sync ≤ size cap. The voice→text→AI pipeline = `transcribe()` → existing inbound classify/score → existing `chat()`.

---

## 6. Conditional Notifications Engine (Req 6)

Extend `lib/automations/constants.ts`:
- **+ triggers:** `order_value_gt`, `lead_qualified`, `customer_inactive_days`, `voice_message_received`.
- **+ actions:** `send_email`, `send_sms`, `transcribe_and_reply`.
- `actionConfig` JSON: `{ channel, providerOverride?, threshold?, days?, templateId?, subject?, body? }`.

Wiring (all additive, **inbound/cron only — never the WA send pipeline**):
- `order_value_gt` / `lead_qualified` → fire from existing commerce + scoring tails into `evaluateAutomations`.
- `customer_inactive_days` → new branch in `cron/automations` (reuses idle scan).
- `voice_message_received` / `transcribe_and_reply` → evaluated right after `transcribeAudio()` in `app/api/whatsapp/incoming` (decode point already exists).
- `send_email`/`send_sms` actions call the universal email/SMS service with failover; throttle + global daily cap + opt-out + subscription gates already enforced by the engine.

---

## 7. Dashboard (Req 7) — `Settings → Providers → {AI, Voice, Images, SMS, Email}`

One folder per domain under `app/dashboard/settings/providers/{ai,voice,images,sms,email}/`, each = server `page.tsx` (load masked creds via vault) + client form, reusing the AI-provider form pattern. Plus a shared **provider hub** `app/dashboard/settings/providers/page.tsx`.

Each page includes, per Req 7: **API key management** (add/rotate/delete, masked), **connection Test** (health), **usage statistics** (from ProviderUsage), **health status** badge (LiveBadge), **error logs** (ProviderCallLog), **cost estimates** (getTenantCosts slice), **priority ordering** (drag/number to set `priority`, drives failover).

APIs under `app/api/settings/providers/[domain]/` — `GET` (masked list + health + usage), `PUT`/`POST` (upsert, encrypt, audit), `DELETE`, `/test` (health probe), `/reorder` (priority). All `requirePermission("settings")` + rate-limit + audit + SSRF for custom endpoints.

Nav: add a "المزوّدون / Providers" group to `WORKSPACES[settings].items` and `SettingLink` cards. Gated by new `providers` capability (`apiGate("providers","settings")`) — default-on for existing tiers (non-regressive), positioned in catalog so free tier can be limited later via `FREE_TIER_ENFORCEMENT`.

**UX (Req 10):** RTL Arabic + English via `lib/i18n`, mobile responsive, loading/empty/error states, masked secrets, "save keys now" capture pattern, professional onboarding card per page.

---

## 8. Security (Req 9)
Encrypt every secret (AES-256-GCM) · mask in all GETs · never log raw (audit redactor) · RBAC `settings` gate · SSRF-validate custom endpoints/SMTP host · rate-limit mutations · per-action `AuditLog` (`settings.provider_changed`, `.provider_tested`, `.provider_deleted`, `.provider_reordered`) · **secret rotation** = overwrite `secretEnc` (PUT with new key); rotating `AUTH_SECRET` invalidates all (documented).

---

## 9. Migration & verification strategy
- Add the 2 models to **both** Prisma schemas; run `scripts/verify/schema-parity.js` (must pass) + `verify:rbac` route coverage.
- Apply via `prisma db push` to the worktree dev DB (memory: symlink node_modules+.env, copy dev.db) for end-to-end verification. **Do not** push to production DB in this work — stage for the normal deploy.
- Gate every phase on `npm run typecheck`-equivalent (`tsc`) + `npm run build` + relevant `verify:*` scripts before declaring done.
- No `db push --accept-data-loss`; purely additive tables.

---

## 10. Phased delivery
1. **Foundation** — schema (both) + parity, `registry/vault/health/failover/usage/types`, capability + audit actions, nav scaffold. Verify green.
2. **AI** — add Grok + custom OpenAI-compatible; wire `lib/llm` provider resolution to vault (additive, legacy fallback); AI provider dashboard upgrade (health/usage/priority). 
3. **Email** — add SendGrid/Mailgun/SES/Postmark to `lib/commerce/email`; route via vault+failover; Email providers dashboard.
4. **SMS** — greenfield adapters + service + dashboard; delivery tracking via ProviderCallLog/CommerceNotificationLog.
5. **Speech** — adapters + service; wire `transcribeAudio`; Voice dashboard; Arabic/auto-detect/long-audio.
6. **Image** — generate+analyze adapters + service; wire `describeImage`; Images dashboard.
7. **Conditional Notifications Engine** — new triggers/actions + wiring + rules UI.
8. **Hardening** — health cron, log-prune cron, cost prices, docs, regression sweep.

Each phase: additive, verified (tsc+build+verify), independently shippable.
