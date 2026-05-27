# KEYONE Launch Final Report

**Date:** 2026-05-27  
**Commit:** `62f33ae`  
**Build:** 0 errors (tsc + next build)  
**Deploy:** VPS `217.154.163.16` — service running, health check OK  

---

## 1. Commerce Integrations UX

**Before:** Retry for failed webhook events not available.  
**After:** Dedicated `POST /api/commerce/events/retry` endpoint with retry button in event log. Users can now retry individual failed webhook events with one click.

**Files changed:**
- `saas/app/dashboard/integrations/integrations-ui.tsx` — added retry button for failed events
- `saas/app/api/commerce/events/retry/route.ts` — new API route

---

## 2. Admin Dashboard Controls

**Before:** Missing delete user, standalone usage reset, WhatsApp disconnect, order status update.  
**After:**

| Feature | Status | Endpoint |
|---------|--------|----------|
| Delete customer | Added | `POST /api/admin/users/[userId]/delete` |
| Reset usage counters | Added | `POST /api/admin/users/[userId]/reset-usage` |
| WhatsApp disconnect | Added | `POST /api/admin/whatsapp/disconnect` |
| Order status update | Added | `PATCH /api/admin/orders/[id]` |

**Files added:**
- `saas/app/api/admin/users/[userId]/delete/route.ts`
- `saas/app/api/admin/users/[userId]/reset-usage/route.ts`
- `saas/app/api/admin/whatsapp/disconnect/route.ts`
- `saas/app/api/admin/orders/[id]/route.ts`
- `saas/app/admin/orders/order-status-updater.tsx`
- `saas/app/admin/whatsapp/disconnect-wa.tsx`

**Files modified:**
- `saas/app/admin/users/users-ui.tsx` — delete/reset buttons + confirmation modals
- `saas/app/admin/orders/page.tsx` — inline status dropdown per order
- `saas/app/admin/whatsapp/page.tsx` — disconnect button per merchant

---

## 3. Order Extraction Accuracy

**Before:** Limited to Egypt/Saudi phone prefixes, 4 GCC cities, 7 payment methods, single-item extraction.  
**After:**

| Area | Improvements |
|------|------------|
| **Phone prefixes** | Added UAE (`+971`), Kuwait (`+965`), Qatar (`+974`), Bahrain (`+973`), Oman (`+968`) |
| **GCC cities** | Added 30+ cities across Saudi, UAE, Kuwait, Qatar, Bahrain, Oman |
| **Payment methods** | Added Tabby, Tamara, Apple Pay, urpay, valU |
| **Multi-item** | New `detectMultipleProducts()` — splits on `و` / `,` between product mentions |

**Files modified:**
- `saas/lib/order-extractor.ts` — expanded lexicons + multi-item detection
- `saas/lib/phone.ts` — 5 new GCC country prefixes

---

## 4. AI Quality

**Before:** Sales blocks were functional but generic.  
**After:** Refined all 7 persuasion blocks with more specific instructions:  
- `soft`: Ask about specific need instead of generic pressure
- `premium`: Send product images/links for quality confirmation
- `trust`: Offer cash-on-delivery to reduce anxiety
- `fast_close`: Ask preferred payment method, skip unnecessary questions
- `upsell`: Don't repeat if declined
- `ghost_recover`: Reference the specific product they were interested in

**Files modified:**
- `saas/lib/sales-engine.ts` — updated all `BLOCKS` entries

---

## 5. Validation

| Check | Result |
|-------|--------|
| `tsc --noEmit` | 0 errors |
| `npm run build` | 0 errors (64 pages generated) |

All new routes verified in build output:
- `/api/admin/orders/[id]`
- `/api/admin/users/[userId]/delete`
- `/api/admin/users/[userId]/reset-usage`
- `/api/admin/whatsapp/disconnect`
- `/api/commerce/events/retry`

---

## 6. Deploy

| Step | Status |
|------|--------|
| Backup | Pre-deploy SQLite + WhatsApp sessions snapshot |
| Code pull | `git fetch origin main` → `git reset --hard origin/main` |
| Dependencies | `npm ci` — 456 packages |
| Prisma | validated + db push (schema in sync) |
| TypeScript | `tsc --noEmit` passed |
| Build | `npm run build` — 0 errors |
| Service | `nssm start mse-saas` — OK |
| Health | `{"status":"ok","db":"ok","version":"62f33ae-20260527","latencyMs":5}` |

---

## Git History

```
4eaef8c → 62f33ae  launch: final sprint — GCC extraction, admin controls, commerce retry, AI prompts
```

14 files changed, 527 insertions, 31 deletions. All changes are additive — no breaking changes, no rewrites, no schema migrations.
