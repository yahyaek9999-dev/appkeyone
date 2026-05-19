# KEYONE Scaling Progress — Phase 1 Stabilization

## VPS Production State (2026-05-19)
- mse-saas: RUNNING (Next.js 14.2.18, port 3000)
- mse-wa: RUNNING (whatsapp-web.js, port 3001)
- mse-caddy: RUNNING (reverse proxy)
- DB: SQLite, healthy (4ms latency)
- Health: OK, uptime stable

## Known Issues Found
1. **Server Action errors in logs** — "Failed to find Server Action 'x'/'true'"
   - Cause: stale client cache after deployment, NOT code bug
   - Fix: clear `.next/cache` on deploy + set proper cache headers
2. **Login "not working"** — HTTP-level login works (200/307)
   - Likely: stale browser cache showing old JS bundle
   - Fix: force cache bust on deploy
3. **`sharp` not installed** — image optimization warning
   - Fix: `npm i sharp`

## Phase 1 Tasks
- [ ] 1.1 Fix deploy cache clearing (delete .next/cache before build)
- [ ] 1.2 Install sharp for image optimization
- [ ] 1.3 Add runtime startup logging
- [ ] 1.4 Add reconnect metrics endpoint to whatsapp-service
- [ ] 1.5 Verify order dedup (externalSource+externalOrderId unique)
- [ ] 1.6 Verify suggestions error handling
- [ ] 1.7 Add health endpoint improvements (version hash)
- [ ] 1.8 Mobile dashboard verification
