# Domain Migration — Phase 2 Deep Review & Production-Safe Plan

**Reviewer:** Opus (principal-engineer review of Phase 1 discovery)
**Date:** 2026-09-01
**Method:** Read-only. Live DNS/HTTP/TLS probes, `git grep`, targeted source reads. No production, DNS, Caddy, env, Meta, Clerk, or DB changes made.
**Companion:** `DOMAIN_MIGRATION_EVIDENCE_LEDGER.md` (E-1 … E-18) — every claim below cites a ledger entry.

---

## 1. Executive Summary

Phase 1 produced a broad, well-organized inventory but it was **assumption-heavy and not verified against the live system**. This review verified the live state and found the picture materially different in four ways that change the plan:

1. **There is no single "old domain." There are three variants with three different fates.** `w.keyone1.com` is the *only* live production origin (HTTP 200, healthy). `app.keyone1.com` is **dead** (connection timeout, different provider/IP) yet is referenced by deploy scripts, `security.txt`, and the customer-facing Meta setup page. `k1wb.app.keyone1.com` (the repo Caddyfile hostname) **does not resolve at all**. [E-1, E-2, E-14]
2. **The target `wkeyone.app` is a parked domain** (Sedo IP, TLS "unrecognized name" — no cert, not serving). And `.app` is HSTS-preloaded, so there is **no HTTP fallback**: a valid cert must exist the moment the domain is used. [E-1, E-2, E-15]
3. **Phase 1 fabricated a Clerk dependency.** Clerk is not a dependency, not imported, and there is no middleware — the app uses a custom host-only cookie/JWT (`lib/auth.ts`). Clerk needs **zero** migration action. [E-7]
4. **Phase 1 missed an entire second bridge codebase** (`keyone-bridge/`, Go, with its own hardcoded cloud endpoints and a **self-update URL**), plus Windows installers, the Prisma schema-level default email, and the `.well-known/security.txt` file. [E-8, E-9, E-13, E-10]

The good news Phase 1 undersold: **runtime behavior is env-driven through one variable** (`NEXT_PUBLIC_SITE_URL`) for email links + canonical + sitemap, so the *application* cutover is genuinely small. The hard parts are **infrastructure ordering** (DNS→cert→redirect under an HSTS-preloaded TLD), the **two bridge clients** and their updaters, and **repointing the external Meta webhook**.

**Verdict: PHASE 2 REVIEW COMPLETE — BLOCKED.** Three concrete prerequisites (§13) must be resolved before a Phase 3 go. None are large; all are gating.

---

## 2. Phase 1 Findings — CONFIRMED

- `NEXT_PUBLIC_SITE_URL` drives canonical/OG/metadataBase/sitemap. **Confirmed** and extended: it *also* drives password-reset and team-invite email links via `env.siteUrl`. One var, five consumers. [E-3, E-4]
- `robots.txt` hard-codes `https://w.keyone1.com/sitemap.xml` as a static file (served verbatim in prod). [E-3]
- `bridge-node/keyone-wa-bridge.js` defaults to `https://w.keyone1.com` / `wss://w.keyone1.com/bridge`. **Confirmed.** [E-9]
- Meta webhook lives at `/api/whatsapp/meta-webhook`, is dynamic, matches a per-merchant DB verify token (domain-independent). **Confirmed.** [E-12]
- Deploy scripts and bridge installers carry hardcoded hosts. **Confirmed and expanded** (Windows added, dead-host health-check found). [E-16, E-9]
- Prisma `seed.ts` / `seed-keyone.ts` contain `keyone1.com`. **Confirmed** (plus schema default, newly found). [E-13]
- Sentry org exists; TestMail auth works. **Confirmed.** [E-18]

## 3. Phase 1 Findings — CORRECTED

| # | Phase 1 claim | Reality | Ledger |
|---|---------------|---------|--------|
| C1 | "Clerk — HIGH risk, OAuth/SSO depends on it; add wkeyone.app callbacks" | Clerk is **not integrated at all** (no dep, no import, no middleware). App uses custom cookie auth. **No action.** | E-7 |
| C2 | "old domain = w.keyone1.com" (treated as the one old domain) | Three variants: `w.keyone1.com` (live), `app.keyone1.com` (**dead**), `k1wb.app.keyone1.com` (**NXDOMAIN**). Must be handled distinctly. | E-1, E-2 |
| C3 | `deploy/Caddyfile` implicitly authoritative | Its hostname `k1wb.app.keyone1.com` doesn't resolve; the **real** prod Caddyfile is on the host and unknown from the repo. | E-14 |
| C4 | Session cookie "MEDIUM … may need path-based handling" | Cookie is **host-only** (no `domain`). Definitive: **all users re-auth**; no cross-domain carry-over is possible or needed. | E-6 |
| C5 | Sentry DSN update = "MEDIUM, hardcoded in app" | DSN is **env-driven** (`NEXT_PUBLIC_SENTRY_DSN`), not hardcoded; org `wkeyone` already exists. Lower effort than stated. | E-3, E-18 |
| C6 | "wkeyone-staging.app" referenced as a staging option | **Does not exist** (no DNS). Fictional. Do not plan around it. | E-1 |
| C7 | Name.com API endpoints usable with supplied creds | Both legacy hosts return **HTTP 410 (permanently removed)**. DNS must be done via dashboard/current API. | E-18 |
| C8 | Target domain readiness implied | `wkeyone.app` is **parked, no cert**; `.app` is HSTS-preloaded (no HTTP). Cert issuance is on the critical path. | E-1, E-2, E-15 |

## 4. Newly Discovered Dependencies (missed by Phase 1)

1. **`keyone-bridge/` (Go) second client** — `internal/config/config.go:33-34` cloud defaults, `internal/updater/updater.go:29` **self-update feed** at `w.keyone1.com/downloads/keyone-bridge`, systemd unit doc URL, deb maintainer. The updater means **retiring `w.keyone1.com/downloads/*` breaks auto-update for deployed Go bridges.** [E-8]
2. **Windows bridge installers** — `bridge-node/packaging/windows/install.ps1:132` + `install.cmd:17`. [E-9]
3. **`saas/public/.well-known/security.txt`** — `Contact: security@keyone1.com`, `Canonical: https://app.keyone1.com/...` — **already RFC-9116-invalid in prod** (Canonical ≠ serving origin, and points at the dead host). [E-10]
4. **Customer Meta-setup page hardcodes the dead `app.keyone1.com` webhook** (`meta-cloud/page.tsx:81`) — a pre-existing bug, not env-driven. [E-11]
5. **Prisma schema default** `supportEmail @default("support@keyone1.com")` in both schema files. [E-13]
6. **Three different base-URL env names** (`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_URL`, `PUBLIC_BASE_URL`) — setting one is insufficient. [E-5]
7. **`app.keyone1.com` is a dead host** referenced across deploy + product; its existence/purpose (legacy landing? old marketing box on IONOS?) must be clarified, not silently mapped to wkeyone.app. [E-2, E-16]

## 5. Critical Path (what actually gates a working cutover)

Ordered by hard dependency, not by Phase 1's list:

1. **Retrieve the real prod Caddyfile** from the AWS host (read-only SSH). Everything infra-side depends on knowing the true current config. [E-14] — *prerequisite/BLOCKER*
2. **Confirm `wkeyone.app` ownership + that DNS is editable** via Name.com dashboard (legacy API is dead). [E-18, E-1] — *prerequisite/BLOCKER*
3. **Enumerate active Meta apps/phone numbers** and current webhook host (needs Meta dashboard access). [E-12] — *prerequisite/BLOCKER*
4. DNS: `wkeyone.app` (+`www`) A → `16.171.230.84`. [E-1, E-15]
5. Caddy: add a `wkeyone.app` site block → auto-issue Let's Encrypt cert (HTTP-01 needs :80 reachable). Confirm valid HTTPS. [E-15]
6. App env: set `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_BASE_URL`, `PUBLIC_BASE_URL` → `https://wkeyone.app`; restart. [E-4, E-5]
7. External: repoint Meta webhook host; keep `w.keyone1.com` alive for 7-day retry window. [E-12]
8. Redirect: 301 `w.keyone1.com/*` → `wkeyone.app/*` **only after** wkeyone.app verified (and keep `/downloads/*` + `/api/whatsapp/*` served on the old host until bridge/Meta long-tail clears). [E-8, E-12]

Everything else (robots/sitemap follow the env var; security.txt; installers; seed/schema defaults) is important but **not gating** for a functioning site.

## 6. Recommended Migration Order (corrected)

**Stage 0 — Prerequisites (read-only, do first):** resolve the three §13 blockers.

**Stage A — Non-prod code/config (safe, reviewable, no runtime effect):**
- Change hardcoded fallbacks to `wkeyone.app` where they are the *only* value (installers, deploy-script defaults, `security.txt`, meta-cloud page → make env-driven, seed/schema email if desired).
- Update both bridge codebases' defaults + all installer families; rebuild artifacts but **do not** publish as the sole download yet.

**Stage B — Infrastructure (prod-impacting; gated by approval):**
- DNS → cert → verify HTTPS (§5.4–5.6). HSTS-preload means no partial/HTTP state is acceptable. [E-15]

**Stage C — Application cutover:**
- Set the three env vars, restart, verify canonical/health on wkeyone.app.

**Stage D — External + redirect:**
- Meta webhook repoint; then 301 old→new with carve-outs for `/downloads/*` and `/api/whatsapp/*`.

**Stage E — Long tail:**
- Bridge client auto-update rollout; monitor; retire old-host redirect only after bridge/Meta clients have migrated and SEO has re-indexed.

Phase 1's step 1-14 order was broadly reasonable but (a) put Clerk/Meta prep as co-equal criticals (Clerk is a no-op), (b) omitted the "get the real Caddyfile / confirm cert issuance under HSTS" gating, and (c) omitted the bridge-updater carve-out on the old host.

## 7. Rollback Plan (per prod-impacting step)

| Step | What changes | Failure signal | Immediate rollback | Prev state | Reversible? | Sessions/webhooks |
|------|--------------|----------------|--------------------|-----------|-------------|-------------------|
| DNS A record | wkeyone.app→AWS | wkeyone.app still unreachable after TTL | Lower TTL beforehand (300s); revert record | parked Sedo IP | Yes (TTL-bounded) | none yet |
| Caddy site block | new vhost + LE cert | cert not issued / 526/525 | remove wkeyone.app block, reload | old Caddyfile (snapshot first) | Yes | none |
| App env (3 vars) | canonical/links→wkeyone.app | wrong canonical, broken email links | restore prior env, restart container | `/keyone/.env.saas` backup | Yes | users on old host unaffected; new logins host-only |
| Meta webhook | external host repoint | inbound msgs stop; Meta delivery errors | repoint Meta back to w.keyone1.com | prior Meta config (screenshot) | Yes | 7-day retry cushions gaps |
| 301 redirect old→new | old host redirects | redirect loop / cert gap surfaced | remove redirect, serve old host directly | old host serving app | Yes | active sessions on old host survive until redirect on |

**Golden rule:** `w.keyone1.com` stays fully functional (no redirect) until wkeyone.app is independently verified green. The old host is the rollback.

## 8. Browser Verification Plan (Control Chrome, at Phase 3)

Code "route exists" is insufficient. On `https://wkeyone.app` verify: valid cert + HSTS header; `/` loads with `canonical=https://wkeyone.app`; **login issues a fresh cookie** and dashboard renders; **logout** clears it; admin vs customer separation intact; password-reset email (to TestMail) yields a `wkeyone.app` link that works; team-invite link works; Meta GET handshake returns the challenge; no console/CSP/network errors (CSP `connect-src https:` is host-agnostic — spot-check); `w.keyone1.com/*` 301→`wkeyone.app/*` except `/downloads/*` and `/api/whatsapp/*`. [E-4, E-6, E-11, E-12, E-15]

## 9. External Service Verification (credit-frugal)

- **Name.com:** dashboard only (legacy API = 410). One DNS edit; one re-`dig` to confirm. [E-18]
- **Meta:** dashboard — enumerate apps/numbers, repoint webhook, "Verify and Save." No bulk pulls. [E-12]
- **Sentry:** env DSN swap if a wkeyone project is desired; org `wkeyone` exists. No dataset export. [E-18]
- **TestMail:** 1-2 reset/invite emails post-cutover to validate links. [E-4]
- **Datadog:** fix token/header before any use; otherwise skip — not gating. [E-18]
- **Clerk / Icons8 / IconScout / LambdaTest / Blackfire / CodeScene:** not domain-dependent for this migration; no action. [E-7]

## 10. Security Risks

- **HSTS-preload `.app`:** any cert/redirect mistake = hard outage, no HTTP fallback; users may cache HSTS. Get cert right before flipping. [E-15]
- **security.txt** currently advertises a dead Canonical host — minor disclosure-hygiene issue; fix at cutover. [E-10]
- **Cookie**: host-only + `secure` in prod is correct; do NOT widen the cookie domain to bridge the two sites (impossible across registrable domains, and would be a downgrade). [E-6]
- **No secrets** were printed; all creds handled via existing env/tooling. Name.com/Datadog tokens were exercised only enough to establish reachability.

## 11. Data-Safety Risks

- No production data mutated in this review. The migration itself needs **no DB writes** for domain routing (URLs are env-derived; only optional cosmetic seed/schema defaults touch the DB and affect new rows only). [E-13] If any future runtime mutation is proposed, use a test tenant + snapshot/restore per the mandate.

## 12. Acceptance Criteria (Phase 3 "done")

1. `https://wkeyone.app/api/health` → `status:ok, db:ok`; valid cert + HSTS. [E-2, E-15]
2. Canonical/OG/sitemap/robots all emit `wkeyone.app`. [E-3, E-4]
3. Login/logout work; fresh host-only cookie on wkeyone.app. [E-6]
4. Reset + invite emails (TestMail) contain working `wkeyone.app` links. [E-4]
5. Meta handshake succeeds on wkeyone.app; a live inbound test message is processed. [E-12]
6. `w.keyone1.com/*` 301→`wkeyone.app/*` except `/downloads/*` and `/api/whatsapp/*`. [E-8, E-12]
7. At least one bridge (the shipped one) connects to wkeyone.app and its updater resolves. [E-8, E-9]
8. security.txt Canonical == serving origin. [E-10]
9. No new Sentry error class attributable to the cutover for 24-48h. [E-18]

## 13. Phase 3 Blockers (must clear before "go")

- **B1 — Ground truth Caddy config.** Fetch the actual running Caddyfile from the AWS host (read-only SSH); the repo copy is stale (points at an NXDOMAIN host). Without it, the reverse-proxy change is guesswork. [E-14]
- **B2 — DNS control confirmation.** Confirm `wkeyone.app` is owned by the user and editable in the Name.com **dashboard** (legacy API is 410). Currently parked at Sedo. [E-1, E-18]
- **B3 — Meta footprint + which bridge ships.** Enumerate active Meta apps/numbers and their current webhook host; and decide whether the **Go** `keyone-bridge` or the **JS** `bridge-node` is the client actually distributed (its updater/endpoints must be migrated and its old download path kept alive). [E-8, E-12]

**Secondary (not gating, but decide before Stage A/D):** purpose/fate of the dead `app.keyone1.com` host; support@ mailbox domain; whether a wkeyone Sentry project is wanted.

## 14. Files Created / Updated

- **Created:** `project-knowledge/DOMAIN_MIGRATION_PHASE2_REVIEW.md` (this file)
- **Created:** `project-knowledge/DOMAIN_MIGRATION_EVIDENCE_LEDGER.md` (E-1 … E-18)
- **Updated (correction banner only, body preserved):** `project-knowledge/DOMAIN_MIGRATION_INVENTORY.md` — pointer to corrections C1-C8; historical content intact per the "do not destroy evidence" mandate.
- **Not modified:** additional-findings / phase2-checklist / executive-summary Phase 1 docs (still valid as historical discovery; corrections centralized here).

## 15. Final Verdict

# PHASE 2 REVIEW COMPLETE — BLOCKED

Blocked on **B1 (real Caddyfile), B2 (DNS control of wkeyone.app), B3 (Meta footprint + which bridge ships)**. All three are small, read-only/confirmatory tasks — not engineering work — but each can invalidate the plan if assumed. The application-layer cutover is low-risk and largely one env var; the risk concentration is infrastructure ordering under an HSTS-preloaded TLD and the two bridge clients' updaters.

Once B1-B3 are answered, this converts cleanly to **READY FOR PHASE 3** with the Stage A→E plan above. **No production changes were made. Phase 3 is not authorized by this document.**

---

# PHASE 2B — B1/B2/B3 RESOLUTION (2026-09-01, read-only)

All three blockers are now resolved with direct evidence (ledger E-19 … E-25). Read-only SSH to the prod host, `dig`/whois, and the Name.com **v4** API were used; no mutations; no secrets printed.

### 1. B1 — Caddy — **RESOLVED** [E-19, E-20]
- **Actual prod config** (`/etc/caddy/Caddyfile`, Caddy v2.11.4, systemd, **no Docker**):
  ```
  w.keyone1.com {
      encode gzip zstd
      @bridge path /bridge /bridge/*
      reverse_proxy @bridge localhost:3002
      reverse_proxy localhost:3000
  }
  ```
- **One** vhost only. TLS + HTTP→HTTPS automatic. Only special route `/bridge*`→:3002 (bridge-gateway); everything else→:3000 (Next `node index.js`). **No `/downloads`, `/api/whatsapp`, `/wa`, `/llm` special handling.** Repo `deploy/Caddyfile` is stale (wrong host, phantom routes) — do not apply it.
- **Migration implication:** add a mirrored `wkeyone.app { … }` block (two reverse_proxy lines); Caddy auto-issues the LE cert. Trivial, ~8 lines. `app.keyone1.com` = the retired Windows box (E-20) — ignore.

### 2. B2 — Domain control — **RESOLVED** [E-21, E-22]
- Name.com v4 API confirms `wkeyone.app` is in the user's account (registered 2026-08-31, autorenew, exp 2027-08-31; `locked` = transfer lock only, not a DNS-edit lock).
- Authoritative NS = Name.com; **no MX, no CAA, no DNSSEC**.
- **Migration implication:** DNS is safely editable via dashboard or the working v4 API. Adding `A → 16.171.230.84` (+`www`) has **no mail/CAA/DNSSEC side effects**. Lower TTL to ~300s before cutover for fast rollback. (Corrects C7/E-18: v4 API is live; only the ancient `/api/*` path is 410.)

### 3. B3 — Meta — **RESOLVED (runtime)** [E-23]
- **`META_CLOUD_ENABLED=0`** in the live `.env` and both backups → Meta Cloud is **OFF in production**. No active apps/numbers/webhook are serving; the webhook route is dynamic + per-merchant-token (domain-independent).
- **Limitation (not a blocker):** the Meta *account dashboard* was not enumerated — **no Meta credentials were supplied** — but this is moot because the feature is disabled in prod.
- **Migration implication:** Meta **drops off the cutover critical path.** If enabled later, set the webhook host to wkeyone.app then and first fix the hardcoded dead host in `meta-cloud/page.tsx:81`.

### 4. B3 — Bridge — **RESOLVED** [E-24, E-25]
- **Shipped bridge:** the customer download UI targets **JS `bridge-node`** artifacts (`keyone-wa-bridge-*` under `/downloads/keyone-bridge`). The Go `keyone-bridge` is a newer packaging effort not wired to that UI.
- **But nothing is live:** no artifacts on the server (`/downloads` absent, path 404), DB `Bridge` table **0 rows / 0 active**, **0** connections to `:3002`. The gateway runs but idle.
- **OS/package:** UI intends win `.zip` / macOS `.pkg` (`latest.pkg`) / linux `.deb` (`latest.deb`). **Updater/download path:** `/downloads/keyone-bridge/*` — currently empty.
- **Migration implication:** `/downloads/*` and `/bridge` have **zero existing customers** → nothing to preserve for a bridge long-tail. The Go-vs-JS shipping decision is a **product** matter, independent of the domain move; whichever ships must default to wkeyone.app (E-8/E-9) when distribution goes live.

## 5. Corrections to Phase 2 (from 2B evidence)
- **C9:** Prod is **not Dockerized** (systemd `keyone.service` + `keyone-bridge-gateway.service`); the repo docker-compose is not the prod runtime. Deploy is rsync+restart via `release-aws.sh` (host `ubuntu@16.171.230.84`).
- **C10:** Name.com **v4 API works** (supersedes C7's "API gone").
- **C11:** The Phase 2 critical-path items **#7 (Meta webhook)** and the **bridge/downloads long-tail** are **not active** (Meta off; zero bridge clients) — they leave the critical path.
- **C12:** Only `/bridge*` needs proxy-parity on the new host; there is no `/downloads` or `/api/whatsapp` special routing to replicate.

## 6. Updated Critical Path (post-2B — materially shorter)
1. **DNS:** `A wkeyone.app` (+`www`) → `16.171.230.84`; pre-lower TTL. [E-22]
2. **Caddy:** add `wkeyone.app { encode…; @bridge path /bridge /bridge/*; reverse_proxy @bridge localhost:3002; reverse_proxy localhost:3000 }`; reload; confirm auto-cert + HTTPS (HSTS `.app`). [E-19, E-15]
3. **App env** (`/keyone/.env`): set `NEXT_PUBLIC_SITE_URL`, and **add** `NEXT_PUBLIC_BASE_URL`, `PUBLIC_BASE_URL` → `https://wkeyone.app`; restart `keyone.service`. [E-25, E-4, E-5]
4. **Cosmetic/correctness** (can accompany or precede): `security.txt` Canonical; `robots.txt` follows env only if made dynamic (currently static → edit the file); `meta-cloud/page.tsx:81` dead-host fix. [E-10, E-3, E-11]
5. **Redirect:** once wkeyone.app verified green, add 301 `w.keyone1.com`→`wkeyone.app` (no carve-outs needed — no bridge/Meta/downloads dependency). Keep old vhost until SEO re-indexes. [E-24]

**Dropped from the earlier critical path:** Clerk (never integrated), Meta webhook repoint (disabled), bridge-updater/`/downloads` preservation (no clients/artifacts), staging domain (fictional).

## 7. Remaining Blockers
**None gating.** Optional pre-Stage-A product/ops decisions: Go-vs-JS bridge to ship; whether to enable Meta (and only then its webhook host); support@ mailbox domain; whether a dedicated `wkeyone` Sentry project is wanted. Accepted limitation: Meta dashboard not enumerable without creds (moot while disabled).

## 8. Files Updated (2B)
- `DOMAIN_MIGRATION_EVIDENCE_LEDGER.md` — appended **PHASE 2B** (E-19 … E-25).
- `DOMAIN_MIGRATION_PHASE2_REVIEW.md` — this **PHASE 2B** section + verdict update below.
- Phase 1 docs unchanged (correction banner from Phase 2 stands). No evidence deleted.

## 9. FINAL VERDICT (post-2B)

# PHASE 2 BLOCKERS RESOLVED — READY FOR PHASE 3 APPROVAL

Evidence closed B1 (real single-vhost Caddyfile), B2 (domain owned, DNS cleanly editable, no MX/CAA/DNSSEC), and B3 (Meta disabled in prod; zero bridge clients/artifacts). The migration is **substantially smaller and lower-risk** than the pre-2B review feared: one DNS record, one ~8-line Caddy block (auto-cert), three env vars, a few cosmetic string fixes, then a 301. The only inherent sharp edge is the HSTS-preloaded `.app` TLD — the cert must be valid before the redirect flips (E-15).

**Phase 3 remains unauthorized. No production changes were made in this pass.**
