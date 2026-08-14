# WKEYONE — Final Dependency Graph
**Generated:** 2026-08-14

## System Dependency Chain

```
AUTH
  └── getAuthContext() ──────────────────────────────────────────────────────
        ├── mse_session cookie (owner: {uid,pwc} | member: {mid})
        └── mse_staff_session cookie → admin layout Path B
              └── StaffMember.active check

MEMBERSHIP LAYER (getEntitlements)
  └── Step 1: Plan.slug → capabilitiesForIndex()
        └── CAPABILITIES from pricing/catalog.ts
  └── Step 2: CustomerPlanOverride (admin custom deal)
  └── Step 3: PromotionRedemption (feature_unlock | credit_bonus)
        └── fetchActivePromoUnlocks() → PromotionRedemption + Promotion
  └── Step 4: EntitlementGift (feature_unlock | plan_upgrade | credits)
        └── fetchActiveGifts() → EntitlementGift
  └── Step 5: FeatureControl kill switch ← NEW (was missing)
        └── getAllFeatures() [30s cached] → kills capabilities[featureId]

FEATURE CONTROL (isFeatureEnabled)
  └── loadAll() [30s cached] → FeatureControl table
        ├── killSwitch=true → disabled
        ├── status ≠ "enabled" → disabled
        └── dependencies[] → recursive check (max depth 20, cycle guard)

NAV VISIBILITY
  └── navItemVisible(item, opts)
        ├── can(role, perm) → RBAC
        ├── PRE_ACTIVATION_HREFS check
        ├── mode filter (qr|meta)
        ├── NAV_MODULE_BY_HREF → Business Type module gating
        └── NAV_CAP_BY_HREF → plan capability gating
              └── /dashboard/settings/numbers → multi_whatsapp ← NEW (was missing)

INBOX ACCESS
  └── /api/inbox/conversations
        ├── getAuthContext() → isMember? assignedStaffId filter
        └── teamMember.allowedNumberIds → numberId IN [...] filter ← NEW

USAGE ACCOUNTING
  └── getUsageSummary(userId, period)
        ├── UsageEvent table (new system)
        └── UsageLedger table (legacy, fallback) ← NEW fallback added

WORKING HOURS
  └── bot.workingHoursEnabled → parse bot.workingHours JSON ← TODO CLOSED
        └── [{day,from,to,enabled}] → find today's slot → {from:number, to:number}
        └── assessAndShape() → shouldStaySilent()

MULTI-WHATSAPP NUMBERS
  └── POST /api/numbers
        ├── isFeatureEnabled("multi_whatsapp") → feature control gate ← NEW
        ├── getEntitlements().limits.whatsapp → plan limit gate
        └── WhatsAppNumber.create()

ADMIN LAYOUT ACCESS
  └── Path A: mse_session + User.role === "admin"
  └── Path B: mse_staff_session JWT → StaffMember.active ← NEW (was missing)
```

## Critical Data Flow: Message In

```
Customer sends WhatsApp →
  /api/whatsapp/incoming →
    getAuthContext() scope check →
      Bot.workingHoursEnabled? → parse workingHours JSON → today's slot →
        assessAndShape() → humanize delays →
          isFeatureEnabled("support_inbox")? (if kill switch active) →
            Bot executor (11 node types, MAX_DEPTH=50) →
              ConvBotLock mutex (1-min TTL) →
                AI reply generated →
                  checkAndCharge(userId, "message_out") →
                    getEntitlements().limits.messages → quota check →
                      WhatsApp send pipeline (NEVER modified)
```

## Model Dependency Map

| Model | Depends On |
|-------|-----------|
| WhatsAppNumber | User (userId) ← reverse relation added |
| NumberSettings | WhatsAppNumber (1:1) |
| Conversation | User, Customer, WhatsAppNumber? (numberId) |
| TeamMember | User (ownerId, "TeamOwner" relation) |
| UsageEvent | (no Prisma relation — userId is raw string) |
| PromotionRedemption | User (userId), Promotion (promoId) |
| EntitlementGift | User (userId) |
| CustomerPlanOverride | User (userId) |
| StaffMember | (standalone — no User relation) |
| FeatureControl | (standalone — no User relation) |
