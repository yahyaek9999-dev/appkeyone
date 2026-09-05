# Production cron — `keyone-qrcron.timer` + `keyone-hourlycron.timer`

Brought into version control 2026-07-12/13 after discovering these existed
ONLY on the server, with no source-of-truth copy anywhere — a server rebuild
would have silently lost all scheduled background work.

## Background: the migration gap

`app/api/cron/` had **22** endpoints at the time of this migration (now **24**
— endpoints added since, including `ai-catalog-guard`, are wired into the
scripts below as they ship). Most of their own header comments say
things like *"Triggered by a scheduled task on the VPS"* — the retired
Windows VPS's Task Scheduler. When production moved to this AWS Linux box,
only `qr-queue`/`qr-scheduler` got a replacement (`keyone-qrcron.timer`).
**19 endpoints were never wired to anything on the new box** — no crontab, no
systemd timer, nothing. Confirmed via `systemctl list-timers --all` (only
`keyone-qrcron.timer` existed) and `crontab -l` (empty, both users).

Real, live impact found from this gap:
- `outgoing-messages` — 8 real customer WhatsApp messages stuck `queued` 97
  minutes (fixed 2026-07-12, see below).
- `broadcasts` — a real campaign (`title: "حملة: عملاء باردون"`, 8 recipients)
  had been stuck `status:"queued"` since **2026-07-04** (9 days). Its
  `template` field was just `"."` — too ambiguous to let auto-send to real
  phone numbers as a side effect of this fix, so it was **canceled** via the
  real `PATCH /api/broadcasts/[id] {action:"cancel"}` API before wiring the
  cron (the customer can recreate a real campaign; irreversible sends aren't
  worth the risk of firing stale/test-looking content).
- `payments-reconcile` — the safety-net sweep for the wallet/Stripe/Paymob
  webhook flow (re-credits any paid-but-webhook-never-arrived transaction)
  had never run once in production.
- The rest (`trial-expiry`, `abandoned-cart`, `daily-report`, `automations`,
  `meta*`, `catalog-sync`, `product-affinity`, `provider-maintenance`,
  `incident-scan`, `llm-prewarm`, `brain-learning`, `credits-monthly`,
  `brain-credits-monthly`, `meta-cost`) are lower urgency — several are
  flag-gated off in the current `.env` (`WALLET_BILLING_ENABLED`,
  `BRAIN_MONTHLY_CREDITS_ENABLED`, `BROADCAST_MONTHLY_CREDITS_ENABLED` are all
  unset, so those specific ones no-op regardless) — but they were clearly
  intended to run, so they're now wired hourly rather than left orphaned.

## What runs, and how often

**`keyone-qrcron.timer` — every 60s** (time-critical, designed for this
cadence per their own header comments):
```
qr-queue  qr-scheduler  outgoing-messages  broadcasts  payments-reconcile
```

**`keyone-hourlycron.timer` — every 3600s** (everything else that was
orphaned; hourly is a safe conservative default — none of these need
sub-hourly precision, several no-op harmlessly when their feature flag is
off):
```
trial-expiry  abandoned-cart  daily-report  automations  follow-ups  meta
meta-webhook-processor  meta-quality-monitor  meta-template-sync
catalog-sync  product-affinity  provider-maintenance  incident-scan
llm-prewarm  brain-learning  credits-monthly  brain-credits-monthly  meta-cost
ai-catalog-guard
```
(`ai-catalog-guard` added 2026-07-14 — scans recent assistant replies against
the tenant's real product catalog for hallucinated prices.)

Both scripts POST `x-internal-secret`-authenticated requests to
`127.0.0.1:3000/api/cron/<name>` — same auth guard (`checkInternalSecret`,
fail-closed) every route already uses.

## Redeploy after a server rebuild

```bash
scp -i ~/Downloads/1.pem deploy/cron/run-qr-crons.sh deploy/cron/run-hourly-crons.sh ubuntu@16.171.230.84:/home/ubuntu/
ssh -i ~/Downloads/1.pem ubuntu@16.171.230.84 'chmod +x /home/ubuntu/run-qr-crons.sh /home/ubuntu/run-hourly-crons.sh'
# recreate all four systemd units from systemd-unit-files.txt at
# /etc/systemd/system/keyone-{qrcron,hourlycron}.{service,timer}, then:
ssh -i ~/Downloads/1.pem ubuntu@16.171.230.84 \
  'sudo systemctl daemon-reload && sudo systemctl enable --now keyone-qrcron.timer keyone-hourlycron.timer'
```

## Verify it's actually running

```bash
ssh ubuntu@16.171.230.84 'systemctl list-timers keyone-qrcron.timer keyone-hourlycron.timer'
ssh ubuntu@16.171.230.84 'curl -s http://127.0.0.1:3000/api/cron/outgoing-messages'   # GET = health only, no drain
```
`GET /api/ready` on the public app also surfaces `outgoing_queue` health —
`"status":"warn"` with a growing `staleQueued`/`oldestQueuedAgeSec` means the
60s timer has stopped firing (or the app can't reach it) and needs attention.

## If you add a new `app/api/cron/*` endpoint

It will **not** run automatically. Add it to one of the two scripts above
(pick 60s vs hourly based on its own header comment's suggested cadence), redeploy
per the "Redeploy after a server rebuild" section, and note it in this file.
