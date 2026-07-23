# Production Incident — 2026-07-23: slow/lost AI replies, dead notifications

**Status: fixed + deployed (`38b4177`) — one merchant-side action still required (see Remaining).**

## Symptoms reported

Slow AI replies, sometimes no reply at all while WhatsApp shows connected,
merchant order/safety notifications gone, quality worse, runtime inconsistent.

## What the evidence showed (measured, not assumed)

Production box 13.63.79.43, tenant `cmr2hexck000y11b671zphkb2` (the operator's
own account, `connectionMode=bridge`, bridge `cmrm4dd490009gzcbl7zezdm4` on
DESKTOP-QW8E9T).

1. **Dual-instance eviction war (primary root cause).** `BridgeLogLine` showed
   TWO interleaved websocket counters (ws#36xx and ws#37xx) from the same
   machine reconnecting every ~2s — two Bridge processes (e.g. system service +
   manually-started copy, different `KEYONE_BRIDGE_HOME`s so the same-HOME lock
   can't see each other) sharing one bridge identity. Each connect evicts the
   other's socket at the gateway. Confirmed live post-deploy: 8 re-registrations
   within 19s of gateway start.
   - AI replies are pushed synchronously to the socket the inbound arrived on;
     generation takes 10-50s, the socket is gone by then → reply dropped
     silently ("AI never replies" while the Dashboard shows the reply).
   - Outbound queue drains hit whichever twin is registered; the twin without
     the WhatsApp session fails `getNumberId failed: t` (502) or the window has
     no socket at all → `no_bridge_online` (409).
2. **Every queued outbound ever failed.** `WaMessage`: 24 rows lifetime, **0
   sent**. 18 were merchant alerts to `01097767079`.
3. **Local-format alert number can never deliver.** Both send paths resolve
   JIDs via `getNumberId(digits)` with no country normalization; a trunk-0
   national number ("010…") is unresolvable → "number not registered". The
   merchant's connected number is stored international ("2012…").
4. **AI latency is the provider, not the pipeline.** `ProviderUsage`:
   OpenRouter **free** model `nvidia/nemotron-3-super-120b-a12b:free` averaged
   **15.3s (07-21), 16.8s (07-15), 21.4s (07-16)** per call; earlier free model
   `openai/gpt-oss-120b:free` had **13/13 failed calls on 07-11**; the in-house
   `keyone` engine died 07-03 (5/5 failures) and was removed. DB reply-latency
   (user msg → assistant msg persisted) measured 5-18s typical, 41-55s spikes —
   dominated by the LLM call. Quick-reply/cache paths were 0.01-0.03s, so the
   platform layer itself is fast.
5. **Order-created notification never existed.** The comment "Notify the
   merchant when the order looks confident enough" has had no code under it
   since the first commit; the only order alert was the keyword-triggered one.
6. Cron timers, DB, queue-drain health: all fine. Wallet gates: OFF, fail-open
   (the "رصيد المحفظة صفر" audits are Meta-billing shadow alerts, they block
   nothing). Order classifier: verify suite FP-rate 0.0%; 1 auto-order in 7d,
   no false-positive evidence.

## Fixes deployed (`38b4177`, all additive; lib/messaging/* + wa-service untouched)

1. **bridge-gateway/index.js** — reply delivery resilience: push the AI reply
   to the *current* live socket (not the stale inbound socket), retry once on a
   re-picked socket after 4s, and on final failure hand the reply to the
   Cloud's durable outgoing queue instead of dropping it. Plus a dual-instance
   detector (≥8 registrations/5min → critical `SafetyAudit`, category
   `bridge`, throttled 30min) so this failure mode is visible in the Safety
   feed instead of silent.
2. **saas/app/api/internal/bridge-reply-fallback/route.ts** (new) —
   internal-secret-guarded; enqueues the orphaned reply through the EXISTING
   `enqueueOutboundText` export with 5-min-bucket idempotency + user-scoped
   opportunistic drain.
3. **saas/lib/notify.ts** — `normalizeAlertPhone()`: trunk-0 national numbers
   are prefixed with the country code derived from the bot's own connected
   number (e.g. `01097767079` → `201097767079`); international input passes
   through. Applied in `notifyMerchant` + `notifyAdmin`.
4. **saas/app/api/whatsapp/incoming/route.ts** — implemented the order-created
   merchant notification (🛒 with items/total), gated on `alertEnabled` +
   notify phone, at most one per customer per 6h (existing pending-order
   dedup).

## Verification

- Local: `tsc --noEmit` clean; `next build` clean; `verify/run.js` PASS;
  wallet invariants 33/33 PASS; order-extraction FP 0.0%; schema parity OK;
  `node --check` on gateway.
- Production: deploy verified (`DEPLOYED_COMMIT` matches, `/api/health` ok,
  all 3 services active); fallback endpoint 401 unauthenticated / 400 on bad
  body; `/api/ready` all-ok; dual-instance audit row created at 15:02:58 from
  live traffic; no new warnings in `keyone.service` journal.

## Remaining issues (cannot be fixed server-side)

1. **Close the duplicate Bridge on DESKTOP-QW8E9T** (the machine runs two
   copies — check: Windows Services *and* a manually-started
   `keyone-bridge`/tray copy; stop one, or reboot and start only the service).
   Until then, first-attempt replies still race the socket churn — they now
   recover via retry+queue, but latency suffers. The Safety feed now shows a
   critical alert explaining exactly this.
2. **LLM provider is a free-tier model** — 15-21s average generation and past
   full-failure days are inherent to `:free` OpenRouter routing, and quality
   is capped by the free model. Recommendation: set a paid model in
   Dashboard → AI settings (e.g. `openai/gpt-4o-mini` on the same OpenRouter
   key with billing, or Anthropic/Groq) — expected 1-3s generation.
3. `whatsapp-service` (co-located QR) holds 0 sessions — expected while the
   tenant is in bridge mode; nothing to fix.
4. Not done (needs explicit approval — protected send pipeline): classifying
   `no_bridge_online`/`ack_timeout`/`bridge_socket_closed` as fast-retry (60s)
   in `lib/messaging/outgoing-queue.ts` — today they fall into the generic
   5-min retry bucket.

## Verification appendix — 2026-07-23 15:12-15:35 UTC (post-deploy proof run)

### Single-instance check: FAILED — duplicate process still active on DESKTOP-QW8E9T
- Bridge identities (DB): exactly 1 non-revoked (`cmrm4dd49…`, v1.0.10); 5 older rows all revoked.
- Gateway registry: `bridges:1` at sample; OS-level `ss` on :3002 caught a churn gap (0 external WS at that instant).
- Heartbeat fresh (2.1s age) — whichever twin holds the socket heartbeats.
- **Reconnect frequency: 167 link-ups/30min (~1 per 11s), peaking 71/min; still 162/10min during the test.** A healthy single instance connects once and stays.
- Dup-instance detector fired at 15:02:58 (8 re-registrations in 19s).

### 20-conversation pipeline test (synthetic inbound via internal webhook, real LLM, test data deleted after)
- **Inbound→outbound: 20/20 exactly 1:1** (DB pairing; 20 distinct providerMessageIds).
- **Dropped: 0. Duplicates: 0** — deliberate replay of message #20's providerMessageId rejected in 14ms (`duplicate_event`), no extra rows.
- **Latency (webhook receive → reply generated, incl. LLM): avg 10.40s, median 9.23s, P95 14.86s, P99=max 36.59s** (n=20). Humanize adds preDelay 0.4-3.3s + typing 2.2-13.7s by design.
- **LLM quality: 18/20 real replies, 2/20 provider-failure fallbacks** ("خلل تقني مؤقت") — OpenRouter free tier collapsed at the end of the burst. Confirms the paid-model recommendation.
- **Order classifier: 16 casual questions → 0 orders; explicit confirmation flow → exactly 1 pending order.** 0 false anger/escalation audits.
- **Notifications: both alert types fired** (keyword order alert + the newly implemented order-created alert) **to the normalized number 201097767079** (fix proven — was impossible-to-route `01097767079`). **Delivery still blocked by the duplicate-instance war**: each queue attempt hit the twin with the dead Chromium (`detached Frame`); rows are retrying (attempts ≤2/5), not lost.
- Queue: 0 new failed rows; 0 stale.
- Cleanup: test customer/conversation/messages/order/ledger/memory deleted; Subscription counters restored to exact baseline (31/56); the 2 real merchant alerts left queued intentionally.

### Verdict
Cloud pipeline: healthy and proven. **Incident NOT fully resolved** — two criteria fail, both outside server control: (1) the second Bridge process must be closed on DESKTOP-QW8E9T (notification delivery + first-attempt reply reliability remain hostage to the socket war), (2) the free-tier LLM model fails under burst and stalls up to 36s (switch to a paid model).
