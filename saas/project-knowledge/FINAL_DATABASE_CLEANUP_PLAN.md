# WKEYONE — Final Database Cleanup Plan
**Generated:** 2026-08-14

---

## Schema Status

| Schema File | Models | Status |
|-------------|--------|--------|
| prisma/schema.prisma (source) | 175 | ✅ Single source of truth |
| prisma/schema.postgres.prisma (derived) | 175 | ✅ In parity — regenerated via generate-pg-schema.sh |

**Verify parity:** `node scripts/verify/schema-parity.js`

---

## Models Added This Session (All Additive)

| Model | Purpose | Session |
|-------|---------|---------|
| WhatsAppNumber | Multi-number workspace slots | Session 4 |
| NumberSettings | Per-number configuration | Session 4 |
| UsageEvent | New atomic usage tracking | Session 5 |
| StaffMember (fields added) | passwordHash, inviteToken, lastLoginAt, lastLoginIp, inviteExpiresAt | Session 4 |
| TeamMember (fields added) | allowedNumberIds, conversationScope | Session 5 |
| Conversation (field added) | numberId (FK to WhatsAppNumber) | Session 4 |
| User (field added) | whatsAppNumbers[] reverse relation | Session 5 (bug fix) |

---

## Deployment-Safe Additive Principles

All changes follow these rules:
- `@default()` on every new field → existing rows unaffected
- New models: no FK constraints that would fail for existing data
- No `ALTER TABLE ... DROP COLUMN` — ever
- No `NOT NULL` without a `@default`
- Soft-delete only (`deletedAt`, never `DELETE FROM`)

---

## Cleanup Items (Advisory — Not Blocking)

### Data Cleanup (after migration period)
| Item | Current State | Safe to Clean? |
|------|--------------|----------------|
| Bot.teamMembersJson | Legacy JSON blob, superseded by TeamMember model | Yes — after 90-day transition |
| Subscription.msgsUsed | Legacy counter, superseded by UsageLedger | Keep — still read by plan checks |
| Old "Business/Scale" Plan rows | In DB for backward compat | Keep forever — existing subscribers |

### Code Cleanup (after migration period)
| Item | Status | When to Clean |
|------|--------|--------------|
| UsageLedger fallback in getUsageSummary() | Active bridge | Remove when checkAndCharge() is wired to send path |
| recordUsage() in lib/usage-ledger.ts | Still writing UsageLedger | Keep until above |
| Legacy plan tier mapping CAP_INDEX_BY_INTERNAL_TIER | Backward compat | Keep for legacy subscribers |

---

## Schema Operations Reference

### Development (local)
```bash
# Apply schema changes to local SQLite dev.db
npx prisma db push --schema=prisma/schema.prisma

# Regenerate PostgreSQL schema from source
bash scripts/generate-pg-schema.sh

# Verify parity
node scripts/verify/schema-parity.js
```

### Production (AWS, ubuntu@13.63.79.43)
```bash
# Additive-only push — never destructive
npx prisma db push --schema=prisma/schema.postgres.prisma

# The deploy script handles this automatically:
cd /opt/app && git pull && bash deploy/release-aws.sh
```

**Never run:** `prisma migrate reset`, `prisma db push --force-reset`, or any manual `DROP TABLE/COLUMN` without explicit owner approval.

---

## Index Strategy

Critical indexes already in place:

| Table | Index | Purpose |
|-------|-------|---------|
| Customer | userId, phone, createdAt | Inbox list performance |
| Conversation | userId, queueState, assignedStaffId | Queue filtering |
| WhatsAppNumber | userId, isPrimary, status | Number management |
| UsageEvent | userId+period+eventType, userId+numberId+period | Usage queries |
| UsageLedger | userId+createdAt, userId+kind+createdAt | Period aggregation |
| FeatureControl | featureId (unique) | Cache miss lookup |
| TeamMember | ownerId+email (unique), ownerId | Auth + roster |

---

## Emergency Rollback

If a schema push causes issues:

1. `prisma db push` is additive-only — new columns with defaults are safe
2. Rolling back code is safe — old code ignores new nullable columns
3. New models: rows simply don't exist, code fails-open
4. NEVER roll back by dropping tables — mark data as deleted instead

All migration-related prod changes require owner (yahyaemad999@gmail.com) sign-off before execution.
