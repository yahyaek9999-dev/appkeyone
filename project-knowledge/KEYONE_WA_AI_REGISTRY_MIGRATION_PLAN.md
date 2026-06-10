# KEYONE — WhatsApp AI Reply → Provider Registry Migration (Implementation Plan, rev.3)

**Status:** PLAN ONLY — no code, no deploy. **Date:** 2026-06-10.
**Goal:** route the live WhatsApp AI reply through the tenant provider registry (vault) with failover — **safely and minimally**. Not building a feature-flag subsystem.
**rev.3 changes:** rollout/toggle uses **no schema** — global kill-switch via env (`scaling-flags`); per-tenant control is intrinsic (vault credential existence); tenant canary allowlist deferred. Fallback order (rev.2): tenant chain → legacy → KeyOne last.

## Constraints (all honored)
1. WhatsApp send pipeline unchanged — route produces the reply **string** only; delivery stays in `whatsapp-service` (Baileys). ✅
2. Bot behavior unchanged — prompt/persona/knowledge/sales/realism/humanize/memory/cache run **upstream**. ✅
3. No UI changes. ✅
4. **No schema changes** — no SiteConfig columns, no new tables. Rollout uses existing storage/signals only. ✅
5. No deploy (plan).

## 0. Rollout controls — existing storage only (no schema)
Re-evaluated, ranked:
- **A. Existing config storage** — ❌ only `Plan.featureFlags` (per-plan entitlements from `catalog.ts`, not global). No general app-config store.
- **B. Provider settings storage** — ✅ **per-tenant control is intrinsic.** `runWithFailover(userId,"ai")`→`loadEnabledResolved`→`no_provider_configured` when a tenant has no enabled vault AI credential → auto-legacy. "Enabled for tenant" = "tenant configured AI providers". Zero storage, reversible by disabling the credential.
- **C. Admin settings (`SiteConfig`)** — ❌ typed singleton, no flexible field.
- **D. Env flag** — ✅ **global kill-switch only.** `lib/scaling-flags.ts` pattern (`process.env[key]==="1"`).

**Decision (v1):** global kill-switch = **D** (`WA_AI_REGISTRY_ENABLED`, default OFF); per-tenant = **B** (intrinsic); canary allowlist = **deferred**.

## 1. Current architecture map
```
/api/whatsapp/incoming/route.ts
  buildMessages()                                                    [870]
  reply = llmChat(msgs, { provider: botProviderOverride(bot), … })   [901-905]  ← LEGACY single provider
        └ chat(): external single → runExternalChat (throws on fail, NO failover); keyone → in-house cluster
  catch → canned error string                                        [906-909]
  return { reply } → whatsapp-service sends via Baileys              [1179 → sessions.js:1033]
```

## 2. Target architecture map (KeyOne is the FINAL layer)
```
route.ts: reply = (await generateBotReply({ userId, bot, messages, temperature })).text
          [catch + cache + return {reply} → Baileys send : ALL UNCHANGED]

generateBotReply():
  if (! scalingFlags.waAiRegistry)                              // GLOBAL kill-switch (env, default OFF)
      -> chat({ provider: botProviderOverride(bot) })           // OFF = exact legacy (byte-identical)

  // ----- TENANT-OWNED CHAIN : one runWithFailover call (failover + usage P4 + health P5) -----
  // Per-tenant gating is INTRINSIC: zero vault AI creds => disabled => legacy/KeyOne below.
  runWithFailover(userId,"ai", p => runAiChat(p, messages, …), { appendLegacy: () => legacyResolved(bot) })
     order:  vault#1 -> vault#2 -> vault#3 -> ... -> LEGACY(Bot.aiProvider)
     each:   recordProviderCall -> ProviderUsage "ai:<prov>" + ProviderCallLog  [P4]
             setHealth(credId, healthy|degraded|down) for vault creds           [P5]
     ok -> return { text, source:"vault"|"legacy", provider }

  // ----- KEYONE : FINAL FALLBACK ONLY (no tenant providers OR all failed) -----
  -> chat({})                                                   // in-house keyone (breaker/multi-URL/semaphore)
```
**Fallback order:** `Vault P1 → Vault P2 → Vault P3 → … → Legacy Bot config → KeyOne (last resort)`, via one `runWithFailover` + its `appendLegacy` hook (de-dupes a provider in both, vault winning). KeyOne hit only after all tenant-owned keys are exhausted → **maximizes tenant usage, minimizes KeyOne cost.**

`legacyResolved(bot)` = `ResolvedProvider[]` from `botProviderOverride(bot)` (known provider, decrypted key, `credId:null`); `[]` for keyone-default bots.

### Priority mapping (all reused, already built + tested — no new failover/log/health code)
| Req | Mechanism |
|---|---|
| Vault selection + failover | `runWithFailover(userId,"ai", runAiChat)` — `loadEnabledResolved` priority order, incl `custom` |
| Legacy as last tenant tier | `appendLegacy: () => legacyResolved(bot)` |
| KeyOne final fallback | `disabled` → `chat({})` in-house |
| P4 usage logging | `runWithFailover→recordProviderCall→bumpProvider("ai:<prov>")` + `ProviderCallLog` (vault **and** legacy) |
| P5 health tracking | `runWithFailover→setHealth(credId,…)` (vault creds; legacy has none → correct) |

## 3. Runtime toggle (no schema)
- **Global on/off:** `lib/scaling-flags.ts` → `get waAiRegistry()` reads `WA_AI_REGISTRY_ENABLED` (default OFF). Enable: set `=1` + restart; disable: unset/`0` + restart.
- **Per-tenant on/off (instant, no restart):** intrinsic — a tenant is on the registry iff they have an enabled vault AI credential; they self-disable by removing/disabling it in the providers dashboard.
- **Canary allowlist:** deferred to a future feature-flag system (out of scope for v1).

## 4. Exact files affected (no schema)
| File | Change |
|---|---|
| **NEW** `lib/integrations/ai/reply.ts` | `generateBotReply` (returns `{text, source, provider, attempts}`), `legacyResolved`; emits the 4 outcome counters |
| `lib/scaling-flags.ts` | add `get waAiRegistry()` (env `WA_AI_REGISTRY_ENABLED`) |
| `lib/integrations/usage.ts` | in `recordProviderCall`, on failure classify status → bump per-error-class metric (timeout/quota/auth/failure). Generic, additive |
| `lib/metrics.ts` | document the new `kind` strings (comment only; `bump()` already accepts any string) |
| `app/api/whatsapp/incoming/route.ts` | line **901-905** → `generateBotReply(...)` + import; attach `source` to the existing `recordUsage` metadata + Sentry breadcrumb. Keep try/catch + cache unchanged |
| **UNCHANGED** | `lib/llm.ts` (`chat()`), `lib/providers/*`, `whatsapp-service/*`, **prisma schema**, all UI, providers dashboard. Aux calls (837, 984) stay on legacy for v1 |

## 4b. Observability & Safety (added requirement — no schema)
**(1) Source path exposed internally.** `generateBotReply` returns `source: "registry" | "legacy" | "keyone"`. The route writes it to the existing `recordUsage(...,{ kind:"ai", metadata:{ source, provider } })` ledger row (internal, not customer-facing) + a Sentry breadcrumb. Never shown to the customer.

**(2) Fallback transition logging.** Already captured per attempt by `ProviderCallLog` (domain, provider, `status`, redacted `error`, `failedOver`). The status encodes the class — **timeout** (408/abort→0), **quota** (429), **auth** (401/403), **failure** (other). Added: `recordProviderCall` bumps an explicit class metric on each failed attempt — `provider_timeout` · `provider_quota` · `provider_auth_err` · `provider_failure`.

**(3) Outcome counters** (via existing `bump(kind,userId)` → `MetricEvent`, visible in `/admin/metrics`):
- `registry_success` — vault provider served the reply
- `registry_failover` — reply required ≥1 failover transition (`attempts > 1`)
- `legacy_fallback` — legacy `Bot.aiProvider` tier served the reply
- `keyone_fallback` — KeyOne in-house served the reply (measures KeyOne dependency / cost)

**(4) Safety invariants (enforced + commented in code):** never remove the legacy path · never remove `Bot.aiProvider` support · never remove `Settings → AI Provider`. Legacy is a permanent fallback tier; the flag-OFF path is pure legacy.

**(5) Success-criteria instrumentation:**
- *Existing tenants zero change* → flag OFF default + intrinsic gating; assert `registry_*`/`legacy_fallback`/`keyone_fallback` are flat for tenants without vault creds.
- *New provider-enabled tenants auto-use registry* → `registry_success` rises as tenants configure providers.
- *KeyOne fallback rate measurable* → `keyone_fallback` counter ÷ total replies, trackable in `/admin/metrics`; expected to **drop** as tenant providers are adopted.

## 5. Backward compatibility
- **Flag OFF (initial deploy):** every tenant → `chat({ provider: botProviderOverride(bot) })` = **byte-identical to today.**
- **Flag ON, tenant with no vault AI creds:** intrinsic disable → legacy/keyone → identical to today.
- **Flag ON, vault-configured tenant:** new chain (opt-in by configuring the dashboard).
- Old `Bot.aiProvider` + `Settings → AI Provider` stay authoritative for the legacy tier — **no config migration.** `/api/chat` unchanged.

## 6. Risk assessment
- **Blast radius:** reply text-generation only. **Send pipeline untouched.** Prompt/behavior upstream/untouched.
- **Mitigations:** chain always ends at KeyOne; route's try/catch → canned message; env kill-switch; OFF = legacy.
- **Perf:** when ON, +1 indexed `loadEnabledResolved` + AES decrypt per message → mitigate with 30–60s per-`userId` resolved-providers cache (invalidate on credential write).
- **Intentional behavior deltas:** (a) tenant external providers run via `runAiChat`, not `chat()` → no keyone semaphore/coalesce (acceptable; external QPS is their own); (b) a failing legacy/vault provider now cascades to KeyOne instead of the canned error (required by "KeyOne final fallback").
- **Usage double-count:** none — each call logged once. Subscription ledger (route.ts:1006) unchanged.
- **Severity:** MEDIUM, well-contained.

## 7. Rollback strategy (no schema)
1. **Global kill-switch:** `WA_AI_REGISTRY_ENABLED=0` + restart → all tenants → pure legacy.
2. **Per-tenant (instant, no restart):** tenant disables/removes vault AI providers → reverts immediately (intrinsic).
3. **Soft rollback (built-in):** every tenant-provider failure cascades to KeyOne — path can't hard-fail the bot.
4. **Code rollback:** revert the route call-site commit + redeploy; new file is additive.

> Accepted trade-offs vs a DB flag: global toggle needs a **restart**; **no fine-grained canary** (deferred). Soft-fallback + intrinsic per-tenant self-disable keep v1 safe.

## 8. Rollout & verification (implementation pass)
1. Gates: `tsc`, `next build`, `verify:schema-parity` (no schema change → trivially passes), `verify:rbac` (no new mutating route).
2. Node integration test of `generateBotReply`: (a) vault bad key → legacy bad key → KeyOne reply (assert ProviderCallLog + health `down`); (b) vault empty + legacy → legacy; (c) no config → KeyOne; (d) flag OFF → legacy regardless of vault.
3. Deploy with flag **OFF** (zero change) → enable for a pilot by (i) `=1`+restart and (ii) ensuring only the pilot tenant has vault AI providers configured → send WA test message → verify reply + ProviderCallLog + health + ProviderUsage → broaden by onboarding more tenants' provider config; watch KeyOne call share **drop**.

## 9. Out of scope
WhatsApp send pipeline · bot prompt/behavior · any UI · schema/migrations · canary allowlist subsystem · SMS/Image-generation gaps · `/api/chat`.

## 10. Change size
~1 new lib file (~140 lines) + 1 `scaling-flags` getter + ~3 edited route lines (+2 optional). **Zero** schema, **zero** changes to `chat()` and the send pipeline.
