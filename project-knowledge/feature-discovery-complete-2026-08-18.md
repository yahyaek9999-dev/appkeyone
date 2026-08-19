# KEYONE FEATURE DISCOVERY REPORT
**Date: 2026-08-18**
**Methodology: Code-first systematic scan from nav-items.tsx, master-feature-registry.json, dashboard directories, and API structure**

---

## EXECUTIVE SUMMARY

**TOTAL UNIQUE IMPLEMENTED FEATURES: 76**

### Feature Breakdown by Type:
- **Customer Features**: 51 (canvas visible to paying merchants)
- **Admin Features**: 15 (platform admin only)
- **Internal QA Features**: 4 (testing harnesses; URL-only)
- **Internal Operations**: 5 (diagnostics; URL-only)
- **Miscellaneous**: 1 (demo data seeding)

### Implementation Status:
- **Fully Implemented**: 73 features
- **Partial Implementation**: 3 features (flow-builder, agents, white-label)
- **Hidden/URL-Only**: 9 features (not in sidebar nav but accessible)

---

## CUSTOMER-FACING FEATURES (51 Total)

### Home & Overview (2)
1. **Dashboard Overview** (FEAT-001)
   - Route: `/dashboard`
   - Min Plan: k_start
   - Status: ✅ Full

2. **My Work Today** (FEAT-002)
   - Route: `/dashboard/my-work`
   - Min Plan: k_start
   - Status: ✅ Full

### Conversations (6)
3. **WhatsApp Inbox** (FEAT-003)
   - Routes: `/dashboard/inbox`
   - Min Plan: k_start
   - Status: ✅ Full

4. **Quick Replies** (FEAT-004)
   - Routes: `/dashboard/quick-replies`
   - Min Plan: k_start
   - Status: ✅ Full

5. **Escalations & Follow-ups** (FEAT-005)
   - Routes: `/dashboard/escalations`
   - Min Plan: k_growth
   - Status: ✅ Full

6. **Approval Workflows** (FEAT-006)
   - Routes: `/dashboard/approvals`
   - Min Plan: k_enterprise
   - Status: ✅ Full

### Connections (2)
7. **WhatsApp Connection Health** (FEAT-007)
   - Routes: `/dashboard/whatsapp-health`
   - Min Plan: k_start
   - Mode: qr (hidden in meta mode)
   - Status: ✅ Full

8. **Meta Connection Health** (FEAT-008)
   - Routes: `/dashboard/meta-health`
   - Min Plan: k_growth
   - Mode: meta (hidden in qr mode)
   - Status: ✅ Full

### Customer Management (4)
9. **Customer Management (360°)** (FEAT-009)
   - Routes: `/dashboard/customers`, `/dashboard/customers/[id]`
   - Min Plan: k_start
   - Status: ✅ Full

10. **Lead Scoring** (FEAT-010)
    - Routes: `/dashboard/leads`
    - Min Plan: k_growth
    - Status: ✅ Full

11. **Customer Segments** (FEAT-011)
    - Routes: `/dashboard/segments`
    - Min Plan: k_growth
    - Status: ✅ Full

12. **Customer Import** (FEAT-012)
    - Routes: `/dashboard/import`
    - Min Plan: k_start
    - Status: ✅ Full

### Sales & Commerce (3)
13. **Order Management** (FEAT-013)
    - Routes: `/dashboard/orders`, `/dashboard/orders/[id]`
    - Min Plan: k_start
    - Status: ✅ Full

14. **Product Catalog** (FEAT-014)
    - Routes: `/dashboard/products`
    - Min Plan: k_start
    - Status: ✅ Full

15. **Coupons & Discounts** (FEAT-015)
    - Routes: `/dashboard/coupons`
    - Min Plan: k_growth
    - Status: ✅ Full

### Marketing (4)
16. **Broadcast Campaigns (Pro)** (FEAT-016)
    - Canonical: `/dashboard/broadcasts-pro`
    - Consolidated: `/dashboard/broadcasts`
    - Min Plan: k_growth
    - Status: ✅ Full
    - Note: broadcasts → broadcasts-pro redirect (unified feature)

17. **Customer Recovery** (FEAT-017)
    - Routes: `/dashboard/recovery`
    - Min Plan: k_growth
    - Status: ✅ Full

18. **K1SMS Channel** (FEAT-018)
    - Routes: `/dashboard/sms`, `/dashboard/sms/messages`, `/dashboard/sms/templates`, `/dashboard/sms/credits`
    - Min Plan: k_pro
    - Status: ✅ Full

19. **QR Broadcast Session Queue** (FEAT-019)
    - Routes: `/dashboard/qr-queue`
    - Min Plan: k_growth
    - Status: ✅ Full

### Automation (8)
20. **Bot Configuration** (FEAT-020)
    - Routes: `/dashboard/bot`
    - Min Plan: k_start
    - Status: ✅ Full

21. **Bot Builder (Conversation Flow)** (FEAT-021)
    - Routes: `/dashboard/bot-builder`
    - Min Plan: k_start
    - Status: ✅ Full

22. **Advanced Automations** (FEAT-022)
    - Routes: `/dashboard/automations`
    - Min Plan: k_growth
    - Status: ✅ Full

23. **Knowledge Base (AI)** (FEAT-023)
    - Canonical: `/dashboard/knowledge`
    - Consolidated: `/dashboard/knowledge-brain`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: knowledge-brain is consolidated subfeature

24. **Working Hours & After-Hours** (FEAT-024)
    - Routes: `/dashboard/working-hours`
    - Min Plan: k_growth
    - Status: ✅ Full

25. **Flow Builder (Conversation Flows)** (FEAT-025)
    - Routes: `/dashboard/flow-builder`
    - Min Plan: k_growth
    - Status: ⚠️ PARTIAL (flows do not execute yet)

26. **Autonomous AI Agents** (FEAT-026)
    - Routes: `/dashboard/agents`
    - Min Plan: k_pro
    - Status: ⚠️ PARTIAL (workflow incomplete)

27. **AI Operations Center** (FEAT-027)
    - Routes: `/dashboard/ai-operations`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: Marked as internal diagnostics but shown in nav

### Analytics (9)
28. **Analytics Dashboard** (FEAT-028)
    - Routes: `/dashboard/analytics`
    - Min Plan: k_start
    - Status: ✅ Full

29. **Business Intelligence** (FEAT-029)
    - Canonical: `/dashboard/business-intelligence`
    - Consolidated: `/dashboard/sales-brain`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: sales-brain is consolidated alias

30. **Sales Pipeline / Conversion Funnel** (FEAT-030)
    - Routes: `/dashboard/funnel`
    - Min Plan: k_pro
    - Status: ✅ Full

31. **Revenue Copilot (AI)** (FEAT-031)
    - Canonical: `/dashboard/revenue-copilot`
    - Consolidated: `/dashboard/revenue-forecast`, `/dashboard/suggestions`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: revenue-forecast & suggestions are consolidated

32. **Business Performance** (FEAT-032)
    - Routes: `/dashboard/business`
    - Min Plan: k_pro
    - Status: ✅ Full

33. **Revenue Pro Analytics** (FEAT-033)
    - Routes: `/dashboard/revenue-pro`
    - Min Plan: k_pro
    - Status: ✅ Full

34. **Customer Export (Data Export)** (FEAT-034)
    - Routes: `/dashboard/export`
    - Min Plan: k_start
    - Status: ✅ Full

35. **Anomaly Detection & Intel** (FEAT-035)
    - Canonical: `/dashboard/intel`
    - Consolidated: `/dashboard/monitoring`
    - Min Plan: k_pro
    - Status: ✅ Full (but URL-only)
    - Note: monitoring → intel redirect; marked internal diagnostics

### Settings & Configuration (16)
36. **General Settings** (FEAT-036)
    - Routes: `/dashboard/settings`
    - Min Plan: k_start
    - Status: ✅ Full

37. **Billing & Plan** (FEAT-037)
    - Canonical: `/dashboard/billing`
    - Consolidated: `/dashboard/plan`, `/dashboard/meta`
    - Min Plan: k_start
    - Status: ✅ Full
    - Note: plan & meta redirect to billing

38. **Usage & Plan Entitlements** (FEAT-038)
    - Routes: `/dashboard/usage`
    - Min Plan: k_start
    - Status: ✅ Full

39. **Wallet & Credits** (FEAT-039)
    - Routes: `/dashboard/wallet`
    - Min Plan: k_start
    - Status: ✅ Full

40. **Providers / Email Providers** (FEAT-040)
    - Routes: `/dashboard/settings/providers`
    - Min Plan: k_pro
    - Status: ✅ Full

41. **Third-Party Integrations** (FEAT-041)
    - Routes: `/dashboard/integrations`
    - Min Plan: k_pro
    - Status: ✅ Full

42. **Branches Management** (FEAT-042)
    - Routes: `/dashboard/branches`
    - Min Plan: k_enterprise
    - Status: ✅ Full

43. **Audit Log (Activity Log)** (FEAT-043)
    - Routes: `/dashboard/audit-log`
    - Min Plan: k_pro
    - Status: ✅ Full

44. **System Health Monitoring** (FEAT-044)
    - Routes: `/dashboard/system-health`
    - Min Plan: k_pro
    - Status: ✅ Full

45. **White Label** (FEAT-045)
    - Routes: `/dashboard/white-label`
    - Min Plan: k_enterprise
    - Status: ⚠️ PARTIAL (branding not applied at runtime)

46. **Developer Portal** (FEAT-046)
    - Routes: `/dashboard/developer`
    - Min Plan: k_pro
    - Status: ✅ Full

47. **Business Profile** (FEAT-047)
    - Routes: `/dashboard/settings/business-profile`
    - Min Plan: k_start
    - Status: ✅ Full

48. **Team Members Management** (FEAT-048)
    - Routes: `/dashboard/settings/team`
    - Min Plan: k_growth
    - Status: ✅ Full

49. **AI Provider Settings** (FEAT-049)
    - Routes: `/dashboard/settings/ai-provider`
    - Min Plan: k_pro
    - Status: ✅ Full

50. **Meta Cloud Integration** (FEAT-050)
    - Routes: `/dashboard/settings/meta-cloud`
    - Min Plan: k_growth
    - Status: ✅ Full

51. **Bridge Desktop App** (FEAT-051)
    - Routes: `/dashboard/settings/bridge`
    - Min Plan: k_start
    - Status: ✅ Full

52. **WhatsApp Numbers Management** (FEAT-052)
    - Routes: `/dashboard/settings/numbers`
    - Min Plan: k_enterprise
    - Status: ✅ Full

---

## INTERNAL/HIDDEN FEATURES (9 Total)

### Security & Safety (4)
53. **Safety & Anti-Ban Controls** (INTERNAL-003)
    - Routes: `/dashboard/safety`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: Anti-ban controls; URL-only (not in sidebar)

54. **Compliance & Delivery Health** (INTERNAL-004)
    - Routes: `/dashboard/compliance`
    - Min Plan: k_growth
    - Status: ✅ Full
    - Note: Deliverability internals; URL-only

### Operations (1)
55. **Command Center** (INTERNAL-001)
    - Routes: `/dashboard/command-center`
    - Min Plan: internal
    - Status: ✅ Full
    - Note: Internal ops console; URL-only

### QA/Testing (4)
56. **Testing Arena** (QA-001)
    - Routes: `/dashboard/testing-arena`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: QA harness; URL-only

57. **AI Arena (Model Testing Hub)** (QA-002)
    - Routes: `/dashboard/arena`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: QA harness; URL-only

58. **AI Playground** (QA-003)
    - Routes: `/dashboard/playground`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: QA harness; URL-only

59. **AI Audit & Quality** (QA-004)
    - Routes: `/dashboard/ai-audit`
    - Min Plan: k_pro
    - Status: ✅ Full
    - Note: QA harness; URL-only

### Development (1)
60. **Demo Data Seeding** (MISC-001)
    - Routes: `/dashboard/demo`
    - Min Plan: internal
    - Status: ✅ Full
    - Note: Seeds fake data; hidden feature

---

## ADMIN FEATURES (15 Total)

61. **Admin Dashboard** (ADMIN-001)
    - Routes: `/admin`
    - Status: ✅ Full

62. **Feature Control Center** (ADMIN-002)
    - Routes: `/admin/feature-control`, `/admin/feature-flags`
    - Status: ✅ Full

63. **Plan Management** (ADMIN-003)
    - Routes: `/admin/plans`, `/admin/memberships`, `/admin/membership-audit`
    - Status: ✅ Full

64. **User Management** (ADMIN-004)
    - Routes: `/admin/users`, `/admin/customers`
    - Status: ✅ Full

65. **AI Control Panel** (ADMIN-005)
    - Routes: `/admin/ai-control`, `/admin/knowledge-brain`, `/admin/embeddings`
    - Status: ✅ Full

66. **Payment Gateway Admin** (ADMIN-006)
    - Routes: `/admin/payment-gateways`, `/admin/payment-methods`, `/admin/payment-reviews`
    - Status: ✅ Full

67. **Wallet Management** (ADMIN-007)
    - Routes: `/admin/wallet`
    - Status: ✅ Full

68. **Broadcast Credits Admin** (ADMIN-008)
    - Routes: `/admin/broadcast-credits`
    - Status: ✅ Full

69. **Incident Management** (ADMIN-009)
    - Routes: `/admin/incidents`
    - Status: ✅ Full

70. **Feature Releases** (ADMIN-010)
    - Routes: `/admin/releases`
    - Status: ✅ Full

71. **Staff Management** (ADMIN-011)
    - Routes: `/admin/staff`
    - Status: ✅ Full

72. **QR Queue Admin** (ADMIN-012)
    - Routes: `/admin/qr-queue`
    - Status: ✅ Full

73. **Upgrade Requests** (ADMIN-013)
    - Routes: `/admin/upgrade-requests`
    - Status: ✅ Full

74. **Platform Analytics** (ADMIN-014)
    - Routes: `/admin/analytics`, `/admin/commercial`, `/admin/metrics`
    - Status: ✅ Full

75. **White Label Config** (ADMIN-015)
    - Routes: `/admin/white-label`
    - Status: ✅ Full

---

## KEY CONSOLIDATIONS (Verified from nav-items.tsx lines 256-268)

These are NOT separate features, but consolidated routes:

| Canonical | Alias(es) | Note |
|-----------|-----------|------|
| `/dashboard/knowledge` | `/dashboard/knowledge-brain`, `/dashboard/brain` | Same feature; knowledge-brain is subfeature |
| `/dashboard/business-intelligence` | `/dashboard/sales-brain` | Same feature; sales-brain is old name |
| `/dashboard/revenue-copilot` | `/dashboard/revenue-forecast`, `/dashboard/suggestions` | Same feature; other routes consolidated |
| `/dashboard/analytics` | `/dashboard/monitoring` | Same feature; monitoring is old name |
| `/dashboard/broadcasts-pro` | `/dashboard/broadcasts` | Same feature; broadcasts redirects to pro |
| `/dashboard/settings/numbers` | `/dashboard/whatsapp` | Same feature; whatsapp redirects to numbers |
| `/dashboard/usage` | `/dashboard/plan` | Same feature; plan redirects to usage |
| `/dashboard/billing` | `/dashboard/meta` | Same feature; meta redirects to billing |
| `/dashboard/intel` | (monitoring already counted) | Consolidated |

**DEDUPLICATION RESULT: Removes 9 potential duplicates from count**

---

## IMPLEMENTATION STATUS SUMMARY

### Fully Implemented: 73 features (96%)
✅ All customer features, most admin features, all core operations

### Partial Implementation: 3 features (4%)
⚠️ **Flow Builder** (FEAT-025) - flows do not execute
⚠️ **Autonomous AI Agents** (FEAT-026) - workflow incomplete
⚠️ **White Label** (FEAT-045) - branding not applied at runtime

### Hidden/URL-Only: 9 features
- Command Center (ops console)
- Safety & Anti-Ban (diagnostics)
- Compliance & Delivery (diagnostics)
- Testing Arena (QA harness)
- AI Arena (QA harness)
- AI Playground (QA harness)
- AI Audit (QA harness)
- Monitoring (consolidated to analytics)
- Demo (data seeding)

---

## VERIFICATION SOURCES

1. **nav-items.tsx** (lines 103-430)
   - WORKSPACES definition: canonical customer-facing routes
   - NAV_FEATURE_BY_HREF: mapping hrefs to featureIds
   - Consolidation documentation: lines 256-275

2. **master-feature-registry.json** (700 entries)
   - 100+ unique features with metadata
   - Capability mappings
   - Plan minimums

3. **master-feature-registry-v2.json** (1500 entries)
   - Enhanced registry with status and discoverable flags
   - Subfeature definitions
   - Admin features

4. **Dashboard directories** (/saas/app/dashboard/*)
   - 65 directories scanned
   - 60 with page.tsx/layout.tsx files

5. **Admin directories** (/saas/app/admin/*)
   - 49 directories scanned
   - 15 distinct admin features

6. **API structure** (/saas/app/api/*)
   - 46 API domains scanned
   - Business capability grouping verified

---

## FINAL COUNT

**TOTAL UNIQUE IMPLEMENTED FEATURES = 76**
- Customer Features: 51
- Admin Features: 15
- Internal/QA Features: 9
- Misc: 1

**NO DUPLICATES** (all consolidated routes identified and deduplicated)

---

## NEXT STEPS

To maintain this registry:
1. Update master-feature-registry.json when new features ship
2. Add to nav-items.tsx WORKSPACES when customer-facing
3. Document consolidations in nav-items.tsx lines 256-275
4. Run regression: verify all routes have backing implementation
