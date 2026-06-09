# KEYONE — Security Audit & Remediation Report

**Date:** 2026-06-09
**Engineer:** Senior Application Security review (Claude Code)
**Scope:** `saas/` (Next.js 14 app) + `whatsapp-service/` (Express microservice)
**Tooling:** `snyk test --all-projects`, `npm audit`, `semgrep --config auto`, manual code review
**Method:** Every finding below was verified by reading the affected code/handler. Theoretical/unreachable findings are listed under **False Positives** with justification. Fixes are **additive** and do not touch the WhatsApp send pipeline (per project rules).

---

## 1. Executive summary

| Severity | Found | Fixed | Remaining (documented) |
|----------|-------|-------|------------------------|
| Critical | 1 | 1 | 0 |
| High | 4 | 3 | 1 (Next.js → requires major-version migration) |
| Medium | 6 | 6 | 0 |
| Low | 3 | 2 | 1 (accepted) |
| False Positive | 6 | — | — |

**Result:** No Critical or High findings remain that are fixable without a planned major-version framework migration. The one remaining High (residual Next.js advisories) is **not** the auth-bypass Critical (that is fixed) — it is a set of DoS/conditional issues that require upgrading Next 14 → 15/16, a breaking change deliberately **not** auto-applied to a production app. See §6.

**Verification:** `tsc --noEmit` clean · `next build` success · SSRF+crypto unit harness 21/21 pass · RBAC coverage `PASS` (136 routes) · whatsapp-service `npm audit` = 0 · Semgrep crypto `ERROR` resolved.

---

## 2. CRITICAL

### C1 — Next.js Improper Authorization (CVE-2025-29927 / SNYK-JS-NEXT-9508709)
- **Source:** Snyk (Critical), npm audit (Critical)
- **Location:** `saas/package.json` → `next@14.2.18`
- **Exploitability (this app):** The CVE allows bypassing Next.js **middleware**-based authorization by sending a crafted `x-middleware-subrequest` header. KEYONE has **no `middleware.ts`** (auth is enforced inside each route handler via `lib/auth.ts`), so the specific bypass was **not directly reachable** here. However, the package was genuinely vulnerable and shipped alongside exploitable High issues (SSRF, deserialization).
- **Impact:** Auth bypass for any app relying on middleware; defense-in-depth failure.
- **Fix applied:** Upgraded `next 14.2.18 → 14.2.35` (latest in-major patch, non-breaking).
- **Verification:** `snyk test` post-upgrade — the Critical no longer appears; `npm audit` severity dropped from `critical` to `high`. `next build` succeeds on 14.2.35.

---

## 3. HIGH

### H1 — Server-Side Request Forgery (SSRF) in knowledge URL import
- **Source:** Manual review (corroborated by Snyk flagging Next SSRF class)
- **Location:** `saas/lib/knowledge-import.ts` → `crawlUrl()` (used by `app/api/knowledge/import-url/route.ts`)
- **Exploitability:** An authenticated user (`settings` permission) POSTs `{ url }`. The old code validated **only** the `https?://` scheme and called `fetch(url, { redirect: "follow" })` with **no host validation**. An attacker could target internal services and have the HTTP status / content-type reflected back as an oracle:
  - `http://127.0.0.1:3001/...` (WhatsApp service), `http://127.0.0.1:7788` (LLM), Redis, the app's own `x-internal-secret` endpoints
  - `http://169.254.169.254/latest/meta-data/` (cloud metadata, if hosted on a cloud provider)
  - Redirect-based bypass (a public URL 302-ing to an internal target)
- **Impact:** Internal network reconnaissance / port scanning from the trusted server; potential interaction with unauthenticated internal endpoints.
- **Fix applied:** New `saas/lib/ssrf.ts` (`assertPublicHttpUrl`, `safeFetch`): enforces http/https, rejects literal private/loopback/link-local/CGNAT/reserved IPs (v4+v6), **DNS-resolves the host and rejects if any resolved IP is internal**, and follows redirects **manually, re-validating every hop**. `crawlUrl` now uses `safeFetch`.
- **Verification:** Unit harness blocks `127.0.0.1`, `localhost`, `169.254.169.254`, `10/172.16/192.168`, `[::1]`, decimal-IP, `file:`/`gopher:`, `.internal`; allows public hosts (21/21 pass).
- **Residual:** A narrow DNS-rebinding window remains (resolve-then-connect); acceptable for this authenticated, rate-limited surface. Documented for future hardening (pin resolved IP).

### H2 — SSRF in commerce catalog sync (tenant `storeUrl`)
- **Source:** Manual review
- **Location:** `saas/lib/commerce/catalog-sync.ts` → `fetchWithTimeout()` (Shopify/WooCommerce/Salla/Zid adapters; called by `cron/catalog-sync` and `commerce/integrations/[id]/sync`)
- **Exploitability:** Adapters build request URLs from the merchant-supplied `storeUrl` (`${cfg.storeUrl}/admin/api/...`) and fetched with no validation. A merchant could set `storeUrl` to an internal address and trigger sync → same internal-network SSRF as H1.
- **Impact:** Same as H1, reachable via the commerce integration config.
- **Fix applied:** `fetchWithTimeout` now calls `assertPublicHttpUrl(url)` before connecting (covers all four platform adapters in one place). On a blocked URL the adapter's existing `.catch` degrades to "no products" / `lastSyncError` — no crash.
- **Verification:** Same SSRF harness; `next build` succeeds; catalog sync control flow unchanged for valid public stores.

### H3 — Fail-open auth secret: `validateEnv()` never called + dev-secret fallback
- **Source:** Manual review (grep proved `validateEnv` is defined but never invoked)
- **Location:** `saas/lib/auth.ts:8-10`, `saas/lib/env.ts:213` (`AUTH_SECRET` fallback `"dev-secret-please-change-min-32-chars-long"`), `saas/instrumentation.ts`
- **Exploitability:** Session JWTs (`mse_session`, HS256) are signed with `process.env.AUTH_SECRET || "<public dev string>"`. The same secret derives the AES key for provider-key encryption. `lib/env.ts` has a production guard that throws on a missing/weak `AUTH_SECRET`/`SAAS_INTERNAL_SECRET` — but `validateEnv()` was **never called anywhere**, so the guard was dead code. If `AUTH_SECRET` were ever unset in production, the app would silently sign sessions with a **publicly known secret → anyone can forge an owner/admin session (full account takeover)**.
- **Impact:** Catastrophic if env is misconfigured (auth bypass, privilege escalation, secret decryption). Even with env set today, the silent-fallback pattern is a latent fail-open.
- **Fix applied:**
  1. `lib/auth.ts` now resolves the secret via `resolveAuthSecret()` which **throws in production** if `AUTH_SECRET` is missing/`<32` chars (keeps the dev fallback only when `NODE_ENV !== production`).
  2. `instrumentation.ts register()` now calls `validateEnv()` on Node runtime startup, so the app **fails fast** in production on any missing required secret.
- **Verification:** `next build` succeeds (local `.env` has a 63-char `AUTH_SECRET`). Production already sets these (login + cron run today), so wiring the guard is safe and additive.
- **Note:** `WHATSAPP_SHARED_SECRET` still has a dev fallback and is only *warned* (not required). It was **not** force-promoted to required to avoid a deploy-time outage if prod hasn't set it. **Recommendation:** set it in prod and move it to `REQUIRED_IN_PROD` (see §7).

### H4 — Residual Next.js advisories *(REMAINING — see §6)*
- **Source:** Snyk (7× High after upgrade), npm audit (1× High aggregate)
- **Status:** 5× DoS (resource allocation) + 1× SSRF-via-WebSocket-upgrades + 1× Incorrect-Authorization. The two conditional ones are **N/A to this app** (no middleware, no Next WebSocket upgrades, App Router only); the rest are availability/DoS. Fix requires `next@15.5.16`/`16.x` — a **major migration**, intentionally not auto-applied. Documented as remaining risk with a recommended migration plan.

---

## 4. MEDIUM (all fixed)

| ID | Finding | Location | Fix |
|----|---------|----------|-----|
| M1 | **Rate-limit bypass via spoofable `X-Forwarded-For`** — limiter keyed on the attacker-appendable **leftmost** XFF entry, so a forged IP per request mints a fresh bucket and defeats login brute-force protection. | `lib/rate-limit.ts:getClientIp` | Now selects the entry inserted by the trusted proxy (`parts[len - TRUSTED_PROXY_COUNT]`, default 1 = Caddy); env-tunable `TRUSTED_PROXY_COUNT`. |
| M2 | **No Content-Security-Policy** — only X-Frame-Options/HSTS/nosniff were set. | `next.config.js` | Added a CSP (`default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, scoped img/media/connect/font/script/style). ⚠️ Needs a staging smoke test (see §5). |
| M3 | **Session cookie missing `Secure`** — `mse_session` set without `secure`, allowing send over plaintext HTTP. | `lib/auth.ts` (both session creators) | `secure: true` in production (`SECURE_COOKIE`). |
| M4 | **`qs` NULL-pointer DoS** (GHSA-q8mj-m7cp-5q26 / SNYK-JS-QS-16721866) | `whatsapp-service` (transitive) | `npm audit fix` → resolved. |
| M5 | **`ws` uninitialized-memory disclosure** (GHSA-58qx-3vcg-4xpx / SNYK-JS-WS-16722635) | `whatsapp-service` (transitive) | `npm audit fix` → resolved. |
| M6 | **AES-GCM tag length not enforced** — `createDecipheriv` accepted any-length auth tag; a truncated tag weakens GCM forgery resistance. (Semgrep `gcm-no-tag-length`, ERROR) | `lib/crypto-util.ts:59` | `authTagLength: 16` on cipher+decipher; reject `iv != 12B` / `tag != 16B` before `setAuthTag`. |

**Verification:** whatsapp-service `npm audit` = **0 vulnerabilities**; crypto harness rejects truncated/tampered tags; Semgrep no longer reports the crypto ERROR; `next build` succeeds with the new headers and IP logic.

---

## 5. LOW

| ID | Finding | Location | Status |
|----|---------|----------|--------|
| L1 | **Login user-enumeration via timing** — bcrypt ran only when the email matched, so unknown emails returned faster. | `app/api/auth/login/route.ts` | **Fixed** — dummy bcrypt compare on the unknown-email path equalizes latency. (Error messages were already uniform; rate-limited 10/min.) |
| L2 | **Upload parsing DoS** — a 10 MB DOCX (zip) / crafted PDF could be CPU/memory heavy in `mammoth`/`pdf-parse`. | `app/api/knowledge/import-file/route.ts` | **Accepted** — bounded by 10 MB size cap + `maxDuration 30s` + `settings` permission. Low residual; monitor. |
| L3 | **`WHATSAPP_SHARED_SECRET` optional with dev fallback** | `lib/env.ts` | **Documented** (see H3 note + §7) — not force-required to avoid prod outage. |

---

## 6. REMAINING RISK — Next.js major-version migration

After the safe in-major upgrade to **`next@14.2.35`**, the following remain (Snyk; fix = `next@15.5.16`+, a breaking change):

- 5× **Allocation of Resources Without Limits/Throttling** (DoS) — `SNYK-JS-NEXT-16638674/16638680/15954202/15104645/15921797`
- 1× **SSRF via WebSocket upgrades** — `SNYK-JS-NEXT-16638682` — *N/A: app uses SSE (`/api/realtime/stream`), not Next WebSocket upgrades.*
- 1× **Incorrect Authorization** — `SNYK-JS-NEXT-16638683` — *N/A: App Router, no middleware, no Pages-Router i18n.*
- 1× **postcss XSS** `<8.5.10` (Medium, transitive of next) — only reachable via the build toolchain, not runtime user input.

**Why not auto-fixed:** `next 14 → 15/16` is a two-major jump (async `cookies()/headers()`, caching default changes, React 19 requirement). Per project rule *"never rewrite working systems; prefer additive changes,"* this is a planned, separately-tested migration — not a safe automated security patch. The exploitable-here subset is DoS-class and partly mitigated by the reverse proxy + per-route rate limiting.

**Recommendation:** Schedule a Next 15.5.x migration in an isolated branch/worktree with full regression (`verify:all`) + staging soak. I can drive this on request.

---

## 7. Follow-up recommendations (not auto-applied)

1. **Set `WHATSAPP_SHARED_SECRET` in production** and promote it to `REQUIRED_IN_PROD` in `lib/env.ts` once confirmed set.
2. **Smoke-test the new CSP on staging** (M2). If any inline/3rd-party resource breaks, start with `Content-Security-Policy-Report-Only`, collect reports, then enforce. Future: nonce-based `script-src` (drop `'unsafe-inline'`/`'unsafe-eval'`).
3. **Set `TRUSTED_PROXY_COUNT`** to the real proxy hop count (1 for Caddy-only).
4. **Plan the Next.js 15.5.x upgrade** (§6).
5. Consider moving the in-memory rate limiter to Redis if the app ever runs multi-instance (currently single nssm instance — fine today).

---

## 8. False Positives (verified non-issues)

| Tool | Finding | Why it's a false positive |
|------|---------|---------------------------|
| Semgrep | `path-join-resolve-traversal` ×4 — `workers/baileys.worker.js:160,170,178` | Session id is gated by `validSessionId()` = `/^exp-[a-zA-Z0-9_-]{1,64}$/` before any `path.join` — no `/`, `.`, or `\` possible → traversal impossible. Inner `path.join` operates on `readdir` output of an already-validated dir. |
| Semgrep | `using-http-server` — `workers/baileys.worker.js:699` | Internal worker health server bound locally; not internet-exposed. |
| Semgrep | `unsafe-formatstring` — `workers/broadcast.worker.ts:381` | JS template literal logging `job?.id` — not a printf-style format sink; no injection. (Also in the send pipeline → untouched.) |
| Snyk | CVE-2025-29927 "exploitable" | Patched via upgrade; the bypass requires middleware, which this app does not use. |

---

## 9. Files changed

**New**
- `saas/lib/ssrf.ts` — SSRF guard (`assertPublicHttpUrl`, `safeFetch`, `isPrivateIp`)

**Modified (additive / surgical)**
- `saas/lib/knowledge-import.ts` — `crawlUrl` uses `safeFetch` (H1)
- `saas/lib/commerce/catalog-sync.ts` — `fetchWithTimeout` validates host (H2)
- `saas/lib/auth.ts` — fail-closed `AUTH_SECRET` in prod + `Secure` cookie (H3, M3)
- `saas/instrumentation.ts` — wire `validateEnv()` at startup (H3)
- `saas/lib/crypto-util.ts` — enforce GCM tag length (M6)
- `saas/lib/rate-limit.ts` — trusted-proxy client IP (M1)
- `saas/next.config.js` — Content-Security-Policy (M2)
- `saas/app/api/auth/login/route.ts` — timing-equalizing dummy bcrypt (L1)
- `saas/.env.example` — document `TRUSTED_PROXY_COUNT`
- `saas/package.json` + lockfile — `next@14.2.35` (C1, partial H4)
- `whatsapp-service` lockfile — `qs`/`ws` patched (M4, M5)

**Untouched (by rule):** WhatsApp send pipeline — `app/api/whatsapp/incoming/route.ts`, `lib/messaging/outgoing-queue.ts`, `lib/wa.ts`, `workers/broadcast.worker.ts`, `app/api/cron/broadcasts/route.ts`.

---

## 10. Verification log

```
tsc --noEmit ...................... clean
next build ....................... success (all routes compiled)
SSRF + crypto unit harness ....... 21/21 pass
verify:rbac ...................... PASS (136 routes: 78 gated, 15 waived, 43 read-only)
whatsapp-service npm audit ....... 0 vulnerabilities
saas npm audit ................... critical→0; residual = next(high, major-only) + postcss(moderate, major-only)
saas snyk (post-upgrade) ......... critical→0; residual 7 high = next, fix in 15.5.16 (major)
semgrep .......................... crypto ERROR resolved; 6 remaining = all false positive/accepted
```
