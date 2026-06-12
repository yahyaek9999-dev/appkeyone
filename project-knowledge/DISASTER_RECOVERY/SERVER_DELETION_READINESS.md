# SERVER_DELETION_READINESS — KEYONE Windows VPS

**Date:** 2026-06-12 · Question: **Can the server be safely deleted today?**

---

## Answer: ❌ **NO — not yet. Do NOT delete the server.**

The application is fully recoverable, but **live production data and the master secret exist only on the VPS and have not yet been extracted or verified off the server.** Deleting today = permanent, unrecoverable loss of every tenant, order, conversation, and possibly the key that decrypts all stored credentials.

This becomes **YES** only after the [EXPORT_COMMANDS](EXPORT_COMMANDS.md) P0/P1 set is run **and** the verification checks pass.

---

## Evidence

### Already safe — deletion would NOT lose these ✅
| Asset | Evidence |
|---|---|
| App source + deploy scripts + schemas + CI + Caddyfile + Docker | GitHub `origin/main` @ `cbb7eda` == local `main` (fully pushed, verified) |
| AI engine + CloakBrowser source | On Mac: `~/Desktop/mse_ai_api-main` (canonical) + `~/Desktop/CloakBrowser-main/cloakbrowser` (verified present) |
| SSL certificates | Caddy auto-reissues via ACME on the new host — regenerable |

### NOT safe — deletion WOULD lose these (blockers) 🔴
| # | Missing-before-deletion item | Evidence it's VPS-only | Impact if deleted now |
|---|---|---|---|
| **D1** | **Production database** (`saas.db`) | Mac search found only `dev.db`; no `saas.db`/`prod.db` anywhere off the VPS; no off-site backup exists | **Total loss of all tenant data** |
| **D2** | **`AUTH_SECRET` / prod `.env`** | Live env on `C:\app\...`; only stale/dev `.env` copies on Mac (May 12, may not match prod) | All encrypted tenant AI/Meta/SMTP creds become **permanently undecryptable** even if DB were restored |
| **D3** | **WhatsApp sessions** | `C:\KEYONE\data\wa-sessions` only | Every tenant must re-scan QR (disruptive, needs each tenant's phone) |
| **D4** | **Local backup archives** | `C:\app\backups` only (no off-site) | Lose all historical snapshots |

### Non-blocking (lose-able, re-creatable) 🟠
NSSM service defs, scheduled-task XML, ChatGPT profile, logs → reproducible from Git scripts or re-login.

---

## Missing items before deletion (the gate)

Deletion is safe **only when ALL are true and verified**:

- [ ] **D1** Production DB copied to Mac **and** `PRAGMA integrity_check` = `ok` **and** `SELECT COUNT(*) FROM User` > 0
- [ ] **D2** Prod `.env` files copied; `AUTH_SECRET` present (≥32 chars) **and** verified to decrypt a known `Bot.aiApiKeyEnc`; stored in vault
- [ ] **D3** WhatsApp `wa-sessions` copied (or a conscious decision to accept QR re-scans)
- [ ] **D4** `C:\app\backups` copied
- [ ] Critical set (DB + env) exists in **≥ 2 places** (Mac + SSD) **plus** an **encrypted off-site** copy
- [ ] Local-only Mac assets pushed to GitHub (UI branch, DR docs, engine repo)
- [ ] A **restore smoke test**: the extracted DB + `AUTH_SECRET` boot a local KEYONE and a tenant key decrypts

---

## Risk assessment

| Action | Risk | Severity |
|---|---|---|
| **Delete now** | Irreversible loss of all production data + master secret | 🔴 **Catastrophic** — business data unrecoverable |
| **Delete after P0 only (DB+env)** | Tenants re-scan WhatsApp QR; lose historical backups/logs | 🟠 Moderate — data safe, operational friction |
| **Delete after P0+P1+verify** | None material (certs/services re-created from Git) | 🟢 Low — safe |
| **Keep server running past expiry if possible** | Cost only | 🟢 — buys time; prefer this until verification passes |

### Recommended posture for the next 6 hours
1. **Run [EXPORT_COMMANDS](EXPORT_COMMANDS.md) P0 immediately** (DB + env — < 250 MB, minutes).
2. Verify the DB and `AUTH_SECRET` (integrity + decrypt test).
3. Run P1 (sessions + backups), make the SSD + encrypted off-site copies.
4. Push the local-only Mac assets to GitHub.
5. **Only then** mark the deletion gate complete. If extraction can't finish in time, **extend/renew the VPS** rather than lose the data — a few dollars beats catastrophic loss.

---

## Verdict restated
> **NO**, the server cannot be safely deleted today. Four VPS-only assets (production DB, `AUTH_SECRET`/env, WhatsApp sessions, local backups) are unextracted and unverified. Complete the [EXPORT_COMMANDS](EXPORT_COMMANDS.md) gate above; once every checkbox is ticked and the restore smoke test passes, deletion becomes **YES**.
