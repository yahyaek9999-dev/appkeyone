# Baileys experimental worker scaffold

This is Phase 3 preparation only. It must not receive production traffic yet.

## Current state

- `ENABLE_BAILEYS=0` by default.
- `workers/baileys.worker.js` starts a dormant health process only.
- `lib/messaging/baileys-provider.ts` is a typed stub returning `not_implemented`.
- The active provider router in `lib/messaging/index.ts` is unchanged and still resolves only QR / Meta Cloud.

## Safety rules

Do not enable `ENABLE_BAILEYS=1` in production until a later controlled rollout adds:

- Baileys dependency and auth persistence.
- Isolated session directory.
- Reconnect engine.
- Message idempotency / duplicate prevention.
- Runtime metrics wired into admin diagnostics.
- Rollback plan back to current QR runtime.

## Health endpoint

If manually started for future local testing:

- `npm run worker:baileys`
- `GET http://127.0.0.1:3025/health` returns process status.
- `GET http://127.0.0.1:3025/ready` returns `503` intentionally while routing is inactive.
