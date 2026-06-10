# KEYONE — Live WhatsApp Provider Flow: Architecture Map & Gap Analysis (2026-06-10)

Read-only audit. Evidence = `file:line`. No code changed, nothing deployed. Production runs commit `c69e89a`.

## A. Incoming WhatsApp TEXT — end-to-end (evidence)
```
WhatsApp customer
  → whatsapp-service/src/sessions.js (Baileys) POSTs webhook → /api/whatsapp/incoming
  → app/api/whatsapp/incoming/route.ts:
      • buildMessages(...)                                  [route.ts:870]
      • reply = llmChat(messages, { provider: botProviderOverride(bot) })  [route.ts:901-905]   ← AI execution
      • humanizeReply(...) / applyRealism(...)              [route.ts:942,953]
      • persist assistant Message                          [route.ts:964]
      • return NextResponse.json({ reply: outboundText })  [route.ts:1179-1181]
  → whatsapp-service/src/sessions.js:1033 (text: result.reply) → Baileys send → customer   ← DELIVERY (protected send pipeline)
```
- **Provider selection** = `botProviderOverride(bot)` (`lib/providers/bot-provider.ts`) → reads **legacy `Bot.aiProvider` / `Bot.aiApiKeyEnc`** (single per-bot provider) or `null` → in-house `keyone`. Uses `provider:` (singular), **NOT** `providers:` (the failover array).
- **AI execution** = `lib/llm.chat()`: keyone → in-house cluster w/ circuit-breaker + multi-URL round-robin; external single provider → `runExternalChat` (one provider, **re-throws on failure**).
- **On failure** (`route.ts:906-909`): caught → canned Arabic error string. **No cross-provider failover, no keyone fallback for the external path.**

## B. Incoming WhatsApp VOICE — end-to-end (evidence)
```
voice msg → route.ts:289 mediaType=="voice"
  → transcribeAudio(base64, mime, { userId: user.id })     [route.ts:291]
      → lib/media.ts:34  loadEnabledResolved(userId,"speech")
         • vault has providers → transcribeWithFailover(...) [media.ts:38]  ← SPEECH registry + FAILOVER (LIVE)
         • else → platform Whisper (OPENAI_API_KEY)          [media.ts:46-]
  → messageText → (same as TEXT flow: buildMessages → llmChat legacy → reply → return → Baileys send)
```
- Speech transcription **does** use the universal registry with failover when the tenant configured ≥1 speech provider; otherwise platform Whisper. AI step afterwards is the **same legacy path** as text.
- Image messages mirror this: `describeImage(..., {userId})` `route.ts:297` → `analyzeImageWithFailover` `media.ts:98` (registry + failover, LIVE).

## C. Provider failover — live status per domain (evidence)
| Domain | Failover code | Wired into a LIVE workflow? | Evidence |
|---|---|---|---|
| **AI** | `chat({providers})` + `runFailoverChat` (`lib/llm.ts:372`); `aiChatWithFailover`; `resolveAiOverrides` | **NO for WhatsApp.** Only `/api/chat` (dashboard playground + agent chat-view). `aiChatWithFailover` has **0 callers**. | `resolveAiOverrides` → only `app/api/chat/route.ts:224`; WA path uses `botProviderOverride` `route.ts:903` |
| **Speech** | `transcribeWithFailover` | **YES** — live in WhatsApp voice | `lib/media.ts:38` ← `route.ts:291` |
| **Image (analyze)** | `analyzeImageWithFailover` | **YES** — live in WhatsApp image | `lib/media.ts:98` ← `route.ts:297` |
| **Image (generate)** | `generateImageWithFailover` | **NO** — only a manual settings endpoint | `app/api/settings/providers/[domain]/generate/route.ts:37` |
| **SMS** | `sendSmsWithFailover` | **Opt-in only** — fires only if a merchant creates a `send_sms` automation rule | `lib/automations/engine.ts:283` |
| **Email** | `sendEmailWithFailover` | **YES** — live in escalations, commerce order notifications, daily reports (via `sendCommerceEmail` vault-first) + opt-in `send_email` rule | `lib/commerce/email.ts:142`; callers `lib/escalation.ts:193`, `lib/commerce/notifications.ts:175`, `lib/daily-report/delivery.ts:45`; rule action `lib/automations/engine.ts:267` |

## D. Which path does the production WhatsApp reply pipeline use? → **LEGACY AI path**
- **Legacy AI path: YES** — `route.ts:901-905` `llmChat(messages, { provider: botProviderOverride(bot) })`; `botProviderOverride` reads `Bot.aiProvider`/`aiApiKeyEnc`. Same legacy path for the sales intent classifier (`route.ts:835-837`) and topic micro-update (`route.ts:984`).
- **Provider registry path: NO** — the incoming route does not import `resolveAiOverrides`/`aiChatWithFailover`; it never reads `TenantProviderCredential` for AI.
- **Provider failover path: NO** — `providers:` is never passed in the WA path; `runFailoverChat` is unreachable from WhatsApp.
- ⚠️ **Consequence:** AI providers configured in the **new** `Settings → Providers → AI` vault are used **only** by the dashboard playground / agent chat-view — **not** by the customer's actual WhatsApp bot, which still uses the **old** `Settings → AI Provider` (single per-bot) config.

## E. Gap analysis — provider features in code but NOT connected to a live production workflow
1. **AI vault → WhatsApp reply.** `resolveAiOverrides`/`chat({providers})` wired only to `/api/chat` (dashboard-internal: `customers/[id]/chat-view.tsx:29`, `playground/playground-ui.tsx:25`). `aiChatWithFailover` exported with **0 callers**. The dominant customer workflow (WhatsApp) ignores the AI vault + failover.
2. **Custom OpenAI-compatible AI endpoint.** Only routable via the registry path (`aiChatWithFailover`, 0 callers); legacy `chat()` cannot route `custom`. Configurable + testable in the dashboard, used by no live flow.
3. **Image generation.** `generateImageWithFailover` reachable only from the manual `/api/settings/providers/images/generate` endpoint. No automated workflow (no marketing/product-image generation, no inbound/outbound trigger).
4. **SMS (all of it).** `sendSmsWithFailover` reachable only via the `send_sms` automation action — fires only with a merchant-authored rule. No built-in SMS workflow; no inbound SMS; no delivery-status (DLR) webhooks.
5. **Conditional-notification actions `send_email`/`send_sms`.** Opt-in only (need merchant rules). `order_value_gt` trigger is wired (`route.ts` order-extraction → `fireOrderValueAutomation`) but does nothing without a matching rule.
6. **`provider-maintenance` cron.** Route exists (`/api/cron/provider-maintenance`) but is **not scheduled** — no `deploy/install-*-task.ps1` references it (grep empty). `ProviderCallLog` pruning never runs automatically.

### Connected & live (for contrast)
Speech (WA voice), Image-analyze (WA image), Email failover (escalations / commerce notifications / daily reports), and the full providers Dashboard/API/vault/health/usage (merchants can configure + test all 5 domains).

## F. Headline
The universal providers system is **fully built and live for Speech, Image-analysis, and Email**, and **fully configurable** for all 5 domains in the dashboard — but the **#1 customer workflow (WhatsApp text/voice AI replies) still runs entirely on the legacy single-provider AI path**. Closing gap #1 (route the WhatsApp reply through `resolveAiOverrides`/`chat({providers})` with keyone fallback) is the single highest-impact connection remaining, and it touches the reply-generation path adjacent to the protected WhatsApp send pipeline — so it warrants explicit sign-off.
