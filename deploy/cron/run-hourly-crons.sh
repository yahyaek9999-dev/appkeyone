#!/bin/bash
S="$(grep '^SAAS_INTERNAL_SECRET=' /home/ubuntu/keyone/.env | head -1 | cut -d= -f2- | tr -d '"')"
for ep in trial-expiry abandoned-cart daily-report automations follow-ups meta meta-webhook-processor meta-quality-monitor meta-template-sync catalog-sync product-affinity provider-maintenance incident-scan llm-prewarm brain-learning credits-monthly brain-credits-monthly meta-cost; do
  curl -s -m 55 -X POST "http://127.0.0.1:3000/api/cron/$ep" -H "x-internal-secret: $S" >/dev/null 2>&1
done
