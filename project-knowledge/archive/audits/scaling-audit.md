# Scaling Audit

> Companion to `SCALING_PLAN.md`. This file is the empirical assessment of
> current capacity. Updated 2026-05-17.

## Current load

(Approximate — from observed metrics + logs)

- **Active merchants:** ~3
- **Daily messages across all merchants:** ~50-200 inbound + ~50-200 outbound
- **Daily LLM calls:** ~150 (with cache hits, real LLM calls ~80)
- **Concurrent WA sessions:** 1-2 typical
- **DB size:** ~250 KB

## Headroom on current 8GB VPS

| Resource | Used | Capacity | Headroom |
|---|---|---|---|
| RAM | ~3 GB (3 services + 2 Chromiums) | 8 GB | ~5 GB |
| CPU | ~10% avg | 100% | huge |
| Disk | ~5 GB | ~80 GB | huge |
| WA sessions | 2 | 12 (`WA_MAX_SESSIONS`) | 10 |
| LLM concurrency | <1 avg | 3 | 2 |
| SQLite writes | <1/sec | implicit serialize | comfortable |

**Conclusion:** at current load, we are at ~25% of single-VPS capacity. Can comfortably onboard another 8-10 merchants without infra changes.

## Hard ceilings on current architecture

| Resource | Ceiling | What triggers it |
|---|---|---|
| WA sessions | ~12 (`WA_MAX_SESSIONS`), RAM-bound | Adding merchant #13 evicts LRU |
| Concurrent LLM calls (keyone) | ~3-5 | mse-llm Chromium OOMs above this |
| Concurrent SQLite writes | ~5/sec sustained | Visible as `SQLITE_BUSY` errors |
| Storage | 80 GB on current VPS | Plenty of room |
| Network bandwidth | 1 Gbps (IONOS spec) | Plenty |

**The binding constraint is RAM** — Chromium per merchant + Node + mse-llm + OS already consumes 4-5 GB at typical load.

## Bottleneck order (as load grows)

1. **RAM** (Chromium sessions) — hits first
2. **mse-llm latency** — high variance from Playwright; switching to external providers removes this
3. **SQLite writes** — eventually
4. **CPU** — last; even 100 sessions don't max CPU on a modest server

## Scaling steps and triggers

See `SCALING_PLAN.md` for the full staged plan. Quick reference:

| Trigger | Action |
|---|---|
| Merchant #10 onboarded | Upgrade VPS to 16 GB |
| `mse-llm.err.log` shows session expiry frequently | Migrate all merchants to `openai` provider |
| p99 reply time > 5s | Investigate LLM provider or DB contention |
| `SQLITE_BUSY` errors in logs | Begin Postgres migration plan |
| 30+ active merchants | Move WA service to a second VPS |
| 50+ active merchants | Postgres + Redis + horizontal SaaS |

## "What if" scenarios

### What if a merchant blasts a 5000-recipient broadcast?

- Broadcast worker sends 20/min → 5000 takes ~4 hours
- Meanwhile, the hot path stays responsive (broadcast worker doesn't compete for LLM semaphore if `personalize=false`)
- If `personalize=true` → ~5000 LLM calls over 4 hours → ~21 calls/min, manageable
- Risk: WhatsApp may flag the account if the merchant is in `warmup.stage="day1"`. The broadcast cron doesn't currently enforce warmup limits. **Gap.**

### What if mse-llm dies during peak?

- All `keyone` merchants get fallback string
- Circuit breaker opens after a few failures → no 30s waits per message
- Merchant experience: bot is "broken" until mse-llm is restarted
- Mitigation today: migrate critical merchants to external providers

### What if SQLite locks up?

- Prisma retries automatically with backoff
- Some requests will see 500s during contention
- Recovery: restart mse-saas (releases the WAL lock)
- Long-term fix: Postgres

### What if 30 merchants WhatsApp simultaneously?

- WA service is single-threaded Node event loop
- whatsapp-web.js uses Puppeteer (CPU-bound on parse)
- At ~100 messages/sec aggregate, Node may stall
- Mitigation: shard wa-service by userId across multiple processes

## Cost projections

| Stage | Active merchants | VPS cost | LLM cost (OpenAI) | Total |
|---|---|---|---|---|
| Now | 3 | $30/mo | ~$20/mo | **$50/mo** |
| Next | 10 | $60/mo | ~$130/mo | **$190/mo** |
| Stage 2 | 30 | $120/mo (16GB) | ~$400/mo | **$520/mo** |
| Stage 3 | 50 | $300/mo (2 nodes + Postgres) | ~$650/mo | **$950/mo** |
| Stage 4 | 100 | $700/mo | ~$1300/mo | **$2000/mo** |

**Per-merchant cost** drops from ~$17 (early) to ~$20 (later, dominated by LLM). **Revenue per merchant** should comfortably exceed $50/mo to maintain margins.

## Empirical metrics to track monthly

```sql
-- Active merchants this month
SELECT COUNT(DISTINCT userId) FROM ApiCall WHERE createdAt > date('now', '-30 days');

-- Total LLM calls this month
SELECT SUM(count) FROM MetricEvent
WHERE kind = 'llm_call' AND day > date('now', '-30 days');

-- LLM failure ratio
SELECT
  SUM(CASE WHEN kind='llm_fail' THEN count ELSE 0 END) * 100.0 /
  NULLIF(SUM(CASE WHEN kind='llm_call' THEN count ELSE 0 END), 0) AS fail_pct
FROM MetricEvent WHERE day > date('now', '-30 days');

-- Per-provider distribution
SELECT provider, SUM(calls) FROM ProviderUsage
WHERE day > date('now', '-30 days') GROUP BY provider;

-- Daily message volume per merchant (top 10)
SELECT userId, SUM(count) FROM MetricEvent
WHERE kind = 'llm_call' AND day > date('now', '-30 days')
GROUP BY userId ORDER BY 2 DESC LIMIT 10;
```

Save these as a monthly review checklist. If `fail_pct > 5%` → investigate.
If a single merchant uses >50% of LLM calls → review their setup.
