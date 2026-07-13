# Production cron — `keyone-qrcron.timer`

Brought into version control 2026-07-12 after discovering it existed ONLY on
the server (`/home/ubuntu/run-qr-crons.sh` + two systemd units), with no
source-of-truth copy anywhere — a server rebuild would have silently lost it.

## What it does

Every 60s (`OnUnitActiveSec=60`), `run-qr-crons.sh` POSTs
`x-internal-secret`-authenticated requests to three internal cron endpoints
on the local Next.js app (`127.0.0.1:3000`):

- `POST /api/cron/qr-queue`
- `POST /api/cron/qr-scheduler`
- `POST /api/cron/outgoing-messages` — **added 2026-07-12**. Before this, the
  durable outgoing WhatsApp message queue (`lib/messaging/outgoing-queue.ts`,
  `WaMessage` table) was drained **only** by the small
  `event === "connected"` recovery batch inside
  `app/api/whatsapp/incoming/route.ts` (`batchSize: 5, perUserLimit: 2`) —
  there was no regular sweep. Found via a real, live signal:
  `GET /api/ready` showed `"outgoing_queue":{"status":"warn"}`, and 8 real
  customer messages had been stuck `queued` for 97 minutes. Confirmed fixed
  live: `queued: 8 → 0` immediately after wiring this in.

## Redeploy after a server rebuild

```bash
scp -i ~/Downloads/keyone.pem deploy/cron/run-qr-crons.sh ubuntu@13.63.79.43:/home/ubuntu/run-qr-crons.sh
ssh -i ~/Downloads/keyone.pem ubuntu@13.63.79.43 'chmod +x /home/ubuntu/run-qr-crons.sh'
# recreate the two systemd units from keyone-qrcron.unit-files.txt at
# /etc/systemd/system/keyone-qrcron.{service,timer}, then:
ssh -i ~/Downloads/keyone.pem ubuntu@13.63.79.43 'sudo systemctl daemon-reload && sudo systemctl enable --now keyone-qrcron.timer'
```

## Verify it's actually running

```bash
ssh ubuntu@13.63.79.43 'systemctl list-timers keyone-qrcron.timer'   # next/last fire time
ssh ubuntu@13.63.79.43 'curl -s http://127.0.0.1:3000/api/cron/outgoing-messages'   # GET = health only, no drain
```
`GET /api/ready` on the public app also surfaces `outgoing_queue` health —
`"status":"warn"` with a growing `staleQueued`/`oldestQueuedAgeSec` means this
timer has stopped firing (or the app can't reach it) and needs attention.
