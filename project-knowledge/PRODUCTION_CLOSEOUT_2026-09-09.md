# WKEYONE — Production Closeout

Date: 2026-09-09 · Live: `1dd56b4` · Local main: `fdd76ed`

Every claim below is followed by the command that produced it. Where evidence
was not obtainable, the line says UNKNOWN rather than guessing.

---

## 1. Counts — three registries, deliberately not equal

The recurring "142 vs 82" confusion comes from treating three different
registries as one. They are distinct, and each was counted separately.

| Registry | Where | Count |
|---|---|---|
| Feature registry | `saas/lib/feature-control.ts` (+ its JSON) | **98** = 83 customer (62 `feature` + 21 `subfeature`) + 15 `admin_internal` |
| Pricing capabilities | `saas/lib/pricing/catalog.ts` → `CAPABILITIES` | **83**, all customer-visible, 0 `admin_internal` |
| Runtime DB table | production `FeatureControl` | **83** rows |

Production `FeatureControl` breakdown:

- 83 total, `featureType='feature'` for all 83
- `customerVisible` = 83, `adminOnly` = 0
- `status`: 82 `enabled` + 1 `coming_soon`
- `featureSource` = `registry` for all 83
- `createdAt`: 68 on 2026-08-19, 14 on 2026-08-20, 1 on 2026-08-22
- `changedBy`: 76 null, 7 edited by the account owner

**83 is the canonical customer feature count.** The catalog↔DB diff is empty in
both directions. The single non-enabled row is `coming_soon`, not a fault.

### The historical 142 — what is known and what is not

`FINAL_MASTER_INVENTORY_REPORT.md` recorded 142. That decomposes arithmetically
as **98 registry + 38 `legacy_mapped` + 6 `legacy_unmapped` = 142**, and both
legacy types are real declared values (`lib/feature-control.ts:45`), classified
by `classifyLegacyRows()` (`:690`).

What the evidence shows today:

- production has **zero** rows of either legacy type
- all 83 rows are `featureSource='registry'`
- `grep 'featureControl.delete'` → **no deletion path exists anywhere in the code**
- `classifyLegacyRows()` reclassifies; its own comment (`:609`) says it keeps the
  row "alive; just classifies the legacy one as `legacy_mapped`"

**UNKNOWN:** by what mechanism the 44 legacy rows are absent from this database.
No deletion path exists, so they were most likely never in *this* table — but I
have no evidence establishing that, and none was fabricated to close the gap.
No historical record was deleted to make the numbers agree.

---

## 2. Release state

Production `1dd56b4` is a strict ancestor of local main `fdd76ed`. The entire
delta is two commits:

    91fb1d3  docs: Bridge 401 root cause + QR transport guards
    fdd76ed  test: replace stale registry assertions with the real reconciliation

    2 files changed, 303 insertions(+), 215 deletions(-)
      project-knowledge/BRIDGE_401_AND_TRANSPORT_GUARDS_2026-09-07.md
      saas/__tests__/phase3-admin-features.test.ts

**Zero runtime code.** Proven not to reach the running app:

- `saas/tsconfig.json:20` — `"exclude": [..., "__tests__"]`
- `deploy/release-aws.sh` rsyncs only `saas/` and `bridge-gateway/`;
  `project-knowledge/` is outside both

Deploying `fdd76ed` would produce a byte-identical runtime. **Intentionally not
deployed** — production already runs every runtime fix.

---

## 3. Runtime-verified in production

Bridge auth boundary (the 401 regression I introduced in `5038111`, fixed in
`66b598d`) — verified live, no rows written:

    POST /api/bridge/v1/device/start  {}  → 400 bad_body (needs codeChallenge, providers)
    POST /api/bridge/v1/token/rotate  {}  → 401  ← from its own bearer check, not a session gate
    GET  /api/bridge/v1/health            → 200 {"ok":true,"protocol":1}

`device/start` reaching Zod validation proves the session gate is gone.
`token/rotate`'s 401 originates at `route.ts:35`/`:44` (`parseBearer`), and the
file carries the DO-NOT-ADD marker at `:20`. Both files verified to contain zero
`apiGate` calls; the seven user-facing bridge routes all retain theirs.

Auth enforcement, unauthenticated:

    /dashboard, /dashboard/{inbox,import,settings/bridge}  → 307 → /login
    /admin                                                 → 307 → /admin/login
    /api/bridge/v1/overview, /api/broadcast-credits/campaigns → 401

Security headers on `/`: CSP, HSTS `max-age=63072000; includeSubDomains; preload`,
`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`. Residual: CSP `script-src`
carries `'unsafe-inline' 'unsafe-eval'` (Next.js requirement) — noted, not fixed.

Secrets hygiene: no hardcoded credentials, no auth-bypass markers, no real
`.env` tracked in git (only two `.env.example`).

Latency (3 samples, network-inclusive from a remote client): `/api/health` 0.50s,
`/api/ready` 0.82s, `/` 1.26s, `/login` 1.83s — all HTTP 200.

---

## 4. Environment — corrected

An earlier probe of mine reported vars "absent" because it used names that do
not exist in this system. Correcting the record:

- the auth secret is **`AUTH_SECRET`**, not `NEXTAUTH_SECRET`
- **`BRIDGE_HMAC_SECRET` and `BRIDGE_GATEWAY_URL` are referenced in 0 files** —
  they were invented by my probe and are not KEYONE configuration

Required-in-production (`lib/env.ts` `REQUIRED_IN_PROD`) — all three present on
the running process: `AUTH_SECRET`, `DATABASE_URL`, `SAAS_INTERNAL_SECRET`.

Transport flags: `BRIDGE_ENABLED=1`, **`META_CLOUD_ENABLED=0`**. Meta is
deliberately off, which is why no Meta credentials are configured — consistent,
not a gap.

Not configured (each absent by design, features degrade rather than break):
`SENTRY_DSN` (telemetry absent — a standing known gap), `OPENAI_API_KEY`,
`STRIPE_SECRET_KEY`. `ANTHROPIC_API_KEY` is referenced in 0 files.

---

## 5. Backup and recovery — VERIFIED

`keyone-dbbackup.timer` → `backup-db.sh`, daily ~03:00 UTC.

- last run 2026-09-09 03:01:34, `status=0/SUCCESS`
- 16 dumps retained, 14-day pruning confirmed running
- the script self-verifies each archive with `pg_restore --list`
- newest dump independently re-verified here: 1002 TOC entries, `dbname: keyone`
- disk 12G/96G used (12%)

**Limitation, documented in the script itself:** no off-host copy. The host has
no `awscli` and no `~/.aws` credentials, so backups live on the same EBS volume
as the database — a single failure domain.

**UNKNOWN:** whether AWS-level EBS snapshots cover this. The AWS MCP rejected
the call with `AuthFailure`, so snapshot state could not be read from this
session. Not asserted either way.

---

## 6. Test status

    26 files · 366 tests · 0 failures
    typecheck: 0 errors
    schema parity: 176 models in lock-step (sqlite ↔ postgres)
    rbac: PASS

The 17 earlier failures were classified **STALE TEST**, not product breakage:
`phase3-admin-features.test.ts` asserted a registry shape that no longer
matched. The corrected file was brought from the audit branch and now asserts
the real 98 = 83 + 15 reconciliation.

Note: the DB stores all 83 rows as `featureType='feature'`, while the registry
splits the same 83 into 62 `feature` + 21 `subfeature`. The test reads the
registry, so it is consistent — but the DB column does not carry the subfeature
distinction. Cosmetic; recorded, not "fixed" by editing data.

---

## 7. Production data (unchanged by this work)

    users 5 · bots 5 (1 bridge, 4 qr) · conversations 1 · messages 2
    subscriptions 3 · bridges 1

No customer row was created, altered, or deleted during this closeout.

---

## 8. Bridge store — published and verified (was the last open item)

`deploy/publish-wwebjs.sh 1.0.11-wweb` → `EXIT=0`. The store had been serving
`1.0.3` while the repo and the running Bridge were both at `1.0.11-wweb`; that
gap is now closed.

    https://wkeyone.app/downloads/keyone-bridge/version.json
      version  1.0.11-wweb
      engine   whatsapp-web.js
      released 2026-09-09T16:26:42Z

Verified, not assumed:

- **Metadata** — all 5 platforms carry `file` + `sha256` + `size`:
  `darwin_arm64`, `darwin_x64`, `linux_amd64`, `linux_arm64`, `windows_amd64`.
  (`latest.pkg`/`latest.deb` *are* the primary-arch artifacts, not placeholders.)
- **Delivery** — every artifact returns HTTP **206** with `Accept-Ranges: bytes`
  (app.tar.gz, both pkgs, both debs, the zip, checksums.txt). Resumable, which
  the self-updater depends on.
- **Integrity** — `sha256sum -c checksums.txt` on the host: **6/6 OK**.
- **Bundle contents** — `app.tar.gz` unpacks to `keyone-wa-bridge.js`,
  `node_modules` (with `whatsapp-web.js` vendored), `package.json`,
  `package-lock.json`; the shipped script reports `VERSION = "1.0.11-wweb"`.
- **Go-era leftovers** — none; `find` over the store matched no
  `.exe`/`amd64`/`-go-`/`golang` artifact.
- **Self-update path** — the real `isNewer()` was extracted from
  `bridge-node/keyone-wa-bridge.js:144` and exercised directly:

      isNewer("1.0.3",       "1.0.11-wweb") = true   ← a 1.0.3 Bridge updates
      isNewer("1.0.11-wweb", "1.0.11-wweb") = false  ← already current
      isNewer("1.0.11-wweb", "1.0.12-wweb") = true   ← future builds offered
      isNewer("1.0.11-wweb", "1.0.3")       = false  ← never downgrades
      isNewer("1.0.9",       "1.0.11-wweb") = true   ← numeric, not lexical

  It strips the `-wweb` suffix before comparing, so the suffix does not make the
  build look like a semver prerelease. **Self-update is fixed** — on evidence.
- **Resulting runtime version** — the production `Bridge` row records
  `version = 1.0.11-wweb`, so a real Bridge did reach this build.

### Defect found and fixed during this verification

The shipped `app.tar.gz` contained `package.json` at **`1.0.3`** while its
`keyone-wa-bridge.js` said `1.0.11-wweb`. Cause: `publish-wwebjs.sh` refreshed
the `.js` into all five staging dirs but never the `package.json`, so every
staged bundle kept the version of whichever release first created the dir.

Impact assessed before fixing: **cosmetic**. The bridge never reads
`package.json` — `grep` for `require(...package.json)` / `pkg.version` in
`keyone-wa-bridge.js` returns nothing — and both the runtime version report and
`isNewer()` use the `VERSION` constant in the script, which is correct.

Fixed in `deploy/publish-wwebjs.sh` (package.json now rides along with the js,
`sh -n` clean). **Not re-published for a cosmetic string** — the next publish
picks it up. Repo `bridge-node/package.json` was already correct at
`1.0.11-wweb`.

---

## 9. Investigated and found NOT to be defects

Recorded so they are not re-opened later:

- **`BridgeTransport.state = 'connected'` on a revoked Bridge.** The row is
  stale (last written 2026-09-05 19:12:37, before the 19:18:21 revoke), and
  `revoke/route.ts` indeed does not reset it. But the only reader,
  `app/api/whatsapp/status/route.ts:22`, joins through
  `bridge: { revokedAt: null, status: "online" }` — a revoked bridge yields
  `null`, so the endpoint answers "disconnected". **Inert by construction; no
  customer impact.**
- **`token/rotate` answering 401.** That is its own bearer check
  (`route.ts:35`/`:44`), not the session gate that caused the outage.
- **Store showing only one macOS/Linux file per arch.** `latest.pkg`/`latest.deb`
  are the arm64/amd64 primaries; all five platforms are present.

---

## 10. Verdict

| Gate | State |
|---|---|
| Bridge auth boundary | RUNTIME VERIFIED in production |
| Transport guards (import, campaigns) | IMPLEMENTED + test-verified (12 ordering tests, mutation-checked) |
| Bridge store + self-update | RUNTIME VERIFIED at `1.0.11-wweb` |
| Auth enforcement / security headers | RUNTIME VERIFIED |
| Secrets hygiene | VERIFIED clean |
| Backup | VERIFIED daily, self-checking, 14-day retention |
| Off-host backup copy | ABSENT (documented in-script); EBS snapshots UNKNOWN |
| Telemetry (Sentry) | ABSENT — standing known gap |
| Tests / typecheck / schema parity | 366 pass, 0 type errors, 176 models in lock-step |
| Feature counts | RECONCILED (83 canonical); origin of the historical 44 legacy rows UNKNOWN |
| Git ↔ production | CONSISTENT — delta is docs + tests only, zero runtime code |

**Requires the account owner, not me:** `fdd76ed` is committed locally but
**not pushed**. A push is outward-facing and the earlier authorization covered a
different commit, so it was left for an explicit go-ahead. Production is
unaffected either way — the commit contains no runtime code.
