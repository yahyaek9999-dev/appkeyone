#!/bin/bash
S="$(grep '^SAAS_INTERNAL_SECRET=' /home/ubuntu/keyone/.env | head -1 | cut -d= -f2- | tr -d '"')"
# curl without -f treats every HTTP response (incl. 4xx/5xx) as success, and
# without checking the exit code a timeout/connection-refused is silent too
# — this loop previously always exited 0, so `systemctl status` and
# `journalctl -p err` never showed a failing cron endpoint no matter what
# happened. Capture the HTTP code (or curl's own error) per endpoint and
# fail the unit if any endpoint didn't return 200, so failures are visible
# in `journalctl -u keyone-hourlycron.service` / `systemctl --failed`.
FAILED=0
for ep in trial-expiry abandoned-cart daily-report automations follow-ups meta meta-webhook-processor meta-quality-monitor meta-template-sync catalog-sync product-affinity provider-maintenance incident-scan llm-prewarm brain-learning credits-monthly brain-credits-monthly meta-cost ai-catalog-guard; do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 55 -X POST "http://127.0.0.1:3000/api/cron/$ep" -H "x-internal-secret: $S")"
  if [ "$CODE" != "200" ]; then
    echo "[cron] FAILED: $ep -> HTTP ${CODE:-no response}" >&2
    FAILED=1
  fi
done
exit "$FAILED"
