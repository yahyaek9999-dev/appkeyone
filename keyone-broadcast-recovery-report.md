# KEYONE — Smart Broadcast Campaigns + Recovery Engine

**Date:** 2026-06-01
**Commit:** `8e07052` — deployed & live in production (`SERVICE_RUNNING`, all routes healthy)
**Approach:** Extend the existing, mature broadcast + recovery infrastructure. **No rewrite, no new send path, no new npm packages.**

---

## 1. Built vs reused

**Reused as-is (not touched):** the `Broadcast`/`BroadcastItem` pipeline, the slow-draining cron + BullMQ worker (atomic claims, 2.5s pacing, cancellation, drift-guarded AI personalization, SafetyAudit), membership gating (`checkLimit`/`incrementUsage`), LID filtering, the protected outgoing queue (`wa.send(...,"broadcast")`), and the recovery **detectors** (`lib/intel/lost-customers`, `follow-up-ops`).

**New (extends/wires the above):**
- Audience segmentation, scheduling, coupon, image-as-link, AI message generator, honest campaign analytics, and a one-click Lost-Customer Recovery view with send/schedule/dismiss.

---

## 2. Schema delta (additive only — existing rows unchanged)

`prisma/schema.prisma`:
- `Broadcast` + `scheduledAt DateTime?`, `couponCode String?`, `imageUrl String?`, `kind String @default("campaign")` (campaign | recovery); new index `[status, scheduledAt]`.
- New `RecoveryDismissal { id, userId, customerId, kind, createdAt }` (`@@unique([userId,customerId,kind])`).

Replied/Conversion are **derived on read** — no counter columns. Applied to prod via `prisma db push --skip-generate` ("in sync", non-destructive).

---

## 3. Feature detail

### Campaign Builder (`/dashboard/broadcasts`)
- **Audience filters** (`lib/broadcasts/audience.ts`): all · hot · warm · **buyers** (orderCount>0) · **no_purchase** (=0) · **inactive** (lastSeenAt < now−N days) · **abandoned** (hesitationScore≥40) · **date_range** (createdAt between) · tag:. All map to existing Customer columns.
- **Schedule** now/later: cron gates on `scheduledAt` — immediate (null) always due, future held until `<= now`. Verified: immediate picked, future skipped.
- **Coupon + image link** (`lib/broadcasts/extras.ts`): appended **after** AI personalization so the LLM can never reword/drop the coupon; image is sent as a URL (WhatsApp auto-previews) — **no media path / WhatsApp-service change**. No-op when null → existing broadcasts unchanged.

### AI Message Generator (`/api/broadcasts/generate`)
- Campaign types: offer · discount · back_in_stock · reminder · abandoned_cart · seasonal · upsell. One bounded `llmChat` call via the merchant's provider (`botProviderOverride`). Returns editable Arabic text. Never sends. (Locally returns 502 when no LLM provider is configured — graceful; production has the provider.)

### Campaign Analytics (`/api/broadcasts/[id]/analytics`) — honest by design
- **Sent / Failed** (columns) · **Replied** (distinct recipients with an inbound message after send) · **Conversion** (distinct recipients with an order after send) + rates.
- **Delivered / Clicked → "غير متاح" (null).** We do not ingest WhatsApp delivery/read receipts and have no link-click tracking, so these are surfaced as not-available rather than fabricated.

### Lost-Customer Recovery (`/dashboard/recovery`)
- `/api/recovery` reuses the intel detectors (lost + follow-up), minus `RecoveryDismissal`.
- `/api/recovery/action`: **send now / schedule** create a single-recipient `Broadcast` (`kind:"recovery"`) that drains through the **same protected queue**; **dismiss** persists. Editable message per card.

---

## 4. Safety / queue compatibility

**Every send — campaigns and recovery — creates a `Broadcast` row that drains through the existing `cron → wa.send(...,"broadcast") → protected outgoing queue`.** There is no direct/bulk send anywhere in this feature. Pacing (2.5s), anti-flood, cooldown, and the WhatsApp protection engine are all inherited unchanged; recovery sends also pass the membership gate (`checkLimit("broadcast")`).

---

## 5. Files

```
prisma/schema.prisma                                   (M, additive)
lib/broadcasts/audience.ts                             (NEW)
lib/broadcasts/extras.ts                               (NEW)
app/api/broadcasts/route.ts                            (M — audience/schedule/coupon/image)
app/api/cron/broadcasts/route.ts                       (M — schedule gate + appendExtras)
workers/broadcast.worker.ts                            (M — appendExtras parity)
app/api/broadcasts/generate/route.ts                   (NEW)
app/api/broadcasts/[id]/analytics/route.ts             (NEW)
app/api/recovery/route.ts                              (NEW)
app/api/recovery/action/route.ts                       (NEW)
app/dashboard/broadcasts/broadcasts-ui.tsx            (M — builder + AI + analytics)
app/dashboard/recovery/{page,recovery-ui}.tsx          (NEW)
app/dashboard/nav-items.tsx                            (M — Recovery link)
deploy.sh                                              (M — prisma db push in stopped window)
```

---

## 6. Verification (all green)

- `tsc --noEmit` clean · `npm run build` compiled · **no package.json/lock changes**.
- In-process: audience filters build correctly; `appendExtras` works + no-op on null; **cron picks immediate, skips future-scheduled**; dismissal upsert.
- Authenticated HTTP: `/api/recovery` 200 · campaign create (no_purchase + coupon + schedule) 200 · analytics 200 with honest shape (delivered/clicked null) · recovery `send_now` creates a recovery broadcast 200 · generate graceful 502 (no local LLM) · `/dashboard/broadcasts` & `/dashboard/recovery` render 200 authed / 307 unauth.
- Existing broadcast behavior preserved (null extras = byte-identical send path).

---

## 7. Deploy notes

Deployed once via the staged, uninterrupted sequence: pull `main` → (auto-restart disabled) stop + clear `.next` → clean build to completion (`BUILD_ID` confirmed) → `prisma db push --skip-generate` (schema "in sync", additive) → restart + restore auto-restart → verify. `deploy.sh` now includes the schema-push step inside the stopped window. Post-deploy: `SERVICE_RUNNING` (stable, 2 node procs, no restart loop), `/api/health` 200, dashboards 307, broadcast/recovery APIs 401 — **no 500s**.

**Honesty note:** "Delivered" and "Clicked" are intentionally shown as not-available — adding them for real would require WhatsApp delivery receipts and a link-redirect tracker (future work, would touch the WhatsApp layer).
