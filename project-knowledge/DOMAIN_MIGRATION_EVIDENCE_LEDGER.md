# Domain Migration — Evidence Ledger (Phase 2)

**Reviewer:** Opus (Phase 2 deep review)
**Date:** 2026-09-01
**Method:** Read-only investigation — live DNS/HTTP probes, `git grep`, source reads. No production changes.
**Legend — occurrence class:** A=Active runtime · B=External callback · C=Deploy/Infra · D=Customer-facing · E=Test/Dev · F=Legacy/Compat · G=Docs · H=Historical · I=Example/Placeholder · J=Unknown

---

## E-1 — Live DNS state of all domain variants
- **SOURCE:** `dig +short` (local resolver)
- **SYSTEM:** Public DNS
- **OBSERVED:**
  - `w.keyone1.com` → `16.171.230.84` (AWS eu-north-1 range)
  - `app.keyone1.com` → `217.154.163.16` (IONOS — **different host/provider**)
  - `k1wb.app.keyone1.com` → **NXDOMAIN / no record**
  - `wkeyone.app` → `91.195.240.94` (Sedo parking range); `www.wkeyone.app` → same
  - `wkeyone-staging.app` → **no record**
- **EXPECTED (per Phase 1):** old domain = w.keyone1.com; single coherent old domain; staging exists
- **EVIDENCE:** raw dig output captured in session
- **RISK:** HIGH — three "old" variants are NOT interchangeable; target is parked; staging is fictitious
- **ACTION:** Treat `w.keyone1.com` as the sole live prod origin. Point `wkeyone.app` A record at `16.171.230.84` at cutover. Do not reference `app.keyone1.com` or `k1wb.app.keyone1.com` as live.
- **PHASE:** 3 (DNS), documented now
- **VERIFY:** re-`dig` after cutover; expect `wkeyone.app → 16.171.230.84`

## E-2 — Live HTTP/TLS behavior
- **SOURCE:** `curl -sS -m15`
- **OBSERVED:**
  - `https://w.keyone1.com/` → **HTTP 200**, `text/html`; `/api/health` → `{"status":"ok","db":"ok","version":"90a1daa",...}`
  - `https://app.keyone1.com/` → **connection timed out (15s)** — not serving
  - `https://wkeyone.app/` → **TLS error `tlsv1 unrecognized name`** — no cert for SNI (parked)
- **EXPECTED:** Phase 1 implied app.keyone1.com and w.keyone1.com were both "the app"
- **RISK:** HIGH — `app.keyone1.com` is dead but is referenced by deploy scripts, security.txt, and the customer Meta-setup page
- **ACTION:** Migration must retarget or retire every `app.keyone1.com` reference; none of them work today
- **PHASE:** 3
- **VERIFY:** post-cutover `curl https://wkeyone.app/api/health` → `status:ok`

## E-3 — Production `NEXT_PUBLIC_SITE_URL` value (inferred from live output)
- **SOURCE:** `curl https://w.keyone1.com/` + `/robots.txt` + `/sitemap.xml`
- **OBSERVED:** emitted `<link rel="canonical" href="https://w.keyone1.com">`, `og:url = https://w.keyone1.com`, sitemap `<loc>https://w.keyone1.com/</loc>`, robots `Sitemap: https://w.keyone1.com/sitemap.xml`
- **EXPECTED:** Phase 1 said `.env.example` shows `app.keyone1.com`
- **EVIDENCE:** live HTML/headers
- **RISK:** LOW (informational) — proves prod env is set to `w.keyone1.com`, NOT the `.env.example` placeholder `app.keyone1.com`
- **ACTION:** At cutover set prod `NEXT_PUBLIC_SITE_URL=https://wkeyone.app`. This single var drives canonical/OG/sitemap + reset + invite links (see E-4).
- **PHASE:** 3
- **VERIFY:** canonical emits `https://wkeyone.app` after restart

## E-4 — Single source of truth for absolute links = `env.siteUrl`
- **SOURCE:** source read
- **PATHS:**
  - `saas/lib/env.ts:219-220` — `siteUrl = NEXT_PUBLIC_SITE_URL || http://localhost:3000`
  - `saas/app/api/auth/forgot-password/route.ts:100-101` — reset link built from `env.siteUrl`
  - `saas/app/api/settings/team/route.ts:123-124` — invite accept link built from `env.siteUrl`
  - `saas/app/layout.tsx:8,29,57` — `metadataBase`, `og:url`, `alternates.canonical` from SITE_URL
  - `saas/app/sitemap.ts:3` — sitemap from SITE_URL
- **OBSERVED:** all five consume the same env var
- **RISK:** LOW→positive — one env change migrates email links + SEO metadata together
- **ACTION:** Confirm `NEXT_PUBLIC_SITE_URL` present in `/keyone/.env.saas`; change once at cutover
- **PHASE:** 3
- **VERIFY:** trigger a password-reset to a TestMail address post-cutover; link host = wkeyone.app

## E-5 — THREE distinct "base URL" env-var names (fragmentation)
- **SOURCE:** source read
- **PATHS / VARS:**
  - `NEXT_PUBLIC_SITE_URL` → email links, canonical, sitemap (E-4)
  - `NEXT_PUBLIC_BASE_URL` → `saas/lib/bridge/overview.ts:169`, `saas/app/dashboard/settings/bridge/download/page.tsx:16`, `saas/app/api/cron/meta-webhook-processor/route.ts:29`
  - `PUBLIC_BASE_URL` → `saas/lib/providers/openrouter.ts:58`
- **OBSERVED:** three different names; fallbacks are `w.keyone1.com`, `w.keyone1.com`, `app.keyone1.com` respectively (except the cron one = `127.0.0.1:3000`)
- **RISK:** MEDIUM — setting only one leaves others on stale/dead fallbacks
- **ACTION:** Set all three in prod env at cutover (or consolidate — see Review §"Newly Discovered"). Verify none rely on the dead `app.keyone1.com` fallback.
- **PHASE:** 3
- **VERIFY:** grep prod `/keyone/.env.saas` for all three keys

## E-6 — Auth cookie is HOST-ONLY (definitive re-auth on migration)
- **SOURCE:** `saas/lib/auth.ts:56-63, 85-93`
- **OBSERVED:** `cookies().set("mse_session", …, { httpOnly, sameSite:"lax", secure(prod), path:"/", maxAge:30d })` — **no `domain` attribute** on either owner or member session
- **EXPECTED (Phase 1):** "MEDIUM … may need path-based handling"
- **RISK:** MEDIUM (UX), LOW (security) — host-only cookie is NOT sent to a new host ⇒ every user re-authenticates on wkeyone.app. No cross-domain cookie leakage; nothing to "carry over."
- **ACTION:** Accept re-auth as expected behavior; communicate to users. Do NOT attempt to widen cookie to `.keyone1.com`↔`.wkeyone.app` (different registrable domains — impossible anyway).
- **PHASE:** 3 (comms) / acceptance
- **VERIFY:** browser test — logging in on wkeyone.app issues a fresh cookie scoped to wkeyone.app

## E-7 — Clerk is NOT integrated (Phase 1 fabricated this dependency)
- **SOURCE:** `grep -i clerk saas/package.json` → none; `git grep @clerk|CLERK_ saas/` → none; no `saas/middleware.ts`
- **EXPECTED (Phase 1 §2.2):** "HIGH risk — OAuth/SSO authentication depends on this … add wkeyone.app to Clerk allowed callbacks"
- **OBSERVED:** app auth is custom JWT in `lib/auth.ts`; Clerk not a dependency, not imported, no middleware
- **RISK:** — (correction) The supplied Clerk credentials belong to a separate/future concern; **no migration action is required for the app to function.**
- **ACTION:** Remove Clerk from the critical path. If Clerk is intended for a *future* feature, track separately — it is not a domain-migration blocker.
- **PHASE:** n/a
- **VERIFY:** login/logout works post-cutover using existing cookie auth (E-6)

## E-8 — SECOND bridge codebase missed by Phase 1 (`keyone-bridge/`, Go)
- **SOURCE:** `git grep` + `ls keyone-bridge/`
- **PATHS:**
  - `keyone-bridge/internal/config/config.go:33-34` — defaults `CloudAPIBase:"https://w.keyone1.com"`, `CloudWSURL:"wss://w.keyone1.com/bridge"`
  - `keyone-bridge/internal/updater/updater.go:29` — update feed `https://w.keyone1.com/downloads/keyone-bridge`
  - `keyone-bridge/packaging/systemd/keyone-bridge.service:6` — `Documentation=https://w.keyone1.com`
  - `keyone-bridge/packaging/deb/build-deb.sh:27` — `ops@keyone1.com`
- **EXPECTED (Phase 1):** only `bridge-node/` (JS) documented
- **RISK:** HIGH — a whole distributed-client codebase with its own hardcoded cloud endpoints + **self-update URL**. If the Go bridge is the shipped client, its updater points at w.keyone1.com; retiring that host breaks auto-update.
- **ACTION:** Determine which bridge is actually distributed to customers (Go vs JS). Update whichever ship(s). Keep `w.keyone1.com/downloads/*` alive until all clients have updated past the endpoint switch.
- **PHASE:** 3 prep + long-tail
- **VERIFY:** built client connects to wkeyone.app when configured; updater resolves

## E-9 — bridge-node (JS) defaults + Windows packaging (Windows missed by Phase 1)
- **SOURCE:** `git grep`
- **PATHS:**
  - `bridge-node/keyone-wa-bridge.js:58-59` — defaults `https://w.keyone1.com`, `wss://w.keyone1.com/bridge`
  - `bridge-node/packaging/windows/install.ps1:132` — `$CloudApi="https://w.keyone1.com"`
  - `bridge-node/packaging/windows/install.cmd:17` — help URL
  - `bridge-node/packaging/macos/build-pkg.sh:106` — `CLOUD_API="https://w.keyone1.com"`
  - `bridge-node/packaging/linux/build-deb.sh:22` — `support@keyone1.com`
- **EXPECTED (Phase 1):** listed macOS + Linux only ("Windows" absent)
- **RISK:** MEDIUM — installers bake the old cloud origin; already-installed instances rely on env override or image rebuild
- **ACTION:** Update all three installer families (win/mac/linux) + JS defaults; rebuild/redistribute; document env override for existing installs
- **PHASE:** 3 prep
- **VERIFY:** fresh install on each OS points at new origin

## E-10 — `security.txt` already RFC-9116 invalid in prod; references dead host
- **SOURCE:** live `curl https://w.keyone1.com/.well-known/security.txt` + `saas/public/.well-known/security.txt`
- **OBSERVED:** served from w.keyone1.com but `Canonical: https://app.keyone1.com/.well-known/security.txt` (dead host); `Contact: mailto:security@keyone1.com`
- **EXPECTED (Phase 1):** `.well-known` not mentioned at all
- **RISK:** MEDIUM (D) — Canonical mismatch already breaks the standard; researchers see a dead link
- **ACTION:** Set `Canonical: https://wkeyone.app/.well-known/security.txt`; decide security@ mailbox domain
- **PHASE:** 3
- **VERIFY:** live security.txt Canonical == serving origin

## E-11 — Customer-facing Meta webhook instruction points at dead host
- **SOURCE:** `saas/app/dashboard/settings/meta-cloud/page.tsx:81`
- **OBSERVED:** hardcoded Arabic instruction: set Meta webhook to `https://app.keyone1.com/api/whatsapp/meta-webhook` (dead host, and hardcoded — not env-driven)
- **EXPECTED (Phase 1):** assumed webhook path but didn't flag the in-product instruction or the dead host
- **RISK:** HIGH (D) — merchants following the UI configure a webhook to a host that times out; likely already causing setup failures
- **ACTION:** Replace with env-driven origin (`{env.siteUrl}/api/whatsapp/meta-webhook`) → wkeyone.app; this is both a bugfix and a migration item
- **PHASE:** 3 (also worth a pre-migration hotfix)
- **VERIFY:** page renders wkeyone.app; Meta GET handshake succeeds against it

## E-12 — Meta webhook is dynamic; no stored callback URL in app
- **SOURCE:** `saas/app/api/whatsapp/meta-webhook/route.ts:40-74` (GET echoes `hub.challenge`, matches `verify_token` vs `Bot.metaWebhookVerifyToken`)
- **OBSERVED:** callback URL lives in Meta's dashboard, not in our DB/env; verify token is per-merchant in DB and is **domain-independent**
- **RISK:** CRITICAL (B) at cutover — external Meta config must be repointed to wkeyone.app; verify tokens survive (portable)
- **ACTION:** Inventory active Meta apps/numbers; repoint webhook host in Meta dashboard during cutover; keep w.keyone1.com reachable so in-flight webhooks (7-day retry) still land
- **PHASE:** 3
- **VERIFY:** Meta "Verify and Save" succeeds on wkeyone.app; inbound test message flows

## E-13 — Prisma schema-level default email (missed by Phase 1)
- **SOURCE:** `saas/prisma/schema.prisma:1573`, `saas/prisma/schema.postgres.prisma:1574`
- **OBSERVED:** `supportEmail String @default("support@keyone1.com")`
- **EXPECTED (Phase 1):** only seed.ts/seed-keyone.ts noted
- **RISK:** LOW (E/F) — DB column default; affects new rows only; does not change domain routing
- **ACTION:** Optional — update default if support email domain changes; not a runtime blocker
- **PHASE:** 3 optional
- **VERIFY:** n/a

## E-14 — Caddyfile in repo does NOT reflect live production
- **SOURCE:** `deploy/Caddyfile:5` (`k1wb.app.keyone1.com {`) vs E-1 (that host is NXDOMAIN) vs E-2 (live TLS is for w.keyone1.com)
- **OBSERVED:** repo Caddy site block is for a hostname that doesn't resolve; live prod clearly terminates TLS for `w.keyone1.com`
- **RISK:** HIGH (C) — the repo's reverse-proxy config is stale/misleading; the real Caddyfile on the AWS host is unknown from the repo
- **ACTION:** Retrieve the ACTUAL running Caddyfile from the prod host (SSH, read-only) before planning the Caddy change; do not assume `deploy/Caddyfile` is authoritative
- **PHASE:** 3 prep (BLOCKER — see Review)
- **VERIFY:** `caddy` config on host shows the site block(s) actually serving w.keyone1.com

## E-15 — `.app` is on the HSTS preload list (hard HTTPS requirement)
- **SOURCE:** documented TLD policy (Google Registry operates `.app`; entire TLD is HSTS-preloaded in major browsers) + E-2 (current TLS failure)
- **OBSERVED:** browsers will refuse any `http://wkeyone.app` and any https without a valid cert (current state: no cert)
- **RISK:** HIGH (C) — there is NO http fallback; a valid TLS cert must exist the instant the domain is used. ACME issuance needs DNS pointing at the host + reachable :80/:443 (HTTP-01) or DNS-01.
- **ACTION:** Sequence: (1) DNS A→16.171.230.84, (2) Caddy site block for wkeyone.app so it auto-issues LE cert, (3) confirm cert, THEN (4) flip app env + redirects. Expect a short window where DNS resolves but cert is issuing.
- **PHASE:** 3
- **VERIFY:** `curl -I https://wkeyone.app` returns 200 with valid chain + HSTS header

## E-16 — Deploy scripts reference mixed/dead hosts
- **SOURCE:** `git grep` in `deploy/`
- **PATHS:** `release-aws.sh:34` (w.keyone1.com default), `release-git.sh:37` (**app.keyone1.com** health — dead host), `vps-docker-setup.sh:87` (app.keyone1.com env seed), `deploy.sh:230` (app.keyone1.com smoke text), `publish-downloads.sh:15` (w.keyone1.com comment)
- **RISK:** MEDIUM (C) — `release-git.sh` health-checks a dead host; if that path is used, deploys either skip verification or fail
- **ACTION:** Determine which release script is actually used (`release-aws.sh` per memory). Update defaults to wkeyone.app; fix the health URL
- **PHASE:** 3 prep
- **VERIFY:** dry-run deploy script resolves health against a live host

## E-17 — Phase 1 documents are uncommitted / not authoritative location
- **SOURCE:** `git status --short project-knowledge/` → all four DOMAIN_MIGRATION_*.md are `??` (untracked); main checkout `project-knowledge/` has no such files
- **RISK:** LOW (process) — deliverables live only in this worktree, uncommitted
- **ACTION:** Commit Phase 1 + Phase 2 docs on the migration branch so the handoff survives
- **PHASE:** 2 close-out
- **VERIFY:** `git log -- project-knowledge/DOMAIN_MIGRATION_PHASE2_REVIEW.md`

## E-18 — External service reachability (spot checks; credit-frugal)
- **SOURCE:** single API probes (Phase 1 + this phase)
- **OBSERVED:** Sentry org slug `wkeyone` exists & active (created 2026-08-31); TestMail namespace `16zvb` auth OK; Name.com **legacy** endpoints return HTTP 410 (permanently removed) for BOTH dev+prod creds; Datadog `/v1/validate` → 403 with the provided token/header form; CodeScene token valid but host-path specific
- **RISK:** MEDIUM — Name.com automation via the given endpoints is impossible (410); Datadog token/header needs correction before any programmatic use
- **ACTION:** Manage DNS via Name.com **web dashboard** or current API (not the legacy hosts supplied). Re-confirm Datadog auth header/region if programmatic checks are needed. Neither blocks the migration if DNS is done in the dashboard.
- **PHASE:** 3 prep
- **VERIFY:** DNS edit visible in Name.com dashboard; (optional) Datadog validate 200

---

*Historical/documentation occurrences (README*, `saas/project-knowledge/*`, `keyone-growth-suite-report.md`, seed help text, etc.) are class G/H and are intentionally preserved — no migration action.*

---

# PHASE 2B — B1/B2/B3 BLOCKER RESOLUTION (2026-09-01, read-only)

Access used: authorized read-only SSH to `ubuntu@16.171.230.84` (key `~/.ssh/keyone-prod.pem`), `dig`/`whois`, Name.com **v4** REST API (GET only). No mutations. No secrets printed (`.env` secret values were redacted or captured into shell vars only).

## E-19 — [B1] Authoritative production Caddy config
- **QUESTION:** What Caddy config actually serves production?
- **METHOD:** `systemctl cat caddy`, `cat /etc/caddy/Caddyfile`, `ss -ltnp`, `pgrep`.
- **EVIDENCE:** systemd unit `ExecStart=/usr/bin/caddy run --environ --config /etc/caddy/Caddyfile`; Caddy **v2.11.4**, `active`+`enabled`. `/etc/caddy/Caddyfile` (225 B, authoritative):
  ```
  w.keyone1.com {
      encode gzip zstd
      @bridge path /bridge /bridge/*
      reverse_proxy @bridge localhost:3002
      reverse_proxy localhost:3000
  }
  ```
  `:80`,`:443` owned by caddy; `:3000` = `next-server` (pid 354951, `node index.js`); `:3002` = bridge-gateway. **No Docker** (`docker ps` empty; repo `docker-compose.production.yml` is NOT how prod runs). No `import`/snippets. Backup `Caddyfile.bak.20260826T092908Z` = same host, pre-bridge-ingress.
- **RESULT:** **RESOLVED.**
- **CONFIDENCE:** HIGH (direct read of the live file + running process).
- **IMPLICATION:** Only **one** vhost (`w.keyone1.com`). Repo `deploy/Caddyfile` (k1wb.app.keyone1.com, `/wa` `/llm` routes) is entirely stale — do NOT use it. TLS + HTTP→HTTPS are Caddy-automatic. The only special route is `/bridge*`→:3002; **no `/downloads` or `/api/whatsapp` special handling** (both just hit :3000). Migration = add a `wkeyone.app { … }` block mirroring these two reverse_proxy lines; Caddy auto-issues the LE cert.
- **NEXT ACTION (Phase 3):** snapshot `/etc/caddy/Caddyfile`; add wkeyone.app block; `caddy reload`.

## E-20 — [B1 context] app.keyone1.com is a decommissioned box
- **EVIDENCE:** `deploy/release-aws.sh:7` comment: "Administrator@**217.154.163.16** / PowerShell / C:\app — that box is gone." `217.154.163.16` == `app.keyone1.com` (E-1). Live = timeout (E-2).
- **RESULT:** Explains the dead host: `app.keyone1.com` was the OLD Windows server, decommissioned. **Not to be referenced as live anywhere.**
- **CONFIDENCE:** HIGH.

## E-21 — [B2] wkeyone.app ownership + registrar state
- **QUESTION:** Is wkeyone.app the user's and DNS-editable?
- **METHOD:** Name.com **v4** API `GET /v4/domains` (prod creds, read-only). (Corrects E-18/C7: v4 works; only the truly-legacy `/api/*` path returns 410.)
- **EVIDENCE:** `{"domainName":"wkeyone.app","locked":true,"autorenewEnabled":true,"expireDate":"2027-08-31T19:05:17Z","createDate":"2026-08-31T19:05:17Z"}` — single domain in account.
- **RESULT:** **RESOLVED** — owned by user, registered 2026-08-31, autorenew on, valid to 2027-08-31. `locked:true` = **transfer lock** (does not block DNS-record edits).
- **CONFIDENCE:** HIGH.
- **IMPLICATION:** Domain is controllable; DNS editable via Name.com dashboard or the working v4 API.
- **NEXT ACTION:** none for review.

## E-22 — [B2] Authoritative DNS/zone state for wkeyone.app
- **METHOD:** `dig NS/SOA/MX/TXT/CAA/DNSKEY`.
- **EVIDENCE:** NS = `ns1bcp/ns2dfg/ns3dgr/ns4dfh.name.com` (**Name.com nameservers**); SOA present; **MX: none**; **TXT: none**; **CAA: none**; **DNSKEY: none (DNSSEC off)**.
- **RESULT:** **RESOLVED.** Zone is on Name.com NS (editable). No MX ⇒ pointing A→AWS **cannot affect mail**. No CAA ⇒ Let's Encrypt unrestricted. No DNSSEC ⇒ record changes have no DS/chain complication.
- **CONFIDENCE:** HIGH.
- **IMPLICATION:** Safe to add `A wkeyone.app → 16.171.230.84` (+`www`) with no mail/DNSSEC/CAA side effects. Recommend lowering TTL (e.g. 300s) before cutover for fast rollback.

## E-23 — [B3-META] Production Meta footprint = DISABLED
- **QUESTION:** What Meta apps/numbers/webhook are live in prod?
- **METHOD:** read prod `~/keyone/.env` (redacted).
- **EVIDENCE:** `META_CLOUD_ENABLED=0` in live `.env` **and** both backups (`…bridge.20260826`, `…flags.20260825`). App-side webhook is dynamic (E-12) and per-merchant token-based; `META_APP_SECRET` present but feature-gated off.
- **RESULT:** **RESOLVED at production-runtime level** — Meta Cloud is OFF; there is **no active production webhook to migrate**. (Meta *account dashboard* enumeration was not performed: **no Meta credentials were supplied** in the environment. This is an accepted limitation, not a blocker, because the feature is disabled in prod.)
- **CONFIDENCE:** HIGH for runtime state; dashboard-level = N/A (no creds).
- **IMPLICATION:** Meta drops OFF the cutover critical path. If Meta is enabled in future, set the webhook host to wkeyone.app **at that time** and fix the hardcoded `app.keyone1.com` in `meta-cloud/page.tsx:81` (E-11) first.

## E-24 — [B3-BRIDGE] No bridge is distributed or connected in production
- **QUESTION:** Which bridge ships; do customers depend on w.keyone1.com `/downloads` or `/bridge`?
- **METHOD:** customer UI source; SSH filesystem `find`; live HTTP; `ss` connection counts; read-only DB `SELECT`.
- **EVIDENCE:**
  - Customer UI (`download/page.tsx:13` `DOWNLOAD_BASE="/downloads/keyone-bridge"`; `download-cards.tsx`) links artifacts named **`keyone-wa-bridge-*`** (win .zip, macOS .pkg `latest.pkg`, linux `latest.deb`) — the **JS `bridge-node`** naming.
  - **No artifacts on prod:** `~/keyone/public/downloads` absent; `find ~ … keyone-wa-bridge|latest.pkg|latest.deb|*.AppImage` → nothing; live `https://w.keyone1.com/downloads/keyone-bridge` → **404**.
  - **No clients:** DB `Bridge` table = **0 rows, 0 active(15m)**; `ss` established to `:3002` = **0**. `keyone-bridge-gateway.service` (WS relay :3002) is running but idle.
  - Both codebases have recent commits (Go `keyone-bridge`: packaging bundler; JS `bridge-node`: puppeteer/wwebjs fixes).
- **RESULT:** **RESOLVED** — The download UI targets the **JS bridge-node**, but **no artifacts are served and zero bridges are registered/connected.** The bridge feature has **no live production dependency** today.
- **CONFIDENCE:** HIGH (multiple independent signals: FS, HTTP, sockets, DB).
- **IMPLICATION:** `/downloads/*` and `/bridge` have **no existing customers to protect** during cutover — the Phase 2 "keep old host alive for bridge long-tail" concern is currently **moot**. When distribution goes live later, the chosen bridge must default to `wkeyone.app` (bridge defaults E-8/E-9). Deciding Go-vs-JS is a **product** decision, not a migration blocker.

## E-25 — [B3 context] Live env var presence (confirms E-5 fragmentation)
- **EVIDENCE:** prod `~/keyone/.env` contains `NEXT_PUBLIC_SITE_URL=https://w.keyone1.com`; **does NOT contain** `NEXT_PUBLIC_BASE_URL` or `PUBLIC_BASE_URL`. `DEPLOYED_COMMIT=90a1daa…` (matches health `version:90a1daa`).
- **RESULT:** Confirms the 3-var risk is live: only `NEXT_PUBLIC_SITE_URL` is set; the bridge-download origin (`NEXT_PUBLIC_BASE_URL`) and OpenRouter referer (`PUBLIC_BASE_URL`) run on **code fallbacks** (`w.keyone1.com` and dead `app.keyone1.com` respectively).
- **CONFIDENCE:** HIGH.
- **IMPLICATION:** At cutover set `NEXT_PUBLIC_SITE_URL`; **also add** `NEXT_PUBLIC_BASE_URL=https://wkeyone.app` and `PUBLIC_BASE_URL=https://wkeyone.app` (the latter fixes an existing dead-host referer). None affect the bridge in practice (no clients).
