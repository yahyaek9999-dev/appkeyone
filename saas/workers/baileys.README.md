# Baileys experimental worker

Phase 3A enables a limited, isolated Baileys runtime for controlled tests only.
It must not receive production customer traffic yet.

## Current state

- `ENABLE_BAILEYS=0` by default.
- `ENABLE_BAILEYS=1` enables only this isolated worker's experimental session APIs.
- The active provider router in `lib/messaging/index.ts` remains QR / Meta Cloud only.
- `lib/messaging/baileys-provider.ts` remains a typed stub returning `not_implemented`.
- Session ids must use the namespace `exp-*`.
- Auth storage is isolated via `BAILEYS_AUTH_DIR`.
- Logs are isolated via `BAILEYS_LOG_DIR`.
- The worker performs no Prisma writes, no order mutations, and no inbox routing.

## Safe test configuration

Example for a single-session test window:

- `ENABLE_BAILEYS=1`
- `BAILEYS_WORKER_HEALTH_PORT=3025`
- `BAILEYS_AUTH_DIR=C:/KEYONE/data/baileys-exp-sessions`
- `BAILEYS_LOG_DIR=C:/KEYONE/logs/baileys`
- `BAILEYS_MAX_SESSIONS=1`
- `BAILEYS_MAX_RECONNECTS=5`
- `BAILEYS_AUTORESTORE=1` only when testing restore-after-restart
- `BAILEYS_ALLOW_TEST_SEND=1` only when testing a known recipient
- `BAILEYS_TEST_RECIPIENT=201000000000` strongly recommended for send tests

## Endpoints

Public:

- `GET /health` — worker, memory, CPU, metrics, sessions summary
- `GET /ready` — readiness for the isolated worker only

Authenticated with `X-Internal-Secret`:

- `GET /sessions`
- `POST /sessions/exp-test/start`
- `GET /sessions/exp-test/status`
- `GET /sessions/exp-test/qr`
- `POST /sessions/exp-test/send`
- `POST /sessions/exp-test/stop`
- `DELETE /sessions/exp-test`

Outgoing test sends require this request body confirmation:

```json
{
  "to": "201000000000",
  "text": "KEYONE experimental Baileys test",
  "confirm": "experimental-test-send",
  "idempotencyKey": "manual-test-001"
}
```

## Safety rules

Do not route production users to Baileys until a later rollout adds and verifies:

- Admin UI opt-in per experimental business.
- Production-grade inbound bridge.
- Full message idempotency against DB ledger.
- Runtime metrics in admin diagnostics.
- Rollback plan back to current QR runtime.

## Verification

- `npm run verify:baileys`
- `BAILEYS_WORKER_URL=http://127.0.0.1:3025 npm run verify:baileys`

## Rollback

- Set `ENABLE_BAILEYS=0`.
- Stop the isolated Baileys worker process/service.
- Do not delete current QR sessions.
- Optional: archive `BAILEYS_AUTH_DIR` and `BAILEYS_LOG_DIR` for analysis.
