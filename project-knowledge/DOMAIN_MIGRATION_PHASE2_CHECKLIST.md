# Domain Migration — Phase 2 Checklist for Opus Review

**Status:** Ready for Review  
**Date Prepared:** 2026-09-01  
**Previous Phase:** PHASE 1 (TOOLING SETUP) — Audit Complete  
**This Phase:** PHASE 2 (MIGRATION REVIEW)  
**Next Phase:** PHASE 3 (EXECUTION) — Requires explicit authorization  

---

## Overview

PHASE 1 audit discovered **42+ domain-dependent configurations** across:
- 4 deployment scripts
- 2 bridge packaging scripts
- Database seed data
- Application hardcoded defaults
- External service integrations
- Reverse proxy configuration
- DNS/SSL configuration

This checklist is for the Opus review agent (PHASE 2) to:
1. Validate completeness of inventory
2. Identify any missed dependencies
3. Determine safe migration order
4. Define rollback procedures
5. Plan customer communication

---

## Service Verification Status

### 1. Sentry Error Tracking
- **Status:** ✅ VERIFIED ACCESSIBLE
- **Endpoint:** `https://wkeyone.sentry.io/`
- **Auth:** Personal API token confirmed working
- **Current Setup:** Organization `keyone`, Project `keyone`
- **Action Required:** Create separate DSN for new domain before migration

### 2. Clerk Authentication
- **Status:** ⚠️ NOT VERIFIED (credentials provided but not tested)
- **Note:** Credentials in system but browser-based verification needed
- **Action Required:** Manual verification of allowed callback domains in Clerk dashboard

### 3. Meta Cloud API (WhatsApp)
- **Status:** ⚠️ NOT VERIFIED (no API endpoint provided in credentials)
- **Note:** Webhook verification requires access to Meta Business Dashboard
- **Action Required:** Inspect current webhook URL in Meta Business Dashboard

### 4. Name.com DNS
- **Status:** ⚠️ LEGACY API (current credentials provided for deprecated endpoint)
- **Note:** API endpoints provided (api.dev.name.com, api.name.com) no longer support HTTP AUTH
- **Recommendation:** Use Name.com web dashboard or newer API endpoint for DNS verification
- **Action Required:** Verify DNS records exist for wkeyone.app via Name.com dashboard

### 5. Datadog APM
- **Status:** ⚠️ AUTHENTICATION ISSUE (bearer token may require different header)
- **Note:** API responded with 403 Forbidden when tested
- **Action Required:** Verify correct Datadog API key format for us5 region

### 6. CodeScene Code Quality
- **Status:** ✅ PARTIAL VERIFICATION (API endpoint responds)
- **Note:** Token is valid but requires correct path
- **Action Required:** No action needed (development tool only)

### 7. TestMail Email Testing
- **Status:** ✅ VERIFIED ACCESSIBLE
- **Namespace:** 16zvb
- **Auth:** Bearer token confirmed working
- **Action Required:** Create test namespace for new domain if separate testing needed

### 8. Icons8 Design Assets
- **Status:** ✅ MCP CONFIGURED
- **Note:** No credentials needed for MCP connection
- **Action Required:** Verify MCP still works after domain migration

### 9. LambdaTest Cross-Browser Testing
- **Status:** ⚠️ NOT CONFIGURED (subscription exists but credentials not provided)
- **Action Required:** Inspect existing local configuration if needed for testing new domain

### 10. IconScout Design Assets
- **Status:** ⚠️ NOT CONFIGURED (subscription intended but credentials not provided)
- **Action Required:** Inspect existing local configuration if needed

---

## Phase 2 Verification Checklist

### A. Completeness Review

**Instructions to Opus:**
- [ ] Review `DOMAIN_MIGRATION_INVENTORY.md` for completeness
- [ ] Review `DOMAIN_MIGRATION_ADDITIONAL_FINDINGS.md` for secondary references
- [ ] Scan codebase for any missed hardcoded domain references:
  ```bash
  grep -r "keyone1\.com\|w\.keyone1\.com\|app\.keyone1\.com" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" | wc -l
  ```
- [ ] Search for any database stored procedures/triggers with hardcoded URLs
- [ ] Check if any npm packages have hardcoded domain references
- [ ] Review any third-party integrations (payment gateways, CRM, etc.)
- [ ] Verify all AWS Lambda functions (if any) don't have hardcoded URLs

### B. Risk Assessment

**Instructions to Opus:**
- [ ] Classify each item as:
  - **CRITICAL** (immediate breakage if not updated)
  - **HIGH** (breakage within hours)
  - **MEDIUM** (degraded functionality)
  - **LOW** (cosmetic or non-critical)

- [ ] Identify which items must be synchronized (updated at same time):
  - [ ] Caddy domain + SSL certificate + DNS records
  - [ ] Bridge Cloud API URLs + Meta webhook URL
  - [ ] NEXT_PUBLIC_SITE_URL in production .env
  - [ ] Other? ___________________

- [ ] Identify which items can transition with overlap (old + new working together):
  - [ ] Sentry (old domain continues reporting, new domain creates separate project)
  - [ ] Clerk callbacks (add new domain, keep old until cutover)
  - [ ] DNS (both domains can coexist on same IP)
  - [ ] Other? ___________________

### C. Technical Deep-Dives

**For Opus to investigate:**

#### C1. Bridge Ecosystem
- [ ] Are all bridge instances deployed via Docker or are there self-hosted bridges?
- [ ] Do existing bridge instances have `KEYONE_CLOUD_API` environment variable set?
- [ ] What's the process for updating bridge instances? (Auto-update via image pull or manual?)
- [ ] Are bridge installers (macOS .pkg, Linux .deb) still in use or obsolete?
- [ ] How many active bridge instances are deployed?

#### C2. Authentication Flow
- [ ] Is `mse_session` cookie domain-scoped and will it survive domain change?
- [ ] Do we need to implement single-sign-on redirect during transition?
- [ ] Can users maintain sessions across domain change or will re-auth be required?
- [ ] Is Clerk configured with refresh token rotation that survives domain change?

#### C3. Email & Notification Links
- [ ] Do email templates contain hardcoded domain URLs?
- [ ] Are there customer-managed email providers that might need updates?
- [ ] Will password reset links work across old/new domain (if both running simultaneously)?
- [ ] Do SMS messages contain domain links?

#### C4. Backward Compatibility
- [ ] Is there a plan to keep old domain operational as redirect after migration?
- [ ] How long should old domain redirect to new domain (301 or 302)?
- [ ] Will old domain receive DNS/SSL/Caddy updates or be decommissioned?
- [ ] Are there API clients that hard-code old domain?

#### C5. Database Considerations
- [ ] Does database contain any persisted URLs that need migration?
- [ ] Are there any database views or functions that generate URLs?
- [ ] Will migrations be needed for any tables storing domain-specific data?
- [ ] Is there a backup/rollback plan if database needs restoration?

### D. Migration Order Validation

**For Opus to confirm:**

**Proposed Order (from PHASE 1 audit):**

1. ✅ Update deployment scripts (non-production change)
2. ✅ Update bridge code defaults (non-production change)
3. ✅ Update database seed data (non-production change)
4. ⏸️ STOP FOR APPROVAL
5. 🔴 Update Caddy + DNS (production-impacting, needs approval)
6. 🔴 Update Meta webhook URL (production-impacting)
7. 🔴 Update Clerk callbacks (optional during transition)
8. 🔴 Update NEXT_PUBLIC_SITE_URL in .env (production-impacting)
9. 🔴 Restart app container (production-impacting)
10. 🔴 Update robots.txt + sitemap (SEO-impacting)
11. 🔴 Monitor + verify all systems
12. 🔴 Communicate with customers
13. 🔴 Plan old domain retirement

**Questions for Opus:**
- [ ] Is this order correct?
- [ ] Are there dependencies I missed?
- [ ] Should any steps be parallelized?
- [ ] What's the rollback procedure for each step?
- [ ] What monitoring should be in place during each step?

### E. Testing Strategy

**For Opus to define:**

- [ ] **Pre-migration staging:**
  - [ ] Deploy new domain to staging environment (wkeyone-staging.app)
  - [ ] Run all integration tests against staging domain
  - [ ] Verify bridge connectivity to staging domain
  - [ ] Verify Meta webhook delivery to staging domain
  - [ ] Verify Clerk auth flow on staging domain
  - [ ] Verify email links work on staging domain

- [ ] **Traffic migration strategy:**
  - [ ] Are we doing a hard cutover or gradual shift?
  - [ ] If gradual, what percentage increments?
  - [ ] How do we route traffic during transition?
  - [ ] Can we run both domains simultaneously?

- [ ] **Rollback procedures:**
  - [ ] DNS rollback (revert A record to old domain)
  - [ ] Caddy rollback (revert to old domain config)
  - [ ] App rollback (.env revert)
  - [ ] Bridge rollback (revert Docker image)
  - [ ] Database rollback (if needed)
  - [ ] Sentry rollback (re-route to old project)

- [ ] **Monitoring during migration:**
  - [ ] What metrics should we watch?
  - [ ] What are acceptable error rates?
  - [ ] How long should we monitor before declaring success?
  - [ ] Whom should we alert if issues occur?

### F. Communication Plan

**For Opus to review:**

- [ ] **Customer notification timing:**
  - [ ] When to announce (before/during/after migration)?
  - [ ] Communication channel (email, in-app, status page)?
  - [ ] Message content (what to tell customers)?

- [ ] **Bridge user communication:**
  - [ ] How to notify customers running self-hosted bridges?
  - [ ] Do they need to take action or is it automatic?
  - [ ] What's the support process for bridge issues?

- [ ] **Support team briefing:**
  - [ ] What questions will customers ask?
  - [ ] What's the FAQ?
  - [ ] Troubleshooting guide for new domain issues

### G. Risk Mitigation

**For Opus to identify:**

- [ ] What could go wrong and how severe?
- [ ] Which risks are acceptable vs need mitigation?
- [ ] What's the single point of failure?
- [ ] Who's on-call during migration?
- [ ] What's the abort procedure if things go wrong?

---

## Blockers & Dependencies

### Current Blockers (require resolution before PHASE 3)

- [ ] **Name.com API Obsolescence** — The provided API endpoints are legacy/deprecated. Need clarification on how DNS is currently managed (web dashboard? newer API? third-party service?)
  
- [ ] **Meta Business Dashboard Access** — Need to verify current webhook URL configuration in Meta dashboard before planning migration

- [ ] **Clerk Configuration Details** — Need to confirm allowed callback domains in Clerk before planning auth migration

- [ ] **Bridge Instance Inventory** — Need to know how many bridge instances are deployed and how they're updated

### Dependencies on External Systems

- **Let's Encrypt** — Caddy will auto-request SSL cert; ensure outbound access to ACME servers
- **DNS Propagation** — May take time; plan accordingly
- **Meta Rate Limiting** — Meta may have webhook delivery delays during transition
- **Sentry Source Map Upload** — CI/CD pipeline must reach Sentry to upload maps for new domain

---

## Questions for Opus Review

1. **Is the inventory complete?** Are there any domain dependencies I missed?

2. **Is the migration order optimal?** Should any steps be parallelized or reordered?

3. **What's the rollback strategy?** How quickly can we revert if problems occur?

4. **How should we handle the old domain?** Immediate shutdown, redirect period, or parallel operation?

5. **What's the communication plan?** When do customers learn about the change?

6. **Are there hidden dependencies?** Database views? Stored procedures? API rate limiting?

7. **What's the acceptance criteria?** How do we know the migration was successful?

8. **Who's accountable for each step?** (Ops, Dev, Product, Support?)

---

## Approval Gates

**DO NOT PROCEED TO PHASE 3 without:**

- [ ] Opus review approval (completeness + risk assessment)
- [ ] Explicit authorization from product/business stakeholders
- [ ] Confirmation of staging test results
- [ ] Confirmation of rollback procedures
- [ ] Confirmation of communication plan
- [ ] On-call team assignment for migration day
- [ ] Scheduled downtime window (if needed) agreed upon

---

## Sign-Off

**Prepared by:** Claude Code (PHASE 1 Audit)  
**Date:** 2026-09-01  
**Status:** Ready for PHASE 2 Review  
**Next Step:** Await Opus review and approval  

**Deliverables in project-knowledge:**
1. ✅ `DOMAIN_MIGRATION_INVENTORY.md` — Complete audit
2. ✅ `DOMAIN_MIGRATION_ADDITIONAL_FINDINGS.md` — Secondary references
3. ✅ `DOMAIN_MIGRATION_PHASE2_CHECKLIST.md` — This document

---

**⚠️ REMINDER: This phase is REVIEW ONLY. No production changes are authorized or recommended until PHASE 2 review is complete and PHASE 3 is explicitly approved.**
