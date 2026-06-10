# KEYONE — Universal Providers: Production Audit (2026-06-10)

Evidence-based audit performed post-deploy, before any new phase. All values are command outputs, not assumptions.

## 1. Production commit / release identity
- **VPS `git rev-parse HEAD`:** `eb0a0648756020430f7e442a24a2187869684ae7` (`eb0a064`), branch `main`, tracked-dirty count **0**.
- **`/api/health` version:** `eeaaac3-20260610` — NOTE: derived from `process.env.NEXT_PUBLIC_BUILD_ID` baked into `.next` at build time, **NOT** the live git SHA. Not authoritative.
- **`.build-info` HASH:** `eeaaac3` (`RELEASE=keyone-eeaaac3-20260610-163430`) — **STALE** (leftover from an earlier build; does not match git HEAD `eb0a064`). Cosmetic.
- **`.next/BUILD_ID`:** `wMFESTwrrTCNWCGt8Xubg`.
- Local commits: `d02d522` (deploy hardening) → `eb0a064` (slim deploy tooling) → `eeaaac3` (feature). **`eeaaac3` and `eb0a064` differ ONLY in `deploy/*.sh` — the Next app code is byte-identical**, so "running eeaaac3 build" ≡ "running eb0a064 app code".

## 2. Database state — ✅ in sync, no drift
- **`prisma migrate diff` (schema.prisma vs live prod.db): `No difference detected.`** → zero drift, zero pending migrations.
- **Migrations dir:** ABSENT — project uses `prisma db push` (no migration files), so "pending migrations" is N/A.
- **db push performed:** yes — during incident recovery: `prisma db push --skip-generate --accept-data-loss` → *"Your database is now in sync… Done in 283ms"*. Additive only (2 new tables; no drops).
- **Tables created (verified via live query):** `TenantProviderCredential` (18 cols: id,userId,domain,provider,enabled,priority,label,secretEnc,secret2Enc,publicId,endpoint,model,configJson,status,lastCheckAt,lastError,createdAt,updatedAt) and `ProviderCallLog` (11 cols: id,userId,domain,provider,operation,ok,status,latencyMs,error,failedOver,createdAt). Total tables **62**. Row counts **0/0** (no leaked test data).
- **DB:** SQLite `C:\app\saas\prisma\prod.db` (1.53 MB). Pre-deploy backup taken: `prod.db.predeploy-20260610-163156.bak`.

## 3. Providers foundation — implemented (not scaffolded)
Each domain has a registered `DomainService` (ping) + exec + `*WithFailover` (verified by grep). Registry providers:
- **AI (7):** openai, claude, gemini, groq, openrouter, **grok**, custom — `runAiChat`, `aiChatWithFailover`, `resolveAiOverrides`. Wired: `app/api/chat/route.ts:224`. `chat()` gained `providers?` failover param + `runFailoverChat`.
- **Email (7):** smtp, sendgrid, resend, mailgun, ses (SigV4), postmark, brevo — `runEmailSend`, `sendEmailWithFailover`. Wired: `lib/commerce/email.ts` (vault-first).
- **SMS (6):** twilio, vonage, messagebird, plivo, infobip, custom — `runSmsSend`, `sendSmsWithFailover`.
- **Speech (5):** whisper, groq, deepgram, assemblyai, custom — `runTranscribe`, `transcribeWithFailover`. Wired: `lib/media.ts` (transcribeAudio).
- **Image (7):** openai[generate,analyze], gemini[analyze], claude[analyze], openrouter[analyze], replicate[generate], stability[generate], custom[both] — `runAnalyze`, `runGenerate`, `analyzeImageWithFailover`, `generateImageWithFailover`. Wired: `lib/media.ts` (describeImage) + `[domain]/generate` route.
- **Conditional notifications:** `send_email`/`send_sms` actions + `order_value_gt` trigger in `lib/automations`.
- **Verified live (HTTP):** every adapter was exercised with invalid creds in pre-deploy E2E → real upstream auth errors (incl. SES SigV4 → AWS 403). All routes return 401 unauth on prod (live, not 500).
- **Scaffolded / not wired (documented follow-ups):** SMS/email **delivery-status webhooks**; custom-endpoint AI on the legacy `chat()` path (works via `aiChatWithFailover`); universal AI failover on the live WhatsApp reply path.

## 4. Production safety — ⚠️ one temporary fix / build drift
- **Temporary fix applied:** during recovery I ran `npm install prisma@5.22.0 --no-save` on the VPS to add the Windows Prisma CLI/engine (package.json unchanged). This patched `node_modules` rather than installing cleanly.
- **Manual VPS steps performed:** (1) backup prod.db; (2) `git fetch`+`reset --hard eb0a064`; (3) `npm run build`; (4) recovery `npm install prisma --no-save` + `prisma generate` + `db push` + `nssm restart`; (5) cleanup of temp scripts + `releases\extract` + leftover `*.tar.gz`.
- **Drift between repo and production:**
  - DB ↔ schema: **none** (migrate diff clean).
  - Git source: **none** (HEAD `eb0a064`, 0 tracked-dirty).
  - **Build/`node_modules`: YES.** The running `.next` was built carrying `NEXT_PUBLIC_BUILD_ID=eeaaac3`, and `node_modules\.prisma\client` contains **both** `libquery_engine-darwin-arm64.dylib.node` AND `query_engine-windows.dll.node` — i.e. a Mac-origin `node_modules` hand-patched with the Windows engine. App code is identical to `eb0a064`, so it is **functionally correct**, but it is NOT a clean, reproducible from-source VPS build.
  - `.build-info` `eeaaac3` ≠ git `eb0a064` (cosmetic).
- **Recommended remediation (NOT yet done — needs approval):** one clean re-deploy via the fixed `deploy/release-git.sh` (does `npm ci` on the VPS) to produce a reproducible Windows-native build and clear the `node_modules`/`.build-info` drift.

## 5. Deployment hardening
- **How the Prisma runtime mismatch is now prevented:** `deploy/release-git.sh` now runs **`npm ci` on the VPS** before building. `npm ci` reinstalls platform-native binaries (Windows Prisma query engine via the `postinstall` `prisma generate`, plus `@next/swc-win32`), so the client can never be a foreign-platform (darwin/linux) build. The remote script is executed via `-File <path>` (not stdin) so `$ErrorActionPreference='Stop'`/`Fail` actually aborts; and the **build runs before the service is stopped**, so a failed `npm ci`/build leaves the live release serving.
- **Rollback procedure if a deploy fails:**
  1. Build-before-stop means most failures need no rollback (old release keeps serving).
  2. Code rollback: on VPS `git reset --hard <previous-good-sha>` → `npm ci` → `npm run build` → `nssm restart`. (Additive schema means old code safely ignores the new tables — no DB rollback needed.)
  3. DB rollback (only if ever needed): `nssm stop` → `Copy-Item prod.db.predeploy-*.bak prod.db -Force` → `nssm start`.
  4. Artifact path also supports `./deploy.sh --rollback` (restores the `previous` .next/node_modules backup).
  5. Engine-mismatch recovery (the incident class): `npm install prisma@5.22.0 --no-save` → `prisma.cmd generate` → restart (no full rebuild needed).

## 6. Verification (this audit run)
- **Typecheck:** `tsc --noEmit` → **0 errors**.
- **Build:** `next build` → **✓ Compiled successfully** (all 7 provider routes emitted).
- **Regression:** `schema-parity` → **PASS (62 models lock-step)**; `rbac-coverage` → **PASS (141 routes; 83 gated / 15 waived / 43 read-only)**. `verify:reliability` → 2 pass / 3 skip / 1 fail; the single fail is `wa-service — fetch failed`, a **local-environment** artifact (WA service runs on the VPS, not this dev machine) — unrelated to the providers change.
- **Health/readiness (prod):** `/api/health` → `{status:ok, db:ok}` HTTP 200; `/api/ready` → `{ready:true, verdict:"ready"}` with db ok + schema "core tables queryable" + outgoing_queue healthy, HTTP 200; `/api/settings/providers/{ai,email}` → 401 (live, auth-gated); `/dashboard/settings/providers` → 307.

## Verdict
Production is **healthy and the feature is functionally live with zero DB drift**. The one open item is **build-artifact drift** (hand-patched `node_modules` + Mac-built `.next`), which is functionally correct but not reproducible; recommend a single clean re-deploy via the hardened `release-git.sh` before further phases.

---

## ADDENDUM — Clean redeploy completed (2026-06-10, deployment hygiene)
Approved hygiene redeploy executed via hardened `deploy/release-git.sh`. All drift eliminated.

**Incident during redeploy (resolved):** first attempt failed at `npm ci` with `EPERM unlink query_engine-windows.dll.node` — the running service **locks** loaded `node_modules` DLLs on Windows. The build-before-stop guard left production untouched (stayed up on old release). Fix: `release-git.sh` now **stops the service before `npm ci`** (short maintenance window, ~8 min) with a recovery-restart on failure. Pre-redeploy DB backup taken (`prod.db.preredeploy-*.bak`).

**Post-redeploy evidence (all aligned to `c69e89a`):**
- VPS `git rev-parse HEAD` = `c69e89ac713b2e7896fe84c51659da793852f173` (branch `main`, tracked-dirty 0)
- `.build-info` = `RELEASE=keyone-c69e89a-20260610-181223 / HASH=c69e89a / BUILD_ID=c69e89a-20260610 / NODE=v24.15.0`
- `/api/health` = `{status:ok, db:ok, version:"c69e89a-20260610"}` ; `/api/ready` = `{ready:true, verdict:"ready"}` HTTP 200
- Prisma engines = **`query_engine-windows.dll.node` ONLY** (`DARWIN_ENGINE_STILL_PRESENT=False`) — mixed-engine state removed
- `npm ci` = `added 468 packages in 7m` (clean Windows-native) ; `prisma.cmd` present
- `next build` = `✓ Compiled successfully` (97/97 static pages)
- `prisma db push` = "The database is already in sync" (no-op — **no schema change, no tables added**)
- Temp/recovery files = 0 remaining (swept); 3 DB backups retained for rollback

**Objectives status:** (1) drift eliminated ✅ (2) mixed engines removed ✅ (3) Windows-native build ✅ (4) `.build-info`/version/HEAD/artifact aligned ✅ (5) no temp fixes remain ✅. No feature/schema/table changes. Phase 2 not started.
