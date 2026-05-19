# KEYONE verification suite

Phase 2 foundation: production-safe verification commands for KEYONE runtime confidence.

## Safety contract

- Read-only by default.
- No WhatsApp sends.
- No email sends.
- No webhook mutation.
- No queue drains.
- Synthetic flows are in-memory dry runs only.

## Commands

- `npm run verify:system`
- `npm run verify:whatsapp`
- `npm run verify:orders`
- `npm run verify:realtime`
- `npm run verify:commerce`
- `npm run verify:email`
- `npm run verify:mobile`
- `npm run verify:baileys`
- `npm run verify:all`

Append `-- --json` to any command for structured JSON output.

## Optional live endpoint checks

Set these when running against a live/staging app:

- `KEYONE_VERIFY_BASE_URL=https://your-keyone-host`
- `KEYONE_VERIFY_AUTH_COOKIE='keyone_session=...'` for authenticated realtime JSON verification
- `KEYONE_VERIFY_HTTP_TIMEOUT_MS=5000`
- `KEYONE_VERIFY_RSS_WARN_MB=1200`
- `BAILEYS_WORKER_URL=http://127.0.0.1:3025` for isolated Baileys worker health checks

## Interpreting output

- `pass`: safe check completed successfully.
- `warn`: non-blocking production-readiness concern or unavailable local service.
- `skip`: optional live/browser context was not supplied.
- `fail`: regression or unsafe state; command exits non-zero.

Warnings for missing local commerce columns/tables usually mean the local SQLite database has not been pushed to the latest Prisma schema. Run `npm run db:push` only in the intended environment after taking a backup.
