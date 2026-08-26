# Feature Visibility: Deployment & Test Plan

**Status:** Code complete, ready for testing and deployment  
**Changes:**
- ✅ `saas/lib/feature-control.ts` — seed derives `customerVisible = !cap.comingSoon`
- ✅ `saas/app/admin/feature-control/page.tsx` — simplified visibility display (2 states only)
- ✅ Commits: `0dd31fb`, `5219a56`, `f45c32d`

---

## Deployment Steps

### 1. Deploy Code
```bash
git push origin claude/feature-visibility-entitlement-9050c5
# or merge to main
```

### 2. Seed the Database
Once deployed, admin must run the seed to set all 83 features to correct visibility:

**Via Admin UI:**
```
1. Navigate to /admin/feature-control
2. Click "مزامنة من الكتالوج" button
3. Wait for seed to complete
4. Refresh page
```

**Or via API:**
```bash
POST /api/admin/feature-control
{
  "action": "seed"
}
```

**Expected Result:**
- 82 features: `customerVisible = true`
- 1 feature (white_label): `customerVisible = false` (coming soon)

---

## Testing Checklist

### Phase 1: Admin UI (Feature Control)

**Test: Visibility Toggle**

1. Go to `/admin/feature-control`
2. Find any feature (e.g., "WhatsApp Inbox")
3. Click the feature row to open drawer
4. Find toggle: "ظهور للعملاء"
5. Toggle OFF → should show "مخفي عن العملاء"
6. Toggle ON → should show "ظاهر للعملاء"
7. Click "حفظ" (Save)
8. **Verify:** Toast shows "تم التحديث" ✓

**Test: DB Persistence**

1. After toggling OFF and saving
2. Refresh page (F5)
3. Find same feature again
4. Open drawer
5. **Verify:** Toggle is still OFF ✓
6. Toggle ON and save
7. Refresh again
8. **Verify:** Toggle is back ON ✓

**Test: Table Display**

1. In table view, look at "ظهور للعملاء" column
2. For feature that's visible: should show "ظاهر للعملاء" in green
3. For hidden feature: should show "مخفي عن العملاء" in gray
4. **Verify:** Only two states shown (not three) ✓

**Test: All 83 Features Present**

```sql
SELECT COUNT(*) FROM "FeatureControl";
-- Expected: 83
```

### Phase 2: Customer Navigation

**Test: START Customer (Locked Feature)**

1. Login as START customer
2. Feature available: `inbox` → should work ✓
3. Feature locked: `smart_assistant` (Pro) → should show:
   - Feature in nav
   - Click → shows "متاح في باقة Pro" or similar
   - NOT 404 or completely hidden ✓
4. Feature hidden: (none should be hidden except white_label)

**Test: GROWTH Customer**

1. Login as GROWTH customer
2. Locked feature: `knowledge_base` (Pro) → should be visible but locked ✓
3. Own feature: `broadcasts` → should work ✓

**Test: PRO Customer**

1. Login as PRO customer  
2. Locked feature: `multi_team` (Enterprise) → visible but locked ✓
3. Own features → should work ✓

**Test: ENTERPRISE Customer**

1. Login as ENTERPRISE customer
2. All 82 features should work ✓
3. white_label: should show "قريباً" ✓

**Test: ADMIN**

1. Login as admin
2. Should see all 83 features in nav
3. Should have access to all features
4. Feature Control UI should be accessible

### Phase 3: API Entitlement (Still Protected)

**Test: START customer cannot use PRO API**

```bash
curl -H "Authorization: Bearer START_TOKEN" \
  https://api.keyone.com/api/smart-assistant

# Expected: 402 Unauthorized
```

**Test: PRO customer CAN use PRO API**

```bash
curl -H "Authorization: Bearer PRO_TOKEN" \
  https://api.keyone.com/api/smart-assistant

# Expected: 200 OK (or relevant data)
```

### Phase 4: Database State Verification

```sql
-- Verify seed results
SELECT COUNT(*) as total FROM "FeatureControl";
-- Expected: 83

SELECT COUNT(*) as visible FROM "FeatureControl" 
WHERE "customerVisible" = true;
-- Expected: 82

SELECT COUNT(*) as hidden FROM "FeatureControl" 
WHERE "customerVisible" = false;
-- Expected: 1 (white_label)

-- Check white_label specifically
SELECT "featureId", "customerVisible", "status" 
FROM "FeatureControl" 
WHERE "featureId" = 'white_label';
-- Expected: white_label | false | hidden
```

---

## Rollback Plan

If issues found during testing:

**Option 1: Revert to previous behavior**
```bash
git revert 0dd31fb  # Revert seed change
git revert f45c32d  # Revert UI change
git push
```

**Option 2: Manually reset features**
```sql
-- Set all 82 product features back to visible
UPDATE "FeatureControl" 
SET "customerVisible" = true
WHERE "featureId" NOT IN ('white_label');

-- Keep white_label hidden
UPDATE "FeatureControl" 
SET "customerVisible" = false
WHERE "featureId" = 'white_label';
```

---

## Success Criteria

✅ **Admin UI:**
- [ ] Toggle visible in drawer
- [ ] Toggle saves to DB
- [ ] Value persists on reload
- [ ] Table shows only "ظاهر" / "مخفي"

✅ **Customer Experience:**
- [ ] START sees all 83, locked features show upgrade UI
- [ ] GROWTH sees all 83, locked features show upgrade UI
- [ ] PRO sees all 83, locked features show upgrade UI
- [ ] ENTERPRISE sees all 82 working + white_label coming soon
- [ ] API still enforces 402 for unauthorized capabilities

✅ **Database:**
- [ ] 83 features in FeatureControl
- [ ] 82 have customerVisible=true
- [ ] 1 (white_label) has customerVisible=false
- [ ] Status and plan entitlements unchanged

✅ **No Regression:**
- [ ] Other admin functions work
- [ ] Nav still filters by entitlement (not visibility)
- [ ] APIs still enforce access control
- [ ] Release trains still work
- [ ] Kill switches still work

---

## Timeline

- **Deployment:** Run seed once (5 min)
- **Phase 1 Testing:** 15 min
- **Phase 2 Testing:** 20 min per tier = 100 min (5 tiers)
- **Phase 3 Testing:** 10 min
- **Phase 4 Verification:** 10 min
- **Total:** ~2.5 hours

---

## Notes

- The fix is **idempotent** — running seed multiple times is safe
- UI shows only **two states** as requested: ظاهر / مخفي
- Plan entitlement is **completely separate** from visibility
- All **83 features are product features** — no admin-only classification
- **Coming soon (white_label)** stays hidden until released

---

## Contacts & Questions

If issues during testing:
1. Check DB state with SQL queries above
2. Verify seed completed successfully in logs
3. Check feature control toggle in drawer works
4. Verify no errors in browser console or server logs
