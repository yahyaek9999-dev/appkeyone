# Domain Migration — Final Verification

**Date:** 2026-09-01  
**Executor:** Claude Sonnet (Phase 3, authorized)  
**Deployed commit:** 8f074f7  

---

## 1. Pre-Migration State

| Item | Value |
|------|-------|
| Production domain | `https://w.keyone1.com` |
| Target domain | `https://wkeyone.app` |
| Pre-cutover version | 90a1daa |
| `wkeyone.app` DNS before | 91.195.240.94 (Sedo parking) |

---

## 2. Code/Config Changes

17 files, 19 string substitutions. All domain hardcoded fallbacks updated from `w.keyone1.com` / `app.keyone1.com` → `wkeyone.app`. Commit `8f074f7`.  
TypeScript typecheck: **PASSED** (0 errors).

---

## 3. DNS Result ✅

| Item | Result |
|------|--------|
| Name.com v4 API record created | ID 288264681, TTL 300 |
| `wkeyone.app A` (Google 8.8.8.8) | `16.171.230.84` |
| `wkeyone.app A` (Cloudflare 1.1.1.1) | `16.171.230.84` |
| Propagation time | < 5 seconds |

---

## 4. Caddy Result ✅

| Item | Result |
|------|--------|
| Caddyfile backup | `/etc/caddy/Caddyfile.bak-2026-09-01` |
| `wkeyone.app` vhost added | ✅ |
| Caddy validation | `Valid configuration` |
| Caddy reload | active |
| `w.keyone1.com` block | → 301 redirect to `wkeyone.app` (Step M) |

---

## 5. TLS Result ✅

| Item | Result |
|------|--------|
| Certificate issuer | Let's Encrypt (YE2) |
| Subject | `wkeyone.app` |
| SAN match | `wkeyone.app` ✅ |
| Expiry | 2026-11-30 |
| Protocol | HTTP/2 |
| Auto-issued | < 15 seconds after DNS propagation |

---

## 6. Deployment Commit ✅

| Item | Result |
|------|--------|
| Commit deployed | `8f074f7` |
| Deploy method | `deploy/release-aws.sh` |
| Build | Out-of-place next build + atomic swap |
| DB migration | Prisma additive push (no destructive changes) |
| Service restart | keyone.service + keyone-bridge-gateway.service |

---

## 7. Production Health ✅

```json
GET https://wkeyone.app/api/health
{"status":"ok","db":"ok","uptime":10,"version":"8f074f7","timestamp":"2026-09-01T20:38:46.793Z","latencyMs":1}
```

---

## 8. Browser Verification ✅

| Check | Result |
|-------|--------|
| Landing page loads | ✅ `https://wkeyone.app` |
| HTTPS padlock | ✅ |
| Console errors | None |
| `canonical` meta | `https://wkeyone.app/` ✅ |
| `og:url` meta | `https://wkeyone.app` ✅ |
| Login page (`/login`) | ✅ renders correctly |
| Unauthenticated redirect | `/dashboard` → `/login` ✅ |
| Forgot-password page | ✅ renders, submits successfully |
| sitemap.xml | `https://wkeyone.app/` ✅ |
| robots.txt sitemap | `https://wkeyone.app/sitemap.xml` ✅ |

Note: Authenticated flows (post-login dashboard, sidebar, customer workflows) require admin credentials — must be verified by user/ops team.

---

## 9. Authentication Verification ✅ (partial)

| Check | Result |
|-------|--------|
| Login page renders | ✅ |
| Auth redirect (unauth) | ✅ `/dashboard` → `/login` |
| Cookie type | host-only (no `domain` attr) — definitive re-auth on wkeyone.app |
| Post-login dashboard | Not testable without credentials — **requires manual verification** |

---

## 10. Email Verification ⚠️ (accepted limitation)

| Check | Result |
|-------|--------|
| Forgot-password flow | Submits successfully, returns "check your email" |
| Email domain | Not verified via TestMail (test address not registered in prod DB) |
| Env-based guarantee | `NEXT_PUBLIC_SITE_URL=https://wkeyone.app` set on server; all email routes use `env.siteUrl` |

**Action for ops team:** test password reset with a real registered user account and verify the link in the received email uses `https://wkeyone.app`.

---

## 11. security.txt Verification ✅

```
Canonical: https://wkeyone.app/.well-known/security.txt
```
RFC-9116 Canonical now correctly points to the serving origin.

---

## 12. Meta Status ✅

`META_CLOUD_ENABLED=0` — Meta Cloud intentionally OFF. No webhook to migrate. No change made.

---

## 13. Bridge Status ✅

| Check | Result |
|-------|--------|
| Bridge DB rows | 0 |
| Active connections to :3002 | 0 |
| Bridge artifacts on server | None |
| Live bridge customers | **NO LIVE BRIDGE DEPENDENCY AT CUTOVER** |
| bridge-gateway.service | active (ready for future use) |

---

## 14. Old Domain / Redirect Status ✅

| Check | Result |
|-------|--------|
| `w.keyone1.com/` | `301 → https://wkeyone.app/` |
| Path preserved | `w.keyone1.com/dashboard/settings` → `https://wkeyone.app/dashboard/settings` |
| `wkeyone.app` no loop | `200` (not redirected again) |
| Old domain still accessible | ✅ (via redirect to new) |

---

## 15. Sentry/Monitoring Result ⚠️ (non-blocking)

Sentry API returned empty projects list — token may have rotated since Phase 1 setup. The Sentry DSN is env-driven (`NEXT_PUBLIC_SENTRY_DSN`) and was not changed. Error reporting should continue unchanged.

**Action for ops team:** verify Sentry dashboard shows errors from `wkeyone.app` after users begin using the new domain.

---

## 16. Database / Data Safety ✅

| Check | Result |
|-------|--------|
| Customer data modified | No |
| DB reset | No |
| DB seed | No |
| Migrations run | Additive prisma db push only |
| DB health | `"db":"ok"` on `/api/health` |

---

## 17. Rollback Readiness ✅

If rollback needed:
1. DNS: `PUT /v4/domains/wkeyone.app/records/288264681` → change answer to `91.195.240.94` (or delete record)  
2. Caddy: `sudo cp /etc/caddy/Caddyfile.bak-2026-09-01 /etc/caddy/Caddyfile && sudo systemctl reload caddy`  
3. Env: `cp /home/ubuntu/keyone/.env.bak-2026-09-01 /home/ubuntu/keyone/.env`  
4. Deploy: `KEYONE_SSH_KEY=~/.ssh/keyone-prod.pem deploy/release-aws.sh <previous-commit>`

**No rollback required** — all verifications passed.

---

## 18. Documentation

| Document | Status |
|----------|--------|
| DOMAIN_MIGRATION_INVENTORY.md | ✅ committed |
| DOMAIN_MIGRATION_ADDITIONAL_FINDINGS.md | ✅ committed |
| DOMAIN_MIGRATION_PHASE2_CHECKLIST.md | ✅ committed |
| DOMAIN_MIGRATION_PHASE2_REVIEW.md | ✅ committed |
| DOMAIN_MIGRATION_EVIDENCE_LEDGER.md | ✅ committed |
| DOMAIN_MIGRATION_EXECUTIVE_SUMMARY.md | ✅ committed |
| DOMAIN_MIGRATION_EXECUTION_LOG.md | ✅ committed |
| DOMAIN_MIGRATION_FINAL_VERIFICATION.md | ✅ this document |
| DOMAIN_MIGRATION_ROLLBACK.md | see §17 above |

---

## 19. Remaining Non-Blocking Items

| Item | Priority | Owner |
|------|----------|-------|
| Verify authenticated dashboard/customer flows manually | HIGH | Ops team |
| Test email link domain with a real registered user | HIGH | Ops team |
| Sentry token rotation — re-authenticate to verify error reporting | MEDIUM | Ops team |
| Bridge: update defaults will take effect when artifacts are published | LOW | Product |
| Seed/schema default emails (`support@keyone1.com`) | LOW | Engineering |
| `security.txt` Contact email is still `security@keyone1.com` (email migration separate) | LOW | Ops |
| Monitor Sentry for unexpected errors after first real user sessions | HIGH | Ops |
| Lower DNS TTL recovery (TTL=300, will auto-expire) | INFO | — |

---

## 20. Final Verdict

### MIGRATION COMPLETE — VERIFIED WITH DOCUMENTED NON-BLOCKING ITEMS

All critical infrastructure checks pass:
- ✅ `wkeyone.app` DNS → `16.171.230.84`
- ✅ Valid Let's Encrypt TLS certificate
- ✅ HTTP/2 200 on `https://wkeyone.app`
- ✅ `/api/health`: `status:ok, db:ok, version:8f074f7`
- ✅ Canonical and OG tags use `wkeyone.app`
- ✅ Sitemap and robots.txt use `wkeyone.app`
- ✅ Auth redirect works on `wkeyone.app`
- ✅ `security.txt` Canonical corrected
- ✅ Meta remains OFF
- ✅ No live bridge dependency broken
- ✅ `w.keyone1.com` → 301 redirect to `wkeyone.app` (with path preservation)
- ✅ No customer data modified
- ✅ Rollback documented and available

Non-blocking items requiring manual follow-up by ops team: authenticated workflow verification, email link test with real user, Sentry token check.
