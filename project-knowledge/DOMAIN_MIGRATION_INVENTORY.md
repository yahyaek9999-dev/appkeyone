# KEYONE Domain Migration Inventory

> ⚠️ **PHASE 2 CORRECTION NOTICE (2026-09-01).** This Phase 1 document is preserved as historical discovery. Several findings were **not verified against the live system and are corrected** in `DOMAIN_MIGRATION_PHASE2_REVIEW.md` (§3, C1-C8) with evidence in `DOMAIN_MIGRATION_EVIDENCE_LEDGER.md`. Most important: **Clerk is NOT integrated** (no migration action — C1); the "old domain" is actually **three variants** (`w.keyone1.com` live, `app.keyone1.com` **dead**, `k1wb.app.keyone1.com` **NXDOMAIN** — C2); `wkeyone.app` is **parked with no cert** under an **HSTS-preloaded TLD** (C8); `wkeyone-staging.app` **does not exist** (C6); Name.com legacy API is **gone/410** (C7). Phase 1 also **missed** a second (Go) bridge codebase, Windows installers, `security.txt`, and the Prisma schema default. **Trust the Phase 2 review where they disagree.**

**Status:** TOOLING SETUP PHASE — Discovery & Audit Only  
**Scope:** Catalog all domain-dependent configurations before migration  
**Old Domain:** `https://w.keyone1.com`  
**New Domain (Target):** `https://wkeyone.app`  
**Verification Date:** 2026-09-01  

---

## Executive Summary

This inventory documents ALL domain-dependent configurations, integrations, and external service callbacks that must be audited and intentionally migrated. The migration has been **strictly partitioned into three phases**:

1. **PHASE 1: TOOLING SETUP (Current)** — Audit and catalog everything. No DNS/production changes.
2. **PHASE 2: MIGRATION REVIEW** — Opus reviews the inventory and determines the safe migration plan.
3. **PHASE 3: EXECUTION** — Apply the migration across all systems simultaneously (not yet authorized).

This document is the deliverable for PHASE 1. It does NOT authorize changes; it enables informed decision-making in PHASE 2.

---

## 1. APPLICATION ENVIRONMENT VARIABLES

### 1.1 Frontend & Public URLs

| Variable | Location | Current Value | Purpose | Migration Risk | Required Action |
|----------|----------|---------------|---------|-----------------|-----------------|
| `NEXT_PUBLIC_SITE_URL` | `saas/.env.example` | `https://app.keyone1.com` (example) | Root domain for sitemap, metadata, OpenGraph | **HIGH** - Used in 5+ locations | Update in .env + codebase defaults |
| `NEXT_PUBLIC_SITE_URL` | `saas/app/layout.tsx:5` | Fallback: `https://w.keyone1.com` | Metadata base URL for all pages | **HIGH** - Every page references | Replace fallback after env var set |
| `NEXT_PUBLIC_SITE_URL` | `saas/app/sitemap.ts:3` | Fallback: `https://w.keyone1.com` | Sitemap canonical URLs (SEO) | **HIGH** - Affects search rankings | Replace fallback; robots.txt must also update |
| `NEXT_PUBLIC_BASE_URL` | `saas/app/dashboard/settings/bridge/download/page.tsx:16` | Fallback: `https://w.keyone1.com` | Bridge download page origin | **MEDIUM** - Customer-facing | Replace fallback |
| `NEXT_PUBLIC_BASE_URL` | `saas/lib/bridge/overview.ts:169` | Fallback: `https://w.keyone1.com` | Bridge overview API base | **MEDIUM** - Client-side API calls | Replace fallback |

### 1.2 Sentry Configuration

| Variable | Location | Current Value | Purpose | Migration Risk | Required Action |
|----------|----------|---------------|---------|-----------------|-----------------|
| `NEXT_PUBLIC_SENTRY_DSN` | `saas/.env.example` | Empty (must be configured) | Error tracking DSN | **LOW** - Pure configuration | Verify Sentry project is set for new domain |
| `SENTRY_ORG` | `saas/.env.example` | `keyone` | Sentry organization slug | **LOW** - Enum value | No change required |
| `SENTRY_PROJECT` | `saas/.env.example` | `keyone` | Sentry project slug | **LOW** - Enum value | No change required |
| `SENTRY_AUTH_TOKEN` | `saas/.env.example` | Empty (must be configured) | CI/CD source map upload token | **LOW** - Pure token | No domain dependency |

### 1.3 WhatsApp & Bridge Integration

| Variable | Location | Current Value | Purpose | Migration Risk | Required Action |
|----------|----------|---------------|---------|-----------------|-----------------|
| `KEYONE_CLOUD_API` | `bridge-node/keyone-wa-bridge.js:58` | Fallback: `https://w.keyone1.com` | Bridge→Cloud API endpoint | **CRITICAL** - Breaks bridge connectivity | Must update bridge config + restart all bridge instances |
| `KEYONE_CLOUD_WS` | `bridge-node/keyone-wa-bridge.js:59` | Fallback: `wss://w.keyone1.com/bridge` | Bridge→Cloud WebSocket | **CRITICAL** - Real-time sync | Must update bridge config + restart all bridge instances |
| `WHATSAPP_SERVICE_URL` | `saas/.env.example` | `http://127.0.0.1:3001` | Internal WhatsApp service | **LOW** - Internal only | No domain dependency |
| `NEXT_PUBLIC_BASE_URL` (for webhook) | `saas/app/api/cron/meta-webhook-processor/route.ts:29` | Fallback: `http://127.0.0.1:3000` | Meta webhook incoming URL | **CRITICAL** - Must match Meta Cloud API config | Update Meta Cloud API webhook URL |

---

## 2. EXTERNAL SERVICE INTEGRATIONS

### 2.1 Sentry Error Tracking
- **Service:** https://wkeyone.sentry.io/
- **Current Configuration:**
  - Organization: `keyone`
  - Project: `keyone`
  - Auth Token: [CONFIGURED]
- **Domain Dependency:** DSN URL must match production domain
- **Migration Risk:** **MEDIUM** - DSN is hardcoded in app
- **Required Action:**
  1. Create new Sentry DSN for `wkeyone.app` project
  2. Update `NEXT_PUBLIC_SENTRY_DSN` in production .env
  3. Verify source map uploads work with new domain
  4. Gradual traffic migration (old domain will continue reporting to old project)

### 2.2 Clerk Authentication
- **Service:** https://dashboard.clerk.com/
- **Frontend API:** `https://better-tuna-1866.clerk.accounts.dev`
- **Backend API:** `https://api.clerk.com`
- **Current Keys:**
  - Publishable: `pk_test_YmV0dGVyLXR1bmEtMTg2Ni5jbGVyay5hY2NvdW50cy5kZXYk`
  - Secret: `sk_test_PCehA6g8rBpUSpoIvw2B3METODB6rbsuFbeTtXQzIS`
- **Domain Dependency:** Clerk may have allowlist for callback URLs
- **Migration Risk:** **HIGH** - OAuth/SSO authentication depends on this
- **Required Action:**
  1. Verify Clerk account settings for allowed callback domains
  2. Add `wkeyone.app` as allowed callback domain before migration
  3. Configure redirect URIs for both old and new domain during transition
  4. Test auth flow on staging with new domain first

### 2.3 Meta Cloud API (WhatsApp)
- **Service:** https://graph.facebook.com/
- **Webhook Endpoint:** `POST /api/whatsapp/meta-webhook`
- **Current Webhook URL:** Configured in Meta Business Dashboard
- **Domain Dependency:** Meta webhook must point to the app's public domain
- **Migration Risk:** **CRITICAL** - Breaks incoming message handling
- **Required Action:**
  1. Identify current webhook URL in Meta Business Dashboard
  2. Create new webhook URL for `https://wkeyone.app/api/whatsapp/meta-webhook`
  3. Test webhook on staging domain first
  4. Update Meta dashboard webhook URL (verify signature token is portable)
  5. Monitor webhook delivery logs for failures during transition

### 2.4 Name.com DNS Management
- **API Endpoint (Production):** `https://api.name.com`
- **API Endpoint (Development):** `https://api.dev.name.com`
- **Credentials:** [CONFIGURED]
- **Domain Dependency:** Not domain-specific, but manages DNS records
- **Migration Risk:** **LOW** - API is domain-agnostic
- **Required Action:**
  1. Verify DNS records exist for `wkeyone.app` (A, AAAA, MX records)
  2. Test DNS propagation on staging domain
  3. Configure SSL certificate for new domain (Let's Encrypt via Caddy)

### 2.5 TestMail Email Testing
- **Service:** https://testmail.app/
- **Namespace:** `16zvb`
- **Authorization:** Bearer token [CONFIGURED]
- **Domain Dependency:** Email links generated in tests will contain domain
- **Migration Risk:** **LOW** - Test-only service, no production impact
- **Required Action:**
  1. Create new test namespace for new domain if needed
  2. Update test fixtures to use new domain URLs
  3. Re-run email integration tests on new domain

### 2.6 Datadog Application Performance Monitoring
- **Service:** https://us5.datadoghq.com/
- **Credentials:** Access token [CONFIGURED]
- **Domain Dependency:** Dashboard rules may filter by domain/host
- **Migration Risk:** **LOW** - APM data continues, but separate dashboards needed
- **Required Action:**
  1. Create separate Datadog dashboard for new domain
  2. Configure host tags to distinguish old vs new domain traffic
  3. Update monitor/alert rules for new domain

### 2.7 CodeScene Code Quality
- **Service:** https://codescene.io/
- **PAT:** [CONFIGURED]
- **Expiration:** 2027-09-01
- **Domain Dependency:** None (analyzes repo, not runtime)
- **Migration Risk:** **NONE** - Purely development-side
- **Required Action:** No action required

### 2.8 Blackfire Performance Profiling
- **Service:** https://app.blackfire.io/
- **Client ID & Token:** [CONFIGURED]
- **Domain Dependency:** Can profile app on staging, doesn't validate domain
- **Migration Risk:** **LOW** - Development tool only
- **Required Action:** No action required; works on any domain

### 2.9 Icons8 (MCP Configured)
- **Status:** MCP connection enabled
- **Domain Dependency:** None (design asset provider)
- **Migration Risk:** **NONE**
- **Required Action:** Verify MCP still works post-migration

### 2.10 LambdaTest
- **Status:** Subscription exists (credentials not in provided list)
- **Domain Dependency:** Cross-browser testing, can test new domain
- **Migration Risk:** **LOW**
- **Required Action:** Inspect existing LambdaTest configuration; no domain changes needed

### 2.11 IconScout
- **Status:** Subscription intended (credentials not in provided list)
- **Domain Dependency:** None (asset provider)
- **Migration Risk:** **NONE**
- **Required Action:** Inspect existing configuration if needed

---

## 3. APPLICATION HARDCODED DOMAIN REFERENCES

### 3.1 Reverse Proxy Configuration

| File | Location | Current Value | Purpose | Migration Risk | Required Action |
|------|----------|---------------|---------|-----------------|-----------------|
| `deploy/Caddyfile` | Line 5 | `k1wb.app.keyone1.com` | Caddy reverse proxy domain | **CRITICAL** - SSL/TLS termination | Replace with new domain + reissue SSL cert |
| `deploy/Caddyfile` | Lines 25-39 | Internal routes only | Routing logic | **LOW** - No external domains | No changes needed |
| `docker-compose.production.yml` | Line 33 | `127.0.0.1:3000` | Internal port binding | **LOW** - Internal only | No changes needed |

### 3.2 Bridge-Node Configuration

| File | Location | Current Value | Purpose | Migration Risk | Required Action |
|------|----------|---------------|---------|-----------------|-----------------|
| `bridge-node/keyone-wa-bridge.js` | Line 58 | `https://w.keyone1.com` | Bridge→Cloud API | **CRITICAL** - Default fallback | Replace fallback + support env var override |
| `bridge-node/keyone-wa-bridge.js` | Line 59 | `wss://w.keyone1.com/bridge` | Bridge→Cloud WebSocket | **CRITICAL** - Default fallback | Replace fallback + support env var override |

### 3.3 Public Metadata

| File | Location | Current Value | Purpose | Migration Risk | Required Action |
|------|----------|---------------|---------|-----------------|-----------------|
| `saas/app/layout.tsx` | Line 5 | `https://w.keyone1.com` | Fallback SITE_URL | **HIGH** - All pages use this | Replace fallback, keep env var |
| `saas/app/sitemap.ts` | Line 3 | `https://w.keyone1.com` | Fallback for sitemap URLs | **HIGH** - SEO impact | Replace fallback, keep env var |
| `saas/public/robots.txt` | Line 9 | `https://w.keyone1.com/sitemap.xml` | Hardcoded sitemap URL | **CRITICAL** - Must update for SEO | Replace with new domain (dynamic generation preferred) |
| `saas/app/dashboard/settings/bridge/download/page.tsx` | Line 13 | `https://w.keyone1.com` | Bridge download origin | **MEDIUM** - Customer-facing | Replace fallback |
| `saas/app/dashboard/settings/bridge/download/download-cards.tsx` | Line 16 | `https://w.keyone1.com` | Bridge download state | **MEDIUM** - UI only | Replace fallback |

### 3.4 API Webhook Configuration

| File | Location | Current Value | Purpose | Migration Risk | Required Action |
|------|----------|---------------|---------|-----------------|-----------------|
| `saas/app/api/cron/meta-webhook-processor/route.ts` | Line 29 | `http://127.0.0.1:3000` + path | Incoming webhook URL | **HIGH** - Must match Meta config | Compute from NEXT_PUBLIC_BASE_URL |

---

## 4. SESSION & COOKIE CONFIGURATION

### 4.1 Session Cookies

| Item | Location | Current Value | Purpose | Migration Risk | Required Action |
|------|----------|---------------|---------|-----------------|-----------------|
| Cookie Name | `saas/lib/auth.ts:10` | `mse_session` | Authentication token | **MEDIUM** - Domain-specific scope | May need path-based handling during transition |
| Cookie Domain | `saas/lib/auth.ts:109-110` | Not explicitly set (uses parent domain) | Session isolation | **MEDIUM** - Cookies don't auto-migrate domains | Clients must re-authenticate on new domain |

**Note:** Session cookies are domain-scoped. When users access the new domain for the first time, they will need to re-authenticate because the old domain's `mse_session` cookie won't be sent to the new domain.

---

## 5. EMAIL & NOTIFICATION LINKS

### 5.1 Email Systems

| Provider | Location | Usage | Domain Dependency | Migration Risk | Required Action |
|----------|----------|-------|------------------|-----------------|-----------------|
| Resend | `saas/lib/commerce/email.ts:37-50` | Transactional emails | Tenant-configured | **MEDIUM** - User-supplied SMTP | Email body may contain domain links |
| Brevo | `saas/lib/commerce/email.ts:51-57` | Transactional emails | Tenant-configured | **MEDIUM** - User-supplied SMTP | Email body may contain domain links |
| SMTP (Universal) | `saas/lib/integrations/email/smtp.ts` | Tenant email integrations | Tenant-configured | **HIGH** - User-supplied | Customer templates may hardcode old domain |

**Action Items:**
1. Search all email templates for hardcoded domain URLs
2. Update template variables to use environment-based domain
3. Plan customer communication about email link updates

### 5.2 Invitation & Reset Links

| Feature | Location | Link Format | Domain Dependency | Migration Risk | Required Action |
|---------|----------|-------------|------------------|-----------------|-----------------|
| Team Invitations | `saas/app/api/settings/team/route.ts:121` | Dynamic (domain-aware comment) | **HIGH** - Must work behind reverse proxy | Verify `X-Forwarded-Proto` + `Host` header handling |
| Password Reset | `saas/lib/auth.ts` (implied) | Dynamic (likely environment-aware) | **HIGH** - Must work on both domains | Test reset flow on new domain |

---

## 6. DEPLOYMENT & CI/CD CONFIGURATION

### 6.1 GitHub Actions Workflow

| File | Location | Current | Purpose | Migration Risk | Required Action |
|------|----------|---------|---------|-----------------|-----------------|
| `.github/workflows/deploy.yml` | Lines 95-107 | SSH key + AWS endpoint | Deploy script configuration | **LOW** - No domain hardcoded | No changes needed |
| `deploy/release-aws.sh` (referenced) | Imported script | Unknown (not in repository root) | Production deployment | **CRITICAL** - May contain domain | Inspect actual file in main repo |

**Action Items:**
1. Review actual `deploy/release-aws.sh` for domain references
2. Confirm Caddy reload process works with new domain
3. Test SSL certificate renewal for new domain

### 6.2 Docker & Image Building

| File | Line | Current | Purpose | Migration Risk | Required Action |
|------|------|---------|---------|-----------------|-----------------|
| `docker-compose.production.yml` | Multiple | `localhost:3000` | Internal networking | **LOW** - No external domain | No changes needed |
| `saas/next.config.js` | All | No domain refs | Build config | **LOW** - Pure application config | No changes needed |

---

## 7. DNS RECORDS & SSL/TLS

### 7.1 Current Domain Configuration

| Record Type | Current Value | Purpose | Status | Notes |
|-------------|---------------|---------|--------|-------|
| A Record | Must exist in Name.com | IPv4 routing | **TBD** | Inspect via Name.com API |
| AAAA Record | May exist | IPv6 routing | **TBD** | Inspect via Name.com API |
| MX Records | May exist for email | Mail routing | **TBD** | Check if email uses this domain |
| TXT (SPF) | May exist | Mail auth | **TBD** | Check if email uses this domain |
| TXT (DKIM) | May exist | Mail signing | **TBD** | Check if email uses this domain |
| TXT (DMARC) | May exist | Mail policy | **TBD** | Check if email uses this domain |
| SSL Certificate | Let's Encrypt (via Caddy) | HTTPS | Active | Auto-renewed; will need new cert for new domain |

### 7.2 New Domain Requirements

| Requirement | Action | Timeline | Owner |
|------------|--------|----------|-------|
| DNS Records | Create A/AAAA records pointing to same IP | Pre-migration | DevOps |
| SSL Certificate | Obtain Let's Encrypt cert for wkeyone.app | Pre-migration | Caddy (automatic) |
| SPF/DKIM/DMARC | Configure email auth if using new domain | Pre-migration | DevOps |
| Healthcheck | Test domain resolution + HTTPS before traffic | Pre-migration | QA |

---

## 8. UNKNOWN / REQUIRES INVESTIGATION

### 8.1 Potential Hard-Coded References

The following areas should be inspected but were not found in initial scan:

| Area | Why It Matters | Inspection Required |
|------|----------------|---------------------|
| Database seed data | If any SeedUser rows contain hardcoded URLs | Check `saas/prisma/seed.ts` |
| Test fixtures | Test files may have hardcoded domains | Scan `saas/__tests__/**` thoroughly |
| Admin initialization | Admin recovery endpoint may generate links | Check `app/api/admin/init/route.ts` |
| Sentry release tracking | Sentry may tag releases with domain | Verify Sentry config in build process |
| Datadog agent config | APM agent may validate domain | Check if agent has domain rules |
| QR code generation | QR codes may embed domain URLs | Check `saas/lib/qr/**` (if exists) |
| Batch/background jobs | Cron jobs may generate URLs | Check `saas/app/api/cron/**` all routes |
| Stored procedures | Database triggers/functions | Inspect PostgreSQL schema for URL templates |
| Environment template | The actual .env file used in production | Compare with .env.example |

### 8.2 Verification Checklist

- [ ] Production `.env` file (not .example) reviewed by operations
- [ ] All bridge instances checked for hardcoded domains
- [ ] Cron job routes tested on new domain
- [ ] Database does not contain hardcoded URLs (full text search needed)
- [ ] Archived email templates reviewed for domain references
- [ ] Third-party integrations re-verified (commerce hooks, etc.)

---

## 9. MIGRATION STRATEGY SUMMARY

### 9.1 High-Risk Items (Require Synchronized Change)

These MUST be updated simultaneously to avoid breakage:

1. **Caddy Domain** (`deploy/Caddyfile` line 5)
2. **SSL Certificate** (Let's Encrypt for new domain)
3. **Bridge Cloud API URLs** (KEYONE_CLOUD_API, KEYONE_CLOUD_WS)
4. **Meta Webhook URL** (Meta Business Dashboard)
5. **NEXT_PUBLIC_SITE_URL** (Production .env)
6. **robots.txt Sitemap URL**

### 9.2 Medium-Risk Items (Can Transition with Overlap)

These can be updated before traffic is fully migrated:

1. **Sentry DSN** (Creates separate project; old domain continues reporting)
2. **Clerk Callback URLs** (Add new domain before removing old)
3. **DNS Records** (Both domains can coexist)

### 9.3 Low-Risk Items (No Domain Dependency)

These require no changes:

1. Auth secret keys (domain-agnostic)
2. Database credentials (domain-agnostic)
3. LLM API configuration (domain-agnostic)
4. Internal service ports (domain-agnostic)

---

## 10. EXTERNAL REFERENCES

### 10.1 Documentation Needs

- User-facing documentation must be reviewed for hardcoded URLs
- Developer documentation (if exists) may reference old domain
- Help center / support articles may need updates
- Terms of Service and Privacy Policy links

### 10.2 Downstream Systems

- Any customer integrations that call our API must be notified of domain change
- Webhook subscribers may have URL-based validation
- API key documentation must reflect new base URL
- SDK documentation must be updated

---

## 11. SIGN-OFF & NEXT STEPS

**This inventory is DISCOVERY ONLY. No production changes are authorized.**

### For PHASE 2 (Opus Review):
1. Review this inventory for completeness
2. Identify any additional domain dependencies missed
3. Determine safe order of changes
4. Identify rollback procedures
5. Plan customer communication strategy

### For PHASE 3 (Execution) - If Authorized:
1. Prepare staging environment with new domain
2. Execute synchronized changes in agreed order
3. Test all critical flows on new domain
4. Monitor error rates and webhook delivery
5. Gradually shift traffic (if applicable)
6. Update customer-facing documentation
7. Maintain old domain for redirect period (if needed)

---

**Report Generated:** 2026-09-01  
**By:** Claude Code Migration Audit  
**Scope:** KEYONE Production — Pre-Migration Inventory  
