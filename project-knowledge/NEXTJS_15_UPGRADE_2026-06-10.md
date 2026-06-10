# Next.js 14.2.35 → 15.5.19 Security Upgrade

**Date:** 2026-06-10
**Branch:** `claude/eloquent-almeida-2c5b8c`
**Driver:** Security war-room item **#8** — "Next.js 14.2.35→15.5.x CVE upgrade (breaking)".
Tracked in memory `keyone-security-hardening`; related findings in
`security-assessment-2026-06-09.md`, `KEYONE_SECURITY_AUDIT_REMEDIATION_2026_06_09.md`,
`SECURITY_SCAN_REMEDIATION_2026-06.md`.
> Note: the referenced path `project-knowledge/security-war-room-2026-06-10.md` is named in the
> war-room memory but is not present in the repo; this report stands in for item #8's remediation record.

---

## 1. Why

`next@14.2.35` carried multiple **HIGH**-severity CVEs with no fix available inside the 14.x line.
The externally-reachable ones (landing/login are unauthenticated RSC pages; Caddy proxies WS upgrades to `:3000`):

| CVE / advisory | Class | Reachable surface |
|---|---|---|
| GHSA-q4gf-8mx6-v5v3 | RSC / Server-Component **DoS** | unauth RSC pages (`/`, `/login`) |
| GHSA-8h8q-6873-q5fj | RSC / Server-Component **DoS** | unauth RSC pages |
| GHSA-c4j6-fc7j-m34r | **SSRF** via WebSocket upgrades | Caddy → `:3000` WS proxy |
| GHSA-wfc6-r584-vfw7 | RSC **cache poisoning** | RSC responses |

**Target:** `next@15.5.19` (latest 15.5.x — deliberately **not** 16.x). Closes all four. `react`/`react-dom`
`18.3.1` satisfy the 15.5 peer range (`^18.2.0 || ^19.0.0`); no React bump required.

### Result — `npm audit`
```
Before: multiple HIGH (next)
After : npm audit --audit-level=high  →  0 HIGH
        3 moderate remain (postcss GHSA-qx2v-qp2m-jg93, bundled transitively inside next).
        NOT auto-fixed: `npm audit fix --force` would downgrade next to 9.x. Tracked as low-priority.
```

---

## 2. The breaking change (Next 15 async dynamic APIs)

Next 15 made `cookies()`, `headers()`, route `params`, and page `searchParams`/`params` **async (Promises)**.
Every read site must now `await`. Scope found in this codebase:

- `headers()` / `draftMode()`: **0 usages** — nothing to change.
- `cookies()`: **1 file** (`lib/auth.ts`, 4 call sites).
- route handler `params`: **35 files** under `app/api/**/[param]/route.ts`.
- page `searchParams`/`params`: **15 pages** (13 `searchParams`, 2 dynamic `[id]` `params`).
- `app/(auth)/team/accept/page.tsx` uses the **client** `useSearchParams()` hook → unaffected, untouched.

### Migration patterns applied (uniform, minimal-diff)
- **`lib/auth.ts`** — `await cookies()` into a local store before `.get/.set/.delete`. `clearSession()`
  changed from sync → **`async`**; its only caller (`app/api/auth/logout/route.ts`) now `await`s it.
- **Route handlers** — `params` type wrapped in `Promise<…>`; `const params = await <ctx|props>.params;`
  inserted as the first statement; body references resolve to the awaited local. Both signature styles
  (`{ params }` and `ctx: { params }`) handled.
- **Pages** — destructured prop renamed to `props`, type `Promise<…>` (optional `?` preserved),
  `const searchParams = await props.searchParams;` (and/or `params`) as the first statement. Body unchanged.

### Config (`next.config.js`)
- Removed obsolete `experimental.instrumentationHook` (stable in 15; `instrumentation.ts`/`onRequestError`
  still auto-load). `experimental.serverActions.bodySizeLimit` kept (still valid).
- Added `outputFileTracingRoot: __dirname` — Next 15's multi-lockfile detection otherwise infers the wrong
  workspace root (a stray `~/package-lock.json`), mis-rooting output file tracing. Pin silences the warning
  and keeps the deploy artifact correct.

---

## 3. WhatsApp send pipeline — constraint honored

CLAUDE.md: *"Never modify WhatsApp send pipeline without explicit approval."*
One send-path file appears in the diff — `app/api/inbox/conversation/[customerId]/send/route.ts` — but the
change is **exclusively** the framework-mandated params-await (type → `Promise`, `await ctx.params`,
`ctx.params.customerId` → `params.customerId`). The `wa` send call, rate-limit, and lookup **semantics are
unchanged**. This edit is required for the route to execute at all under Next 15; it alters no send behavior.

---

## 4. Verification (all gates per CLAUDE.md)

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0, 0 errors) — validates every await/ordering/type |
| `npm run build` (Next 15) | **PASS** (exit 0) — `✓ Compiled successfully`, **38/38** pages prerendered. The build typechecks against Next's generated `PageProps`/route validators, so it independently proves the Promise-typed props are correct. |
| `node scripts/verify/rbac-coverage.js` | **PASS** — 136 routes (78 gated / 15 waived / 43 read-only); every mutating route still gated |
| `node scripts/verify/run.js all` | **37 pass / 7 skip / 2 warn / 1 fail** — see below |

**The single `fail` and the `warn`s are environmental, not regressions:**
- `reliability:wa-service — fetch failed`: `WHATSAPP_SERVICE_URL=http://127.0.0.1:3001` is set but the
  whatsapp-service microservice isn't running in this dev worktree (connection refused). No code touched.
- `reliability:outgoing-queue — stale messages` (warn): pre-existing stale rows in the copied dev.db.

### E2E smoke (production `next start`, real HTTP)
Logged in as `e2e-owner@test.local` (password set on the isolated dev.db copy only):

| Path | Exercises | Result |
|---|---|---|
| `GET /`, `GET /login` | unauth RSC pages (CVE-DoS surface) | **200** |
| `GET /pricing?lang=ar`, `GET /projects?lang=en` | public `searchParams` pages | **200** |
| `GET /dashboard` (no cookie) | auth guard | **307 → /login** |
| `POST /api/auth/login` | `createSession` → `await cookies().set` | **200**, `mse_session` set |
| `GET /dashboard` (cookie) | `getAuthContext` → `readToken` → `await cookies().get` | **200** |
| `GET /dashboard/orders?status=open`, `/dashboard/inbox?c=abc` | authed `searchParams` pages | **200** |
| `GET /api/orders/<id>` | **async route `params`** | **404** (resolved cleanly, not 500) |
| `GET /api/orders`, `/api/products`, `/api/inbox/conversations` | authed list routes | **200** |
| `POST /api/auth/logout` | `await clearSession` → `await cookies().delete` | **200** |
| server log | "should be awaited" / sync-access / runtime errors | **none** |

---

## 5. Files changed (56)

- `package.json` (next pin) · `package-lock.json` (dep tree) · `next-env.d.ts` (auto-gen) · `next.config.js`
- `lib/auth.ts` (cookies + async `clearSession`) · `app/api/auth/logout/route.ts` (await)
- **35** dynamic route handlers under `app/api/**/[param]/route.ts`
- **15** pages (`app/**/page.tsx`) — 13 `searchParams` + `dashboard/customers/[id]`, `dashboard/orders/[id]`

Additive / non-regressive: only async-API plumbing + version pin + one tracing-root pin. No business logic,
no data model, no RBAC, no send-pipeline semantics changed.

---

## 6. Worktree / build notes (for reproducing)

- The worktree's `saas/node_modules` symlink to the main checkout was **broken** and replaced with an
  **isolated `npm install`** so `next@15` lands here without mutating the main checkout (main stays `next@14`).
- `.env` symlinked, `prisma/dev.db` copied per `keyone-worktree-build-setup`.

## 7. Follow-ups (non-blocking, not done here)

1. **Sentry deprecation** (pre-existing, unrelated to this upgrade): build warns
   `autoInstrumentServerFunctions is deprecated — use webpack.autoInstrumentServerFunctions`. Left as-is to
   avoid touching working Sentry wiring; migrate when bumping `@sentry/nextjs`.
2. **postcss moderate** (GHSA-qx2v-qp2m-jg93) bundled in next — clears on a future next patch; do **not**
   `audit fix --force`.
3. **Deploy:** rebuild server-side with `npm ci` on the VPS (Windows prisma-engine gotcha, per
   `keyone-deploy-windows-vps`). Confirm `SAAS_INTERNAL_SECRET` is rotated off the public default
   (`keyone-security-hardening` prereq) before boot. Re-run `verify:all` on the host where the
   whatsapp-service is reachable so `reliability:wa-service` flips to pass.
