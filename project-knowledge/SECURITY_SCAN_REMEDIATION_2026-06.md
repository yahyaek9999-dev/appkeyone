# Security Scan Remediation — app.keyone1.com (2026-06-10)

Source: external security scan (overall score 17 / critical). Triaged into
code-side fixes (done in this repo) and infrastructure fixes (DNS / registrar /
mail / prod Caddy) that must be applied outside the codebase.

---

## A. Code fixes applied (saas/next.config.js) — DEPLOYED & VERIFIED LIVE

Commit `c15f9ca`, deployed to prod 2026-06-10. Verified on https://app.keyone1.com:
`Content-Security-Policy` enforced header present, `X-Powered-By` absent,
`/api/health` = `db:ok version:c15f9ca`, `/api/ready` = `verdict:ready`, all
key pages return 200.

| Finding | Severity | Fix | Status |
|---|---|---|---|
| Server leaks `X-Powered-By` | Low (Med) | `poweredByHeader: false` | ✅ live |
| CSP header not set | Med (High) | Flipped `Content-Security-Policy-Report-Only` → enforced `Content-Security-Policy` | ✅ live |
| CSP Report-Only header found | Info (High) | Removed Report-Only header (now enforced) | ✅ live |

> Deploy note: the first 3 build attempts shipped the OLD config because
> `git reset --hard` ran while `mse-saas` was running and couldn't overwrite the
> Windows-locked `next.config.js` (HEAD moved, file didn't). Correct order is
> stop service → reset → verify file changed → rebuild → clean restart. Captured
> in memory `ssh-fast-deploy-windows-gotchas` (GOTCHA A2/A3).

CSP enforcement was previously held back because the app loads **Google Fonts
(Cairo)** from `fonts.googleapis.com` / `fonts.gstatic.com` in
`app/layout.tsx`. Before enforcing, those origins were whitelisted:
- `style-src ... https://fonts.googleapis.com`
- `font-src ... https://fonts.gstatic.com`

Inline bootstrap scripts and the JSON-LD block are covered by `'unsafe-inline'`.
**Post-deploy:** open the live site with devtools console open and confirm zero
CSP violations before considering this closed. Future hardening = nonce-based
`script-src` (removes `'unsafe-inline'`).

### Not a real issue (scanner artifacts)
- **Credentials in URL** (`/login?email=…&password=ZAP`): the real login form
  posts via `fetch("/api/auth/login", { method: "POST" })` (`app/(auth)/login/page.tsx`).
  ZAP fabricated the query string; the app does not put creds in the URL.
- **Authentication Request Identified**: informational, nothing to fix.
- **SSL expiring in 62 days**: Caddy auto-renews via Let's Encrypt. Non-issue
  while Caddy is healthy; keep renewal monitoring on.

---

## B. Prod proxy gap (needs the real server Caddyfile — NOT in repo)

The scan reports **HSTS** and **X-Content-Type-Options** missing on:
- `https://app.keyone1.com/mobile.mp4`
- `https://app.keyone1.com/vedio.mp4`

`next.config.js` already sets both on `/(.*)`, so if these were served by Next
they'd be present. The gap means the videos are served by a path that bypasses
Next (Caddy static or a different prod vhost). The repo `deploy/Caddyfile` is for
host `k1wb.app.keyone1.com`, **not** the scanned `app.keyone1.com`; the real one
lives at `C:\Caddy\Caddyfile` on the server.

**Action on the server's Caddyfile** (the vhost serving `app.keyone1.com`), add to
its `header` block so every response — including static media — is covered:
```
header {
    Strict-Transport-Security "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    Referrer-Policy "strict-origin-when-cross-origin"
    -Server
    -X-Powered-By
}
```
Then `caddy reload --config C:\Caddy\Caddyfile`.

Other low/info web findings (SRI missing, big-redirect on /admin & /dashboard,
timestamp disclosure in a JS chunk, cache-control review) are low priority and
deferred.

---

## C. DNS / Registrar / Mail — the bulk of the score (NOT code)

These four High/Medium items drove the "critical" rating. None are in the
codebase — apply them in your DNS provider and domain registrar dashboards.

### 1. DNSSEC — **High**
Enable DNSSEC at the DNS provider, then publish the generated **DS record** at
the registrar. Verify: `dig +dnssec app.keyone1.com` shows RRSIG; registrar shows DS.

### 2. CAA records — **High**
You issue certs via Let's Encrypt (Caddy). Publish at the zone apex:
```
keyone1.com.  CAA  0 issue "letsencrypt.org"
keyone1.com.  CAA  0 iodef "mailto:security@keyone1.com"
```
(Add other CAs only if you also use them.)

### 3. DMARC — **Medium**
Start in monitor mode, then tighten:
```
_dmarc.keyone1.com.  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@keyone1.com; fo=1"
```
After reviewing aggregate reports (~1–2 weeks), move `p=none` → `p=quarantine`
→ `p=reject`.

### 4. Registrar Transfer Lock — **Medium**
Enable the domain/transfer lock in registrar settings and keep it as policy.

### 5. SPF — Informational
Publish at apex (replace `<provider>` with your real mail sender include):
```
keyone1.com.  TXT  "v=spf1 include:<provider> -all"
```

### 6. DKIM — Informational
Enable DKIM in the mail provider and publish the provider's selector CNAME/TXT
records. Verify the selector resolves.

> Note: SPF/DKIM/DMARC only matter if the domain sends email. If it does not,
> publish a null SPF (`v=spf1 -all`) and a reject DMARC (`p=reject`) to block
> spoofing outright.

---

## Verification checklist before deploy (per CLAUDE.md)
- [ ] `npx tsc --noEmit` clean
- [ ] `npm run build` succeeds
- [ ] Regression/verify suite (`npm run verify:all`) green
- [ ] Post-deploy: live site has zero CSP console violations (fonts + app load)
- [ ] Server Caddyfile updated + reloaded; re-check headers on `/vedio.mp4`
- [ ] DNS: DS, CAA, DMARC, SPF, DKIM published and resolving
- [ ] Registrar transfer lock ON

WhatsApp send pipeline: **untouched** (no changes per CLAUDE.md).
