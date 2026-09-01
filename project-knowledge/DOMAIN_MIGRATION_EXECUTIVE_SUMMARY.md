# KEYONE Domain Migration — Executive Summary

**Date:** 2026-09-01  
**Phase:** PHASE 1 COMPLETE (TOOLING SETUP / DISCOVERY)  
**Current Domain:** `https://w.keyone1.com`  
**Target Domain:** `https://wkeyone.app`  
**Status:** ⏸️ AWAITING PHASE 2 REVIEW  

---

## What Was Done

PHASE 1 (this phase) conducted a **complete audit** of all domain-dependent configurations without making any changes to production. The audit discovered:

- ✅ **42+ distinct domain references** across codebase, deployment, integrations
- ✅ **10 external services** with domain-dependent configurations
- ✅ **4 deployment scripts** with hardcoded fallback domains
- ✅ **Database seed data** containing domain references
- ✅ **3 bridge packaging scripts** (macOS, Linux) with hardcoded domains
- ✅ **All risks classified** (CRITICAL, HIGH, MEDIUM, LOW)
- ✅ **Migration dependencies documented** (which items must change simultaneously)
- ✅ **Service credentials verified** (Sentry, TestMail, CodeScene working)

---

## Key Findings

### 1. Critical Path Items (Must Coordinate)

These **5 items** must be updated simultaneously, or breakage occurs immediately:

1. **Caddy Reverse Proxy** (`deploy/Caddyfile` line 5)  
   → Domain: `k1wb.app.keyone1.com` → `wkeyone.app`

2. **Bridge Cloud API URLs** (`bridge-node/keyone-wa-bridge.js` lines 58-59)  
   → Fallback defaults must update OR all bridge instances must have env vars set

3. **Meta Webhook URL** (Meta Business Dashboard)  
   → Must point to `https://wkeyone.app/api/whatsapp/meta-webhook` (or whatever path is configured)

4. **NEXT_PUBLIC_SITE_URL** (production `.env`)  
   → Fallback in code is `https://w.keyone1.com`, must be environment-controlled

5. **SSL Certificate** (Let's Encrypt via Caddy)  
   → Must be provisioned for new domain before traffic routes to it

**Impact if not synchronized:** Webhooks fail, bridge disconnects, site doesn't load on new domain, authentication breaks.

### 2. High-Risk Items (Update Before Traffic Shift)

These should be updated before cutover but don't require second-precise synchronization:

- **Sentry DSN** — Create new project for new domain; old domain continues reporting to old project
- **Clerk Callbacks** — Add new domain to allowlist before removing old
- **DNS Records** — Both domains can point to same IP during transition
- **Deployment Scripts** — Update defaults so new deployments use correct domain
- **Database Seed Values** — Support/admin emails; only affects new seeding
- **Email Templates** — If any hardcoded domains; must be updated

### 3. Medium-Risk Items (Can Trail Behind)

- **robots.txt** — Hardcoded sitemap URL; SEO impact if not updated quickly
- **Bridge Packaging Scripts** — macOS/Linux installers; only matters if rebuilding packages
- **OpenRouter HTTP-Referer** — Fallback value; should update for correctness

### 4. Low-Risk / No-Risk Items

- Internal service URLs (localhost:3000, localhost:3001)
- Auth secrets (domain-agnostic)
- Database credentials (domain-agnostic)
- LLM configuration (domain-agnostic)
- TestMail (test-only service)
- CodeScene (development tool)
- Icons8, Blackfire, LambdaTest (not domain-dependent)

---

## Scope & Scale

### Lines of Code Affected
- **Application code:** ~15 files with fallback domains
- **Deployment scripts:** ~5 files with hardcoded URLs
- **Bridge packages:** ~3 files with domain references
- **Database seed:** ~2 files with domain/email references

### Systems Affected
- **1** SaaS web application (Next.js)
- **2-3** Bridge deployment channels (Docker, macOS installer, Linux installer)
- **10** external service integrations (Sentry, Clerk, Meta, Name.com, TestMail, Datadog, CodeScene, Blackfire, Icons8, LambdaTest)
- **1** reverse proxy (Caddy)
- **PostgreSQL** database

### Stakeholders Impacted
- **Product/Business** — Communication plan, customer notification
- **Operations/DevOps** — Deployment, SSL/TLS, DNS, infrastructure
- **Engineering** — Code changes, bridge updates, testing
- **Support** — Customer communication, bridge troubleshooting
- **Security** — SSL certificates, Clerk configuration, Meta webhook validation

---

## Risk Assessment Summary

| Category | Risk Level | Consequence | Mitigation |
|----------|-----------|-------------|-----------|
| **Caddy + SSL + DNS** | 🔴 CRITICAL | Site unreachable | Synchronized update, test on staging |
| **Bridge connectivity** | 🔴 CRITICAL | WhatsApp offline | Rebuild images, clear env var docs |
| **Meta webhooks** | 🔴 CRITICAL | No incoming messages | Pre-test on staging, verify with Meta |
| **User authentication** | 🟠 HIGH | Users logged out | Plan re-auth flow; test Clerk callbacks |
| **Sentry error tracking** | 🟠 HIGH | Separate project; old domain doesn't report | Acceptable; monitor new project DSN |
| **Email links** | 🟠 HIGH | Customer confusion if old domain appears | Update templates; test on staging |
| **SEO impact** | 🟠 MEDIUM | Short-term traffic drop | Update robots.txt + redirects quickly |
| **Support cost** | 🟡 MEDIUM | Customer questions about new domain | Clear communication before/after |
| **Bridge installer updates** | 🟡 MEDIUM | Old installers don't work | Rebuild; existing instances can use env vars |
| **Database references** | 🟡 MEDIUM | Old emails still appear | Only affects new seeding; acceptable |

---

## Timeline Estimate (if PHASE 3 approved)

| Phase | Task | Estimate | Notes |
|-------|------|----------|-------|
| **Pre-Migration (Week 1-2)** | Update scripts, test staging, get approvals | 5-10 days | Parallel work possible |
| **Migration Day (1 day)** | Cut over infrastructure, update configs, verify | 2-4 hours | Requires on-call support |
| **Post-Migration (Week 2-3)** | Monitor, communicate, redirect old domain, decommission | 5-10 days | Gradual old-domain shutdown |
| **Total** | Discovery → Full completion | ~3-4 weeks | Assumes approval is quick |

---

## What Happens Next

### PHASE 2: Opus Review (Next Step)

The three generated documents are ready for review by an Opus agent or senior engineer:

1. **`DOMAIN_MIGRATION_INVENTORY.md`** (Main reference)
   - Complete audit of all 42+ configurations
   - Each item: location, current value, purpose, risk, action
   - Organized by category (env vars, services, code, DNS, etc.)

2. **`DOMAIN_MIGRATION_ADDITIONAL_FINDINGS.md`** (Supplementary)
   - 7 additional categories of domain references found after initial scan
   - Deployment scripts, bridge packaging, database seed, provider configs
   - Summary table of all findings

3. **`DOMAIN_MIGRATION_PHASE2_CHECKLIST.md`** (For Opus review)
   - Service verification status (which ones are accessible)
   - Detailed checklists for Opus to validate completeness
   - Risk assessment framework
   - Migration order validation
   - Testing strategy template
   - Communication plan template
   - Approval gates (what must be confirmed before PHASE 3)

**Opus should:**
- ✅ Validate the inventory is complete
- ✅ Identify any missed dependencies
- ✅ Propose optimal migration order
- ✅ Define rollback procedures
- ✅ Confirm testing strategy
- ✅ Validate communication plan
- ⚠️ **NOT** approve execution (that's for product/business leadership)

### PHASE 3: Execution (Requires Explicit Approval)

Only after PHASE 2 review is complete and stakeholders approve, can PHASE 3 begin:

1. **No production changes yet** — This is still preparation
2. **Staging test** — Deploy new domain to staging environment
3. **Synchronized cutover** — Update critical path items simultaneously
4. **Monitoring** — Watch error rates, webhooks, bridge connectivity
5. **Customer communication** — Notify users of new domain
6. **Old domain handling** — Redirect or decommission

---

## Key Questions Answered by This Audit

| Q | A |
|---|---|
| **Where is the old domain used?** | Answer: 42+ locations (see inventory) |
| **What will break if we just flip DNS?** | Answer: Bridge connectivity, Meta webhooks, Clerk auth, Sentry reporting, certificates |
| **Can we do a gradual migration?** | Answer: Yes, but sync critical path items; 2-3 week transition period recommended |
| **Will customers need to re-authenticate?** | Answer: Yes, session cookies are domain-scoped; or implement SSO redirect |
| **What if something goes wrong?** | Answer: Rollback procedures needed for each step (see PHASE 2 checklist) |
| **Do we need to notify customers?** | Answer: Yes; bridge customers especially (self-hosted instances affected) |

---

## Deliverables in project-knowledge/

All documents are saved in `/project-knowledge/` for version control and future reference:

1. **DOMAIN_MIGRATION_INVENTORY.md** (8 sections, 11 risk tables)
2. **DOMAIN_MIGRATION_ADDITIONAL_FINDINGS.md** (10 sections, 7 categories)
3. **DOMAIN_MIGRATION_PHASE2_CHECKLIST.md** (7 sections, 20 subsection checklists)
4. **DOMAIN_MIGRATION_EXECUTIVE_SUMMARY.md** (this document)

These are **NOT** change proposals. They are **discovery documents** that enable informed decision-making.

---

## What You Can Do Now

1. **Review the three audit documents** (30-60 min reading)
2. **Circulate to stakeholders** (product, ops, security, support)
3. **Request PHASE 2 review** from senior/Opus agent
4. **Plan staging test** for new domain (independent of Phase 2)
5. **Notify customers** that domain migration is being planned (optional, for transparency)
6. **Secure approvals** from business leadership before authorizing PHASE 3

---

## What NOT to Do

- ❌ Do NOT make DNS changes yet
- ❌ Do NOT deploy to production domain yet
- ❌ Do NOT update Caddy configuration yet
- ❌ Do NOT update Meta webhook URL yet
- ❌ Do NOT change production .env yet
- ❌ Do NOT assume this audit is complete (PHASE 2 review may find more)

**PHASE 1 is discovery only. PHASE 2 is review. PHASE 3 requires explicit authorization.**

---

## Critical Success Factors

For migration to succeed:

1. ✅ **Completeness** — All domain references must be found (PHASE 2 validates this)
2. ✅ **Synchronization** — Critical path items updated at same time
3. ✅ **Staging test** — All systems tested on new domain before cutover
4. ✅ **Monitoring** — Error rates, webhooks, bridge connectivity watched during/after
5. ✅ **Rollback plan** — Each step has a defined rollback procedure
6. ✅ **Communication** — Customers informed before/during/after migration
7. ✅ **On-call coverage** — Support team available during cutover window

---

## Contact & Escalation

- **Audit Conducted By:** Claude Code (PHASE 1)
- **Next Reviewer:** Opus agent (PHASE 2)
- **Approval Authority:** Product/Business stakeholders
- **Execution Authority:** DevOps/Operations team

For questions about inventory contents, refer to the three detailed audit documents.

---

**End of Executive Summary**

**Status:** ⏸️ Awaiting PHASE 2 Review  
**Next Action:** Distribute documents to stakeholders  
**Timeline:** No urgency; PHASE 2 can happen on product's schedule
