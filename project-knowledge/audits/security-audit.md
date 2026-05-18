# Security Audit

> Date: 2026-05-17. Read-only audit. No penetration testing performed.

## Auth surface

| Endpoint class | Mechanism | Status |
|---|---|---|
| Merchant login | Email/password → bcrypt hash → JWT cookie | ✅ Implemented in `lib/auth.ts` |
| Internal services | `X-Internal-Secret` header | ✅ Enforced in all service-to-service calls |
| Admin routes | `User.role="admin"` check | ✅ Enforced in `app/admin/**` and admin APIs |
| Cron tasks | `X-Internal-Secret` header | ✅ Enforced in all `/api/cron/*` routes |

## Secrets

| Secret | Used by | Storage | Rotation |
|---|---|---|---|
| `AUTH_SECRET` | JWT signing + AES key derivation | `saas/.env` | manual |
| `SAAS_INTERNAL_SECRET` | service-to-service header | env in all 4 services | manual |
| `LLM_API_KEY` | mse-llm calls | env | manual |
| Per-merchant external provider keys | external LLMs | `Bot.aiApiKeyEnc` (AES-256-GCM) in DB | merchant rotates via UI |

**Risk:** if `AUTH_SECRET` is leaked, every merchant's encrypted provider key can be decrypted. This is the single most sensitive secret.

**Mitigation today:** stored in `saas/.env` on a single RDP-only Windows VPS.

**Mitigation tomorrow (recommended):** move to a secrets manager (Azure Key Vault / HashiCorp Vault) or at minimum password-protect the env file at the OS level.

## Encryption

- **AES-256-GCM** via `lib/crypto-util.ts` for `Bot.aiApiKeyEnc`.
- Key derived from `AUTH_SECRET` (verify in source — TODO if not). Each ciphertext includes a fresh IV/nonce.
- Decryption only at the point of use (`botProviderOverride`), never persisted in memory beyond the request.

## SQL injection

- All queries go through Prisma → automatic parameterization.
- Raw queries (`$queryRaw`, `$executeRaw`) — search confirms **none used in the codebase**.
- ✅ Verdict: no SQL injection risk via the API.

## XSS

- React auto-escapes user-supplied content by default.
- No `dangerouslySetInnerHTML` calls found in critical paths.
- ✅ Verdict: low XSS risk.

## CSRF

- App Router routes use POST with JSON bodies; no form-based CSRF.
- Cookies are HttpOnly via `jose` JWT settings (verify `SameSite` is set; TODO).
- 🟡 Recommendation: confirm SameSite=Lax on the session cookie.

## Rate limiting

- `lib/rate-limit.ts` — sliding-window IP-keyed rate limiter on `/api/auth/*` paths.
- Not on the WhatsApp incoming path (trusted by internal secret).
- Not on the playground (could be abused).
- 🟡 Recommendation: add rate limit to `/api/chat` (playground) — currently authenticated users could burn merchant quota by spamming.

## Multi-tenant isolation

- ✅ All Prisma queries scope by `userId`.
- ✅ WhatsApp sessions are folder-isolated (`session-{userId}/`).
- ✅ `Customer.@@unique([userId, phone])` — same phone can belong to multiple merchants.
- ✅ Provider keys never leak across merchants (per-Bot row).

## File upload

- Knowledge upload: PDF/DOCX accepted at `/api/knowledge/upload`.
- Parsing via `pdf-parse` and `mammoth`. **Known vulnerability**: malicious PDF/DOCX could exploit parser bugs (low-likelihood, but possible).
- 🟡 Recommendation: enforce file-size cap (e.g. 10 MB) at the API and check MIME type.

## TLS / transport

- Caddy auto-provisions Let's Encrypt certs for `app.keyone1.com`.
- TLS 1.2/1.3 (Caddy default).
- 🟡 Recommendation: add `Strict-Transport-Security` (HSTS) via Caddyfile.

## Headers

- 🟡 No CSP (Content Security Policy) headers configured.
- 🟡 No X-Frame-Options, X-Content-Type-Options, Referrer-Policy explicit.
- Caddy can add these via the global block. Suggested defaults:
  ```caddy
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    X-Frame-Options DENY
  }
  ```

## Logging hygiene

- Console logs include phone numbers in error paths (PII). Acceptable for VPS local logs but not safe for cloud aggregation.
- 🟡 Recommendation: redact phone numbers in `console.warn`/`error` to last-4-digits format.

## Dependency vulnerabilities

- No `npm audit` automation today.
- Dependencies pinned at `^x.y.z` — minor versions can drift on `npm ci`.
- 🟡 Recommendation: add Dependabot or weekly `npm audit` check.

## Account safety features

- No 2FA on merchant login.
- No password complexity requirements (verify in `auth.ts`).
- No account lockout after N failed logins.
- 🟡 Recommendations:
  - Add 2FA (TOTP via QR) — `lib/auth.ts` would need an OTP secret column on User.
  - Enforce min 12-char password.
  - Add a `LoginAttempt` table or use the `ApiCall` table for lockout logic.

## Admin actions

- No row-level audit log for admin actions (e.g. cancelling a subscription, modifying a plan).
- `SafetyAudit` only covers system events.
- 🟡 Recommendation: add an `AdminAction` table for compliance.

## Known unsafe defaults

- `SAAS_INTERNAL_SECRET` falls back to `"dev-internal-secret-change-me"` if env unset. **Already set in prod**; risk only on first-time misconfiguration.
- `LLM_API_KEY` falls back to a dev default — same risk.
- ✅ Already mitigated by production env config.

## Compliance posture (informational)

This codebase is **NOT** SOC 2 / GDPR / HIPAA ready by default. To get there:
- PII redaction in logs
- Row-level audit for admin actions
- Customer-data export endpoint (right-to-access)
- Customer-data deletion endpoint (right-to-erasure) — cascade-delete via `User` already handles this if a merchant offboards
- Encryption at rest for the DB (consider SQLCipher or migrate to Postgres + Cloud KMS)
- Documented retention policy

## Summary

**Current state: B+** — good fundamentals (parameterized queries, multi-tenancy, encrypted keys, internal-secret), but missing hardening (CSP/HSTS, rate limits, 2FA, dependency scanning).

**Recommended next actions:**
1. Add HSTS + CSP via Caddyfile
2. Rate-limit `/api/chat`
3. Add `SameSite=Lax` to session cookie (verify it isn't already)
4. Enable Dependabot
5. Document AUTH_SECRET rotation procedure
