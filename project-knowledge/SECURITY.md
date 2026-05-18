# Security

## Authentication

- **End-user (merchant) auth:** JWT via `jose` (`saas/lib/auth.ts`). Cookie-based session. Password hashed with `bcryptjs`.
- **Internal services:** shared secret `SAAS_INTERNAL_SECRET`. Sent as header `X-Internal-Secret` (or `x-internal-secret`) between:
  - `whatsapp-service` ↔ `mse-saas` (incoming webhook + outgoing send)
  - Cron tasks → `/api/cron/*`
- **Admin role:** `User.role === "admin"` gates `/admin/*` pages and APIs.

## Encryption

Per-merchant API keys (for OpenAI/Gemini/etc.) are encrypted with **AES-256-GCM**:
- File: `saas/lib/crypto-util.ts`
- Key source: `AUTH_SECRET` env (32-char min)
- Stored as `Bot.aiApiKeyEnc` (ciphertext bytes hex-encoded)
- Decrypted **only** when building a provider override in `botProviderOverride(bot)`
- **Never** logged

## Internal secret header

```ts
// in every cron + incoming route:
if (req.headers.get("x-internal-secret") !== SECRET) {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
```

If `SAAS_INTERNAL_SECRET` is unset in production, the code falls back to a hard-coded dev value (`"dev-internal-secret-change-me"`) — **this is unsafe and must be set in prod** (already set on `app.keyone1.com`).

## Rate limiting

- `saas/lib/rate-limit.ts` — IP-keyed sliding-window for `/api/auth` endpoints. Not on the WhatsApp incoming path (that's trusted by the internal secret).

## Multi-tenant isolation

- Every Prisma query scopes by `userId` (the merchant's `User.id`).
- WhatsApp sessions are isolated by directory (`session-{userId}/`).
- `Customer.@@unique([userId, phone])` — the same phone can be a customer of multiple merchants without collision.
- LLM provider keys never leak across merchants (per-Bot row).

## Known risks

| Risk | Severity | Mitigation |
|---|---|---|
| Stolen `SAAS_INTERNAL_SECRET` | high | rotate via deploy.ps1 + restart all services. Plain text in env files — never commit. |
| Stolen `AUTH_SECRET` | critical | invalidates all sessions AND can decrypt every merchant's provider API keys. Must be rotated rarely and securely. |
| Direct DB access on VPS | high | RDP-only; no network DB port exposed. |
| `chatgpt.com` session in `chrome-profile/` | medium | bound to the VPS; sniffing requires admin RDP. |
| WhatsApp account ban | merchant-level | Safety engine + warmup + kill switch (see `SAFETY_ENGINE.md`). |

## What is NOT done (today)

- **No CSP** headers on the SaaS responses.
- **No HSTS** (Caddy is configurable; check `Caddyfile`).
- **No PII redaction** in logs. Customer phone numbers appear in `console.log` lines.
- **No row-level audit log** for admin actions (only `SafetyAudit` for system events).
- **No 2FA** for merchant login.
- **No secret rotation automation.**
- **No Snyk / Dependabot** — `npm ci` updates are manual.

## Recommended improvements (prioritized)

1. Add `Strict-Transport-Security` via Caddy.
2. Add CSP `default-src 'self'`.
3. Redact phone numbers in non-error logs.
4. Migrate `AUTH_SECRET` to a secrets manager (or at least password-protect the env file).
5. Wire `Dependabot` for the `saas/` package.json.

## Endpoint security checklist (when adding new APIs)

- [ ] If the endpoint is service-to-service: require `X-Internal-Secret`.
- [ ] If the endpoint is merchant-facing: use `auth.requireUser()` (returns 401 if no session).
- [ ] If the endpoint is admin-facing: also check `user.role === "admin"`.
- [ ] Never log request body (may contain PII).
- [ ] Sanitize all inputs that flow into DB (Prisma parameterizes automatically; raw SQL is forbidden in this codebase).
- [ ] If the endpoint accepts a phone number, normalize via `lib/phone.ts` before persisting.
