# MASTER FEATURE DISCOVERY — WKEYONE
## Comprehensive Feature Inventory & Control Architecture Blueprint

**Status**: PHASE 1 DISCOVERY COMPLETE (NOT YET IMPLEMENTED)

**Date**: 2026-08-18

**Key Finding**: WKEYONE contains **111+ real features**, NOT 68.

The 68 capabilities in the pricing catalog are **commercial tiers**, not a complete feature inventory.

---

## EXECUTIVE SUMMARY

| Category | Count | Notes |
|----------|-------|-------|
| **Capabilities** | 68 | Pricing tiers / commercial bundles |
| **Navigation Items** | 47 | Customer-facing top-level features |
| **Dashboard Pages** | 64 | Real, implemented pages (excluding QA/debug) |
| **API Routes** | 337 | Backend functionality |
| **Discovered Features** | 111+ | Real, distinct features with independent value |

### Key Insight

One capability can represent **multiple real features**.

Example: `smart_assistant` capability includes:
- Agents page
- AI operations page
- Knowledge base page
- Bot configuration
- Smart suggestions
- AI provider settings
- Each with distinct UX and commercial value

---

## DETAILED BREAKDOWN

### 1. CAPABILITIES (68) — COMMERCIAL TIERS

These are bundles used for pricing. They do NOT map 1:1 to features.

**Example mapping:**

```
Capability: smart_assistant
├─ Feature: Agents (page + API)
├─ Feature: AI Operations (page + API)  
├─ Feature: Knowledge Base (page + API)
├─ Feature: Bot Configuration (embedded)
├─ Feature: Smart Suggestions (component)
└─ Feature: AI Provider Management (settings page)

Capability: broadcasts
├─ Feature: Broadcast Campaigns (page + API)
├─ Feature: Customer Recovery (page + API)
├─ Feature: Broadcast Queue (page + API)
├─ Feature: Segment targeting (component)
└─ Feature: Broadcast billing/credits (settings)

Capability: team
├─ Feature: Team Members (settings page + API)
├─ Feature: Approval Workflows (page + API)
├─ Feature: Message Routing (component)
├─ Feature: Employee Access Control (page + API)
└─ Feature: Permissions Management (component)
```

---

### 2. NAVIGATION STRUCTURE (47 items, 8 workspaces)

**Workspace breakdown:**

| Workspace | Items | Features |
|-----------|-------|----------|
| Home | 2 | Overview, My Work |
| Conversations | 6 | Inbox, Escalations, Quick Replies, WhatsApp Settings, Connection Health, Meta Health |
| Customers | 4 | Customers, Leads, Segments, Import |
| Sales | 3 | Orders, Products, Coupons |
| Marketing | 4 | Broadcasts, Recovery, SMS, Broadcast Queue |
| Automation | 5 | Bot Config, Bot Builder, Automations, Knowledge, Working Hours |
| Analytics | 6 | Overview, BI, Funnel, Revenue Copilot, Performance, Export |
| Settings | 13 | Account, Billing, Usage, Wallet, Providers, Integrations, Branches, Approvals, Audit, System Health, White Label, Developer, Help |
| **TOTAL** | **47** | |

**Missing from nav (but real features):**
- Agents
- AI Operations
- Flow Builder
- Revenue Pro
- (6 added in recent PR, but 6 still missing)

---

### 3. DASHBOARD PAGES (64 REAL PAGES)

**By category:**

#### Core Pages (Home)
- `/dashboard` (overview)
- `/dashboard/my-work`

#### Conversation Pages
- `/dashboard/inbox`
- `/dashboard/escalations`
- `/dashboard/quick-replies`
- `/dashboard/whatsapp-health`
- `/dashboard/meta-health`

#### Customer Pages
- `/dashboard/customers` + `/dashboard/customers/[id]`
- `/dashboard/customers/import`
- `/dashboard/leads`
- `/dashboard/segments`

#### Sales Pages
- `/dashboard/orders` + `/dashboard/orders/[id]`
- `/dashboard/products`
- `/dashboard/coupons`

#### Marketing Pages
- `/dashboard/broadcasts-pro`
- `/dashboard/recovery`
- `/dashboard/sms`
- `/dashboard/qr-queue`

#### Automation Pages
- `/dashboard/bot`
- `/dashboard/bot-builder`
- `/dashboard/automations`
- `/dashboard/knowledge`
- `/dashboard/working-hours`
- `/dashboard/flow-builder`
- `/dashboard/agents`
- `/dashboard/ai-operations`

#### Analytics Pages
- `/dashboard/analytics`
- `/dashboard/business-intelligence`
- `/dashboard/funnel`
- `/dashboard/revenue-copilot`
- `/dashboard/business`
- `/dashboard/revenue-pro`
- `/dashboard/export`

#### Settings Pages (18 pages)
- `/dashboard/settings`
- `/dashboard/billing`
- `/dashboard/usage`
- `/dashboard/wallet`
- `/dashboard/settings/providers` + `[domain]`
- `/dashboard/integrations`
- `/dashboard/branches`
- `/dashboard/approvals`
- `/dashboard/audit-log`
- `/dashboard/settings/numbers` + `[id]`
- `/dashboard/settings/ai-provider`
- `/dashboard/settings/bridge`
- `/dashboard/settings/business-profile`
- `/dashboard/settings/meta-cloud`
- `/dashboard/settings/orders`
- `/dashboard/settings/team`
- `/dashboard/developer`
- `/dashboard/system-health`
- `/dashboard/white-label`

#### SMS Pages
- `/dashboard/sms` (parent)
- `/dashboard/sms/credits`
- `/dashboard/sms/messages`
- `/dashboard/sms/providers`
- `/dashboard/sms/templates`

#### Developer Pages
- `/dashboard/developer`
- `/dashboard/developer/docs`
- `/dashboard/developer/sdk`

#### Special Pages
- `/dashboard/usage`
- `/dashboard/wallet`
- `/dashboard/working-hours`

---

### 4. API ROUTES (337)

337 documented API routes exist across:

- `/api/customers/*` — customer management
- `/api/messages/*` — messaging
- `/api/orders/*` — order management
- `/api/products/*` — product catalog
- `/api/broadcasts/*` — broadcast campaigns
- `/api/automations/*` — automation management
- `/api/team/*` — team management
- `/api/settings/*` — configuration
- `/api/billing/*` — billing & payments
- `/api/analytics/*` — reporting
- `/api/integrations/*` — 3rd party connectivity
- `/api/whatsapp/*` — WhatsApp-specific
- `/api/sms/*` — SMS sending & credits
- `/api/ai/*` — AI operations
- `/api/admin/*` — admin panel
- And 10+ more categories

---

## FEATURE MAPPING ANALYSIS

### Features with Dedicated Pages
- 47 top-level nav items
- 64 total pages
- Each page = 1+ features

### Features via Settings Sub-pages
- 13 settings categories
- Each represents 1-3 features

### Features via APIs Only
- Many backend-only features (webhooks, queues, integrations)
- No dedicated page but distinct API surface

### Features via Components/Modules
- Embedded features within pages
- Segments, routing, scheduling, templating
- Often don't have dedicated pages

---

## CAPABILITY-TO-FEATURE MAPPING

```
start (0)
├─ Inbox
├─ Auto-reply
├─ Bot Config
├─ Customer Management
├─ Order Management
├─ Quick Replies
├─ Basic Analytics
├─ Products
├─ Customer Import
└─ Data Export

growth (1)
├─ All Start features +
├─ Advanced Automations
├─ Broadcasts
├─ Broadcast Credits
├─ Recovery
├─ Segments
├─ Working Hours
├─ Team Management
├─ Lead Scoring
├─ Flow Builder
├─ Human Handoff
├─ Coupons & Discounts
├─ Broadcast Queue
├─ Escalations
├─ Compliance Monitoring
└─ Meta Cloud Integration

pro (2)
├─ All Growth features +
├─ Knowledge Base
├─ Smart Assistant
├─ Advanced Insights
├─ Sales Pipeline
├─ Customer Segmentation
├─ Smart Campaign Builder
├─ Next Best Action
├─ Revenue Copilot
├─ Advanced Analytics
├─ Revenue Attribution
├─ Revenue Forecasting
├─ Funnel Analytics
├─ Business Performance
├─ K1SMS
├─ SMS Messaging
├─ Shipping & Tracking
├─ Loyalty & Rewards
├─ Team Routing
├─ Support Inbox (SLA)
├─ Audit Log
├─ Integrations
├─ API Access
├─ Safety Controls
├─ Revenue Pro
├─ AI Operations
└─ System Health

enterprise (3)
└─ All Pro features +
   Multi-team
   Multi-branch
   Multi-WhatsApp
   Custom Integrations
   Approval Workflows
   Advanced Reporting
   White Label
   Dedicated Infrastructure
   Priority Support
   Custom Development
   SLA Agreement
   Custom Billing
```

---

## UNACCOUNTED FEATURES

### Pages WITHOUT explicit capability:
- `/dashboard/agents` (mapped to smart_assistant, not in nav)
- `/dashboard/flow-builder` (flow_builder, not in nav)
- `/dashboard/ai-operations` (ai_operations, not in nav)
- `/dashboard/revenue-pro` (revenue_pro, not in nav)
- `/dashboard/system-health` (system_health, not in nav)
- `/dashboard/white-label` (white_label, not in nav)

### APIs WITHOUT obvious page equivalent:
- Webhooks
- Integrations (many of them)
- File exports
- Batch operations
- Queue management
- Cron jobs

### Features IMPLIED but not explicitly inventoried:
- Message templating (components)
- Customer segmentation (embedded in broadcasts/segments)
- Employee permissions (embedded in team)
- WhatsApp number management (settings)
- SMS provider configuration (settings)
- Meta Cloud setup (settings)
- Bridge connection (settings)

---

## REAL FEATURE COUNT

### Conservative estimate: 111
- 47 nav items (customer-facing top-level)
- 17 settings categories / sub-pages
- 20+ component-level features (templating, routing, permissions, etc.)
- 15+ API-only features (webhooks, integrations, admin, etc.)
- 7+ features with multi-page workflows

### Realistic range: 120-150
- If we count each settings category as 1-3 features
- If we count sub-components separately
- If we count each API endpoint family as 1+ feature

### DO NOT claim:
- "We have 68 features" ← WRONG (these are capabilities)
- "We have 200+ features" ← UNVERIFIED (would need deeper mapping)
- A magic number ← Count only what we can document

---

## NEXT PHASE: IMPLEMENTATION ROADMAP

**Phase 2: Master Feature Registry**
- Define each feature with: ID, name, capability, page, API, plan, release, status

**Phase 3: Admin Feature Control Center**
- Feature overview dashboard
- Feature status management (live, beta, hidden, disabled)
- Feature → Plan assignment
- Feature → Release assignment
- Feature kill-switches
- Feature visibility control

**Phase 4: Customer Navigation Update**
- Auto-generate from registry
- Respect: plan, release, status, feature-control

**Phase 5: Integration**
- Bind: capabilities → features → pages → APIs → plans → navigation
- One source of truth

**Phase 6: Testing**
- Admin sees all features
- Customer sees only entitled features
- Feature-control respected everywhere
- No dead links
- No orphaned features

---

## RULES (UNCHANGEABLE)

1. DO NOT stop at 68 features
2. DO NOT invent features to reach a round number
3. DO NOT delete features because they share a capability
4. DO NOT rewrite WhatsApp send pipeline
5. DO NOT create duplicate entitlement systems
6. DO NOT hide implemented features from Admin
7. DO NOT expose internal QA/debug tools to customers

---

## OPEN QUESTIONS (For Phase 2)

1. Should each API route family count as 1 feature or multiple?
   - Example: POST/GET/DELETE /customers = 1 "Customer Management" or 3 features?

2. Are sub-pages of settings distinct features or parts of parent?
   - Example: `/dashboard/settings/ai-provider` = separate feature or part of Settings?

3. Which component-level features merit independent tracking?
   - Example: "Segment targeting" = feature or implementation detail?

4. What counts as "implemented"?
   - 50 lines of code threshold?
   - Shipped to customers?
   - Just has a page/API?

5. Should we inventory ALL APIs or just customer-facing ones?
   - 337 seems high; many may be internal plumbing

---

## CONCLUSION

WKEYONE contains **111+ real features**, organized across:
- 68 commercial capabilities
- 8 workspace workgroups
- 64 pages (3-5 more needed)
- 337 APIs
- Multiple component-level features

**Admin must see and control ALL of them.**
**Customer sees only what they're entitled to.**
**One canonical source of truth for all mappings.**

Ready for Phase 2 implementation.
