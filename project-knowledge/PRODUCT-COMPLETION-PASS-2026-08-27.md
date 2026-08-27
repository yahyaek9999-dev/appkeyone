# Product Completion Pass — 2026-08-27

Scope requested: 17 phases over all 83 capabilities. **This document reports one
completed, deployed increment and states plainly what was not covered.** It is
not a certification that the full pass ran.

## 1. Inventory (Phase 1)

Taken from source, not from a route list:

| | |
|---|---|
| dashboard pages | 96 — 47 `pageGate`+`LockedFeature` customer surfaces, 13 `requireAdmin` consoles, 36 ungated (core screens: inbox, products, settings/*, sms/*) |
| API route handlers | 351 |
| catalog capabilities | 83 |
| nav destinations | 71 unique hrefs |
| capabilities gated by a page | 37 distinct |

## 2. What was checked mechanically, across every screen

| Check | Result |
|---|---|
| **API↔UI contract** — every `fetch()` target resolves to a real route | **PASS, 0 broken.** Two apparent misses (`/api/approvals${q}`, `/api/prompts/${id}/${action}`) were artifacts of the scanner's template-literal handling; both resolve. The scanner was fixed and re-run before any conclusion was drawn |
| **Permanently-locked pages** — every `pageGate("x")` where `x` is a real catalog capability | **PASS, 0 bad.** This is the `/dashboard/plan` class of bug one layer down: a page gating on a non-capability locks forever because `caps[x]` is `undefined` at every tier |
| **Destructive actions without confirmation** | **PASS, 0.** Every `DELETE` path on a customer screen already went through `useConfirm` |
| **Empty / loading states** | 11 pages flagged, **all false positives on inspection** — fixed 7-day grids (`working-hours`), settings forms with no list (`white-label`), skeleton grids (`system-health`). No code churned for a regex artifact |
| **Silent mutation failures** | **41 real defects across 25 screens — FIXED, see §3** |

## 3. The one real defect class, and the fix

41 call sites wrote:

```js
await fetch(`/api/products/${p.id}`, { method: "DELETE" });
load();
```

The response was never read. On 402 (off-plan), 403 (wrong role) or 500 the list
reloaded unchanged — the row the customer just deleted was still there, with no
error and no toast. **The product read as broken rather than gated.**

Three sub-shapes, worst last:

1. **Silent** — delete/save/patch, nothing shown. 33 sites.
2. **Desynced** — `automations` and `commerce/integrations` flipped `enabled` in
   local state *after* an unchecked `PATCH`, so a rejected toggle still looked
   applied.
3. **Untrue** — `whatsapp-health` set its success message *before* the request
   resolved. A failed reconnect reported `بدأ إعادة الربط`, telling the merchant
   the opposite of what happened.

**Fix:** `components/ui/use-mutate.ts` — additive, one line per call site, no
component rewritten:

```js
if (!(await mutate(`/api/products/${p.id}`, { method: "DELETE" }))) return;
load();
```

Returns `false` on non-2xx after raising a toast built from the server's own
Arabic prose where one exists, and from the status otherwise (402 → "غير متاحة
في باقتك"، 403 → "لا تملك صلاحية"، 409 → "تعارض في البيانات"، 429، 5xx). Machine
codes like `bad_body` are deliberately suppressed — they mean nothing to a
merchant. Network failure has its own message, since it has no status to read.

`whatsapp-health` keeps its own `setMsg` idiom and gains a failure tone; its
multi-step restart now stops at the failed step. **No WhatsApp API or
send-pipeline code was touched** — only whether the screen believes the response.

**Deliberately not changed, with reasons:**

| | |
|---|---|
| `app/dashboard/arena/*` (8 sites) | behind `requireAdmin()`; not customer surface |
| `app/dashboard/whatsapp/whatsapp-ui.tsx` (2 sites) | dead code — its `page.tsx` is a pure redirect and nothing imports the file |
| `logout` | the navigation away is the feedback |

## 4. Regression protection (Phase 14)

`__tests__/no-silent-mutation.test.ts` fails the build on any new unchecked
mutating fetch, naming the exact site:

```
Unchecked mutation — the customer sees nothing when this fails:
  file=app/dashboard/coupons/coupons-ui.tsx:82
  code=await fetch(`/api/coupons/${c.id}`, { method: "DELETE" });
  fix=wrap with useMutate(): if (!(await mutate(...))) return;
```

Verified by reintroducing one silent delete and watching it fail, then
restoring. A third assertion makes the exemption list rot-proof: each entry must
point at a path that still exists.

## 5. Production state

```
HEAD (main)      : 6d8a8e3
DEPLOYED_COMMIT  : 6d8a8e3b104c6302b765494c92a9ea446ccc240a
HEALTH           : {"status":"ok","db":"ok","version":"6d8a8e3"}
SERVICE          : keyone.service active
BUILD            : ✓ compiled successfully
TESTS            : 298 passed / 16 files. 1 file fails — phase3-admin-features,
                   pre-existing on main at 1b561b3, stale hard-coded counts
DATABASE         : unchanged by this commit (no migration)
```

Fix confirmed present in the deployed build: the new error strings appear in 68
`.next` chunks; the `whatsapp-health` failure string in 5.

## 6. What this pass did NOT cover

Stated plainly so the gaps are not mistaken for clean results.

| Phase | Status |
|---|---|
| 2 — customer journey per feature | **Not done for 83 features.** Done for `multi_team` only |
| 4 — integration audit | Partial: `Team → member → conversation scope` built and tested end to end. The other pairings (Product→Order→Analytics, Segment→Broadcast, Knowledge→AI) not traced |
| 5 — cross-feature workflows | Not done |
| 6 — professional UX pass | Not done — no review of spacing, icon duplication, truncation, RTL, modal overflow, pagination, sorting |
| 11 — "almost complete" markers | Scan ran; 18 screens carry TODO/placeholder/mock markers. **Not triaged** |
| 12 / 17 — visual browser verification of the 41 fixes | **Not done.** The authenticated session expired mid-pass and I cannot log in myself. Verified at build level only |

## 7. Final status

```
NOT COMPLETE
```

One real defect class was found, fixed across 41 sites, locked with a regression
test, built, deployed and confirmed present in the running bundle. That is a
genuine increment — it is not the 17-phase pass over 83 capabilities, and the
remaining phases in §6 are untouched.

**Not APPROVED FOR SALES.** The blocking gap is §6: the completion pass has not
run for 82 of the 83 capabilities, and the fixes shipped here have not been
verified in a browser against production.
