# Dependency Map (libs → hot path)

How code modules in `saas/lib/` and `saas/app/api/` depend on each other.

## Hot path dependency graph

```mermaid
graph LR
  incoming[app/api/whatsapp/incoming/route.ts]

  incoming --> llm[lib/llm.ts]
  llm --> provrouter[lib/providers/provider-router.ts]
  llm --> botprov[lib/providers/bot-provider.ts]
  botprov --> crypto[lib/crypto-util.ts]
  provrouter --> adapters[lib/providers/openai|gemini|claude|groq|openrouter]
  llm --> metrics[lib/metrics.ts]

  incoming --> llmcache[lib/llm-cache.ts]
  incoming --> wa[lib/wa.ts]
  incoming --> notify[lib/notify.ts]
  notify --> wa
  notify --> db[lib/db.ts]

  incoming --> insights[lib/insights.ts]
  insights --> sem[lib/semantic-match.ts]
  insights --> tz[lib/tz.ts]

  incoming --> humanize[lib/humanize.ts]
  incoming --> realism[lib/human-realism.ts]
  incoming --> memory[lib/memory.ts]
  memory --> llm
  incoming --> sem
  incoming --> sales[lib/sales-engine.ts]
  sales --> sem
  sales --> memorytype[memory MemoryFacts]
  incoming --> orderext[lib/order-extractor.ts]
  orderext --> sem
  incoming --> fastpath[lib/fast-path.ts]
  incoming --> kbcache[lib/kb-cache.ts]
  kbcache --> sem
  incoming --> safetyengine[lib/safety/engine.ts]
  safetyengine --> store[lib/safety/store.ts]
  safetyengine --> warmup[lib/safety/warmup.ts]
  safetyengine --> risk[lib/safety/risk.ts]
  safetyengine --> patterns[lib/safety/patterns.ts]
  safetyengine --> hv2[lib/safety/humanize-v2.ts]
  safetyengine --> killsw[lib/safety/kill-switch.ts]
  store --> db
  warmup --> store
  risk --> store
  killsw --> store
  incoming --> trust[lib/safety/trust.ts]
  trust --> db
  incoming --> phone[lib/phone.ts]
  incoming --> media[lib/media.ts]
  media --> llm
  incoming --> antiban[lib/anti-ban.ts]
  antiban -.legacy: only computePriority used.- incoming
```

## Module catalog

| Module | Pure? | DB? | LLM? | Notes |
|---|---|---|---|---|
| `lib/llm.ts` | mostly | no | yes | Concurrency + circuit breaker |
| `lib/llm-cache.ts` | no | yes | no | sha256 cache lookup |
| `lib/wa.ts` | no | no | no | HTTP wrapper to wa-service |
| `lib/notify.ts` | no | yes (audit) | no | Persistent failure logging |
| `lib/db.ts` | no | yes | no | Prisma singleton |
| `lib/insights.ts` | mostly | no | no | classify, scoreLead, working hours |
| `lib/semantic-match.ts` | yes | no | no | normalizeAr, cosine, jaccard, tokenize |
| `lib/tz.ts` | yes | no | no | Intl wrappers |
| `lib/humanize.ts` | yes | no | no | Reply variation |
| `lib/human-realism.ts` | yes | no | no | Anti-repetition |
| `lib/memory.ts` | no | yes | yes (bg) | Memory engine |
| `lib/sales-engine.ts` | yes | no | no | Signals + modes |
| `lib/order-extractor.ts` | yes | no | no | Regex pipeline |
| `lib/fast-path.ts` | yes | no | no | Priority + coalescing |
| `lib/kb-cache.ts` | mostly | yes (initial load) | no | Top-K retrieval |
| `lib/safety/engine.ts` | no | yes | no | Anti-ban entry |
| `lib/safety/store.ts` | no | yes | no | Persistent state |
| `lib/safety/warmup.ts` | no | yes | no | Stage limits |
| `lib/safety/risk.ts` | yes | no | no | Scoring |
| `lib/safety/patterns.ts` | yes | no | no | Spam-bot tells |
| `lib/safety/humanize-v2.ts` | yes | no | no | Final shaping |
| `lib/safety/kill-switch.ts` | no | yes | no | Emergency stop |
| `lib/safety/trust.ts` | no | yes | no | Per-contact trust |
| `lib/safety/broadcast.ts` | no | yes | no | (uncertain wiring) |
| `lib/safety/queue.ts` | no | yes | no | (uncertain wiring) |
| `lib/phone.ts` | yes | no | no | E.164 normalization |
| `lib/media.ts` | no | no | yes | Voice transcribe + image describe |
| `lib/crypto-util.ts` | yes | no | no | AES-256-GCM |
| `lib/metrics.ts` | no | yes | no | bump() counters |
| `lib/anti-ban.ts` | (legacy) | yes | no | computePriority still used |
| `lib/providers/*` | mostly | no | yes | Per-vendor adapters |

## External NPM dependencies

From `saas/package.json`:
- `next 14.2.18` — framework
- `@prisma/client 5.22.0` + `prisma` — ORM + CLI
- `bcryptjs 2.4.3` — password hashing
- `jose 5.9.6` — JWT
- `cheerio 1.0.0` — HTML parsing (knowledge import from URLs)
- `mammoth 1.8.0` — DOCX → text
- `pdf-parse 1.1.1` — PDF → text
- `clsx 2.1.1` + `tailwind-merge 2.5.4` — UI utility
- `lucide-react 0.460.0` — icons
- `zod 3.23.8` — runtime validation
- `react 18.3.1`, `react-dom 18.3.1`

From `whatsapp-service/package.json`:
- `whatsapp-web.js 1.26.0` — the gateway
- `express 4.21.1` — HTTP server
- `qrcode 1.5.4` — QR generation
- `dotenv 16.4.5` — env loader

## Circular dependencies to AVOID

These could cause subtle bugs:
- `lib/memory.ts` imports from `lib/llm.ts` → fine because memory runs background
- `lib/sales-engine.ts` imports type from `lib/memory.ts` → type-only, no cycle
- `lib/safety/engine.ts` imports from `lib/safety/store.ts` → tree-shaped, fine
- **`lib/llm.ts` must NOT import from any safety module.** The safety engine runs AFTER the LLM call to avoid this.

## API → lib mapping

| API route | Calls libs |
|---|---|
| `/api/whatsapp/incoming` | llm, llm-cache, wa, notify, insights, humanize, human-realism, memory, sales-engine, order-extractor, fast-path, kb-cache, anti-ban, safety/engine, safety/trust, phone, media, semantic-match, metrics |
| `/api/cron/broadcasts` | wa, llm, providers/bot-provider, db, prisma.safetyAudit |
| `/api/cron/follow-ups` | wa, llm, providers/bot-provider, db |
| `/api/cron/daily-report` | wa, daily-report/{aggregate,insights,format-ar}, tz |
| `/api/cron/llm-prewarm` | llm |
| `/api/broadcasts` | prisma.broadcast, .customer |
| `/api/working-hours` | prisma.bot, tz (validation) |
| `/api/settings/ai-provider/test` | providers/provider-router |
| `/api/inbox/...` | prisma reads + suggest-reply uses llm |
| `/api/orders/...` | prisma.order |
| `/api/knowledge/...` | prisma.document, knowledge-import |
