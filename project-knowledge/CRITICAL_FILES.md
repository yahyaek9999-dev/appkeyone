# Critical Files — risk-tiered map

When you're about to edit a file in this codebase, find it here first. The
tier tells you how much care to apply.

---

## 🔴 Tier 1 — DO NOT TOUCH without a plan + backup

These run on every production message or every broadcast send. A bug here
will affect every merchant immediately.

| File | What it does | Risk if you break it |
|---|---|---|
| `saas/app/api/whatsapp/incoming/route.ts` (874 LOC) | The hot path. Orchestrates every customer message. | Bot stops replying; quota / cache / safety bypassed |
| `saas/app/api/cron/broadcasts/route.ts` (207 LOC) | Broadcast cron worker. **Has atomic claim.** | Duplicate sends / merchant gets banned |
| `saas/lib/safety/engine.ts` | Safety engine entry point | Bot ban-risk explodes; kill switch may not engage |
| `saas/lib/safety/store.ts` | Persistent safety state | Counters lost; warmup confused |
| `saas/lib/safety/warmup.ts` | Stage limits (table + computeTargetStage) | Bot sends too much too fast |
| `saas/lib/safety/risk.ts` | Risk scoring | Wrong cooldowns / wrong kill triggers |
| `saas/lib/safety/kill-switch.ts` | Emergency stop logic | Cannot stop a misbehaving bot |
| `saas/lib/llm.ts` | LLM client, circuit breaker, concurrency | All replies fail / waste budget on dead provider |
| `saas/lib/providers/provider-router.ts` | External provider routing | Wrong provider used / silent fallback |
| `saas/lib/crypto-util.ts` | AES-256-GCM for provider keys | Keys leak or become unreadable |
| `saas/lib/notify.ts` | Merchant/admin alerts + audit | Failures silent or alerts to wrong number |
| `saas/lib/wa.ts` | Calls to whatsapp-service | All sends fail |
| `whatsapp-service/src/sessions.js` (488 LOC) | Per-merchant Chromium pool + LRU evict | Memory blowup / lost sessions |
| `saas/prisma/schema.prisma` | DB schema | Schema drift → P2021 errors |

**Rules:**
- Read the file end-to-end before editing.
- Read the relevant `project-knowledge/` doc.
- Make the smallest possible change.
- Always backup DB before deploying schema changes.

---

## 🟡 Tier 2 — handle with care

Important behavior but failures are recoverable or less impactful.

| File | What it does | Risk |
|---|---|---|
| `saas/lib/kb-cache.ts` | KB chunking + top-K retrieval | Bad replies (KB not injected) |
| `saas/lib/memory.ts` | Background memory extractor | Bot "forgets" customers |
| `saas/lib/sales-engine.ts` | Persuasion modes + signals | Sales mode wrong → boring replies |
| `saas/lib/order-extractor.ts` (281 LOC) | Regex order extraction | False orders / missed orders |
| `saas/lib/insights.ts` | Classify, scoreLead, working hours | Wrong intent / wrong lead score |
| `saas/lib/llm-cache.ts` | 24h response cache | Cache hits wrong content |
| `saas/lib/semantic-match.ts` | Cosine + Jaccard + tokenize | KB retrieval ranks wrong |
| `saas/lib/humanize.ts`, `human-realism.ts` | Reply variation | Replies feel robotic again |
| `saas/lib/safety/humanize-v2.ts` | Final shaping + delays | Anti-ban shaping bypassed |
| `saas/lib/metrics.ts` | `bump()` counters | Observability blind |
| `saas/app/api/cron/follow-ups/route.ts` | Follow-up cron | Customers not nudged |
| `saas/app/api/cron/daily-report/route.ts` | Daily report cron | Merchants don't get reports |
| `saas/app/api/working-hours/route.ts` | Working hours API | Bad save → schema drift |
| `saas/app/api/broadcasts/route.ts` | Broadcast creation | Bad audience materialization |
| `saas/lib/tz.ts` | Timezone helpers | All timezone features regress |
| `saas/lib/phone.ts` | E.164 normalization | Phone storage breaks |
| `whatsapp-service/src/index.js` | Gateway Express server | Internal auth bypass risk |

---

## 🟢 Tier 3 — relatively safe to iterate

UI, admin pages, settings forms. Bugs are scoped to the merchant who sees them.

| Directory | What |
|---|---|
| `saas/app/dashboard/*` | Merchant UI |
| `saas/app/admin/*` | Admin UI |
| `saas/app/(auth)/*` | Login/register pages |
| `saas/app/pricing/`, `privacy/`, `terms/` | Marketing pages |
| `saas/components/*` | Shared UI components |
| `saas/app/api/admin/*` | Admin reads (most) |
| `saas/app/api/inbox/*` | Inbox UI APIs |
| `saas/app/api/customers/*` | CRM reads |

**Rules:**
- Still test the change in dev before deploying.
- Don't introduce new external dependencies casually.

---

## Files that LOOK important but are partially deprecated

- `saas/lib/anti-ban.ts` — superseded by `lib/safety/engine.ts`. Only `computePriority()` is still imported. Treat as **read-only legacy**.
- `main.py` (root) — `mse-llm` service. Fragile by design. Don't add features here; prefer `lib/providers/` for new provider integrations.
- `Dockerfile`, `docker-compose.yml` — NOT used in production. The Windows VPS uses NSSM directly.

---

## Files that are auto-generated (don't hand-edit)

- `saas/.next/**` — Next.js build output
- `saas/node_modules/**` — npm dependencies
- `saas/prisma/prod.db`, `dev.db` — SQLite databases
- `saas/tsconfig.tsbuildinfo` — TypeScript incremental build cache
- `whatsapp-service/sessions/**` — WhatsApp local auth folders

---

## When you find a critical file not listed here

Add it! Open this file and put it in the right tier with one sentence about
risk. The point of this list is to grow with the system.
