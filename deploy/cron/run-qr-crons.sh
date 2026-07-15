#!/bin/bash
S="$(grep '^SAAS_INTERNAL_SECRET=' /home/ubuntu/keyone/.env | head -1 | cut -d= -f2- | tr -d '"'"'"'')"
# See run-hourly-crons.sh for why this now checks the HTTP status: this
# batch includes payments-reconcile (financial) and broadcasts, and ran
# every minute with zero visibility into failures before this change.
FAILED=0
for ep in qr-queue qr-scheduler outgoing-messages broadcasts payments-reconcile; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 55 -X POST "http://127.0.0.1:3000/api/cron/$ep" -H "x-internal-secret: $S")"
  if [ "$CODE" != "200" ]; then
    echo "[cron] FAILED: $ep -> HTTP ${CODE:-no response}" >&2
    FAILED=1
  fi
done
exit "$FAILED"
