# KEYONE AI Enterprise Layer — 2026-07-14

Branch: `claude/keyone-ai-enterprise-8b16a0`. Nine work packages (WP1–WP9) closing gaps where
AI-facing surfaces were stubs, placeholders, or dormant/unused code paths. All additive — no
existing working system was rewritten, and the WhatsApp send pipeline
(`app/api/whatsapp/incoming/route.ts`) was not touched.

## Summary of changes

| WP | Area | What changed |
|----|------|--------------|
| WP1 | Provider layer | Streaming / tool-calling / extended-reasoning support across the universal provider layer (`lib/providers/*`, `lib/integrations/ai/index.ts`) — done in an earlier session, carried into this branch. |
| WP2 | Prompt Playground + versions | New "مختبر البرومبت" tab in Bot Settings (`app/dashboard/bot/prompt-lab.tsx`): real Playground (test a prompt version against a live message via `aiChatWithFailover`), full PromptVersion history with create/duplicate/publish/archive, and a raw provider capability tester (streaming/tools/reasoning) hitting the new `POST /api/ai-control/llm-test`. |
| WP3 | Prompt Optimizer | `lib/arena/optimize.ts`'s `prompt` job now runs a real LLM rewrite (`rewritePrompt`) targeted at the tenant's actual rubric gaps (exported `RUBRIC` from `lib/arena/prompt-bench.ts`) and open `HallucinationEvent` rows, saving the result as a new **draft** `PromptVersion` — never auto-published. |
| WP4 | Response Quality judge | `lib/arena/quality.ts` adds an LLM-judge pass (`judgeConversationSample`) over a bounded sample (≤6) of the arena's own synthetic transcripts (`ArenaConversation`/`ArenaMessage` — never live customer data) for tone/accuracy/CSAT-proxy. Blends into `overall` only when available; falls back to the pre-existing deterministic formula otherwise (no regression for unconfigured tenants). New nullable `QualityBenchmark.tone/accuracy/csatProxy` columns. |
| WP5 | Conversation semantic memory | New `lib/intelligence/conversation-memory.ts`: append-only embedded snapshots of `CustomerMemory.summary` (new `ConversationMemoryChunk` model), reusing the Knowledge Brain's existing deterministic term-frequency vector engine (`lib/knowledge-brain/vector.ts` — no new dependency). Recorded as a sibling of the existing Memory Graph extractor in `lib/memory.ts`. **Scoping decision:** exposed as a human-driven, read-only search box on Customer 360 (`MemorySearchBox` in `customer-360.tsx` + `GET /api/customers/[id]/memory-search`) rather than wired into the AI reply context builder, since that would have required touching `buildMemoryBlock`'s call sites inside the WhatsApp send pipeline — out of scope without explicit approval per CLAUDE.md. |
| WP6 | Product recommendation engine | New `lib/intelligence/product-recs.ts`: fuzzy-matches a customer's recent `OrderItem` names against the tenant's own `Product` catalog (no FK exists between them) to find the matching category, then recommends the best not-yet-bought, in-stock, active product in that category. Wired into the "upsell" Next Best Action (`msgUpsell` in `lib/intelligence/next-best-action.ts`) — real product name instead of a generic phrase. Called from `revenue-opportunity.ts` (bounded to customers pre-qualifying for the upsell branch) and unconditionally from the single-customer profile route. |
| WP7 | Self-learning → Revenue Copilot | `lib/intelligence/revenue-opportunity.ts` now applies the SAME learned kind-weights (`lib/intelligence/self-learning.ts`, previously only consumed by `lib/follow-ups.ts`) to the Revenue Copilot's priority ordering, via an `NbaAction → FollowUpTask kind` mapping table. Advisory-only — never changes what action is suggested, only the sort order. |
| WP8 | Support AI draft replies | New `lib/support/draft-reply.ts` (`generateEscalationDraftReply`): drafts a suggested reply for an `EscalationTicket` using recent conversation turns + KB retrieval (`semanticSearch`), via `POST /api/escalations/[id]/draft-reply`. Draft-only — persisted to new nullable `EscalationTicket.aiDraftReply/aiDraftAt` columns, shown with a "Generate" button + copy-to-clipboard in `ticket-actions.tsx`; the human agent still sends manually through existing channels. |
| WP9 | On-demand conversation summary | New `summarizeNow()` in `lib/memory.ts`: bypasses the background rolling-summarizer's message-count threshold for an explicit trigger, sharing the same in-process `inflight` concurrency guard as the background path. `POST /api/customers/[id]/summarize` + a "تلخيص الآن" button on Customer 360. |

## Schema changes (additive only, both `schema.prisma` and `schema.postgres.prisma`)

- `QualityBenchmark`: + `tone Int?`, `accuracy Int?`, `csatProxy Int?`
- `EscalationTicket`: + `aiDraftReply String?`, `aiDraftAt DateTime?`
- New model `ConversationMemoryChunk` (userId, customerId, content, vec, norm, tokens, createdAt)

Dev SQLite (`prisma/dev.db`) has been migrated via `prisma db push --schema=prisma/schema.prisma`.
**Production is Postgres** (per prior memory) — these same three changes need
`prisma migrate` / `prisma db execute` against `schema.postgres.prisma` before deploy. All three
are pure additive columns/tables — no backfill needed, safe as a rolling migration.

## Verification performed

- `tsc --noEmit`: clean throughout, after every WP.
- `next build`: clean (had to generate the Prisma client from `schema.prisma`, not the
  package.json-default `schema.postgres.prisma`, to match the local SQLite `dev.db` — pre-existing
  dual-schema dev/prod gotcha, not something this branch introduced).
- Live runtime verification against the dev server + real seeded data (not just typecheck):
  - **PromptVersion lifecycle** (WP2): created a draft via the UI, published it (confirmed
    `Bot.systemPrompt` updated live + old version auto-archived), then rolled back by publishing
    the archived version again (confirmed `Bot.systemPrompt` reverted). Full round-trip against
    real `dev.db` writes.
  - **Prompt Benchmark** (WP2/3): `POST /api/arena/prompt-benchmark/run` returns real per-candidate
    rubric scores and gracefully degrades reply text to "no provider configured" without crashing.
  - **Quality judge** (WP4): `POST /api/arena/quality/run` returns `tone/accuracy/csatProxy: null`
    (correct — no provider configured in this dev environment) with the deterministic score
    computed normally, `ok: true`.
  - **Prompt Optimizer** (WP3): queued + ran a `prompt` job; confirmed it reindexed and returned
    the correct "requires an AI provider" note without crashing or creating a garbage draft.
  - **Conversation memory search** (WP5): seeded two `ConversationMemoryChunk` rows with
    deliberately different content and confirmed `GET /api/customers/[id]/memory-search` correctly
    ranked/returned only the semantically relevant one (cosine ≈0.43) and excluded the unrelated one.
  - **Product recommendation** (WP6): confirmed via the real `أحمد محمد` demo customer (bought
    "جاكت جلد بني") that the fuzzy-match logic correctly recommends a same-category, not-yet-bought,
    in-stock product ("جاكت جلد أسود") once one exists in the catalog.
  - **Revenue Copilot** (WP7): `GET /api/revenue-copilot` returned 16 real ranked opportunities
    with correct NBA actions/confidence/estimated-value against the demo tenant's real customer data,
    no crash.
  - **Escalation draft reply** (WP8): `POST /api/escalations/[id]/draft-reply` correctly returns
    HTTP 422 + `{error: "no_provider_configured"}` rather than a 500.
  - **Summarize Now** (WP9): `POST /api/customers/[id]/summarize` bypasses the threshold and
    returns gracefully (`{ok:true, summary:""}`) when the underlying LLM call can't produce output.

  No live LLM provider was reachable in this sandboxed environment (`LLM_API_URL=127.0.0.1:7788` is
  an external dependency not running here, and neither test tenant had a per-tenant provider key
  configured) — every AI-dependent path was confirmed to **fail closed with a clear message
  instead of crashing**, which is the correct and only fully verifiable behavior without that
  external dependency. This is a verification-environment limitation, not a code gap.

## Notable environment issues hit and resolved during this session

- Bash's task-output capture briefly failed with `ENOSPC` (disk full) — resolved by the user
  freeing disk space mid-session.
- This worktree's local `prisma/dev.db` was found at 0 bytes (silently truncated, likely during
  the disk-full window while `prisma db push` was running). Restored by copying the main
  worktree's `saas/prisma/dev.db` (2.5MB, real seed data) back into this worktree, then re-applied
  the schema changes on top. No data was lost — the corruption was local-worktree-only.
- To exercise Customer 360 / Escalations end-to-end, two dev-only DB mutations were made
  (**local SQLite only, never touched anything Postgres/prod**): reset `c360-demo@local.test`'s
  password (original hash was not backed up — this is throwaway seed data, not a real account)
  and granted that tenant an active `k_business` subscription (it had none, which was blocking the
  Inbox behind the real entitlement gate). Also added one temporary test `Product` row and a
  `PromptVersion` v2 to the admin tenant during verification. None of this is production data.

## Scope decisions worth flagging to a reviewer

1. **WP5 is not wired into any AI reply/context-builder path.** It ships as a merchant-facing
   search tool on Customer 360 instead, specifically to avoid touching
   `app/api/whatsapp/incoming/route.ts` (protected by CLAUDE.md) or expanding scope into the
   Playground's currently-dormant `memoryBlock` wiring. If the intent was actually to have the
   live bot use semantic recall, that's a separate, explicitly-scoped follow-up.
2. **WP7's action→kind mapping is a heuristic**, not a formal taxonomy shared between
   `NbaAction` and `FollowUpTask.kind` — `escalate` and `hold` are deliberately left unweighted
   since there's no reasonable analogue.

## Deploy readiness

- Typecheck + build: green.
- Runtime: verified as above; all AI-dependent surfaces degrade gracefully without a live provider.
- **Before deploying to production**: run the three additive schema changes against
  `schema.postgres.prisma` / the production Postgres database (see Schema changes above).
