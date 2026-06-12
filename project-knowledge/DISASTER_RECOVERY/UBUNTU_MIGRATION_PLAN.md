# UBUNTU_MIGRATION_PLAN — KEYONE

**Date:** 2026-06-12
**Goal:** production-grade migration from the current **Windows VPS** to **Ubuntu 24.04**, moving the stack to Linux-native services while keeping behavior identical.
**Target stack:** Ubuntu 24.04 → Caddy (or Nginx) → Node 20 → Prisma → SQLite (then optional Postgres) → WhatsApp services + CloakBrowser LLM.

> This is a **planning document**. It does not change production. Execute only with owner approval and during a scheduled window. Companion: [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario B (which shares the cutover mechanics) and [DATABASE_MIGRATION_AUDIT](DATABASE_MIGRATION_AUDIT.md) (optional Postgres step).

---

## 1. Target architecture

```
Internet
  │  443/80
  ▼
Caddy v2  (auto Let's Encrypt, security headers, gzip, static cache)
  ├── /            → 127.0.0.1:3000   mse-saas      (Next.js 14, systemd or pm2)
  ├── /wa/*        → 127.0.0.1:7799   mse-wa        (whatsapp-web.js / Puppeteer)
  └── /llm/*       → 127.0.0.1:7788   mse-llm       (CloakBrowser FastAPI + Playwright)

Data (host, never in containers/images):
  /var/keyone/data/saas.db            SQLite DB
  /var/keyone/data/wa-sessions/       WhatsApp session auth
  /var/keyone/data/cloak-profile/     LLM proxy browser profile
  /var/keyone/backups/                local backup staging (then off-site)
  /var/keyone/logs/                   service logs
Secrets:
  /home/keyone/app/saas/.env, whatsapp-service/.env, root .env  (or /etc/keyone/*.env)
```

**Two valid run models on Ubuntu:**
- **Model 1 — systemd/pm2 on host** (closest to current Windows/NSSM model; lowest risk). Recommended for the first migration.
- **Model 2 — Docker Compose + Watchtower** (already prepared: `docker-compose.production.yml`, `deploy/vps-docker-setup.sh`). Cleaner long-term; adopt after Model 1 is stable. Note: only the SaaS is containerized in that compose; wa-service + LLM proxy stay on the host.

This plan uses **Model 1** for the cutover and notes the Docker option where relevant.

---

## 2. Process-manager mapping (NSSM → systemd)

| Windows NSSM | Ubuntu systemd unit | Command |
|---|---|---|
| `mse-saas` | `keyone-saas.service` | `npm run start` in `saas/` (port 3000) |
| `mse-wa` | `keyone-wa.service` | `node src/index.js` in `whatsapp-service/` (port 7799) |
| `mse-llm` | `keyone-llm.service` | `.venv/bin/python main.py` (port 7788) |
| `mse-caddy` | `caddy.service` (apt-provided) | `caddy run --config /etc/caddy/Caddyfile` |

**Scheduled tasks → systemd timers** (replacing Windows Task Scheduler):

| Windows task | systemd timer | Interval | Action |
|---|---|---|---|
| `KEYONE-Broadcasts` | `keyone-broadcasts.timer` | 1 min | `curl -s -H "x-internal-secret:$S" localhost:3000/api/cron/broadcasts` |
| `KEYONE-Follow-Ups` | `keyone-followups.timer` | 30 min | `…/api/cron/follow-ups` |
| `KEYONE-Automations` | `keyone-automations.timer` | 30 min | `…/api/cron/automations` |
| `KEYONE-Abandoned-Cart` | `keyone-abandoned-cart.timer` | 60 min | `…/api/cron/abandoned-cart` |
| `KEYONE-DB-Backup` | `keyone-backup.timer` | daily 03:30 | `sqlite3 .backup` + gzip + **off-site upload** |

> The shared secret can be read from the service env; reuse the `SAAS_INTERNAL_SECRET` value. The cron endpoints are the same ones the Windows `run-*.ps1` scripts call.

Example unit (`/etc/systemd/system/keyone-saas.service`):
```ini
[Unit]
Description=KEYONE SaaS
After=network.target
[Service]
User=keyone
WorkingDirectory=/home/keyone/app/saas
EnvironmentFile=/home/keyone/app/saas/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=3
[Install]
WantedBy=multi-user.target
```

---

## 3. Migration steps (execution order)

1. **Pre-stage (T-24h+):** lower DNS TTL on `app.keyone1.com` to 30s. Take a verified backup on the Windows VPS (`backup-all.ps1` + `verify-backup.ps1`). Copy it **off** the VPS.
2. **Provision Ubuntu** (Scenario A steps 1–4): Node 20, Python 3.10, Caddy, data dirs, repo clone.
3. **Restore data + secrets** onto Ubuntu (Scenario A steps 5–7), **preserving `AUTH_SECRET` verbatim**. Convert all `C:/...` paths to `/var/keyone/...`.
4. **Restore the LLM proxy source** (non-Git) and bring up `keyone-llm.service`.
5. **Build the apps** (`npm ci` → `prisma generate` (Linux engine) → `npm run build`) and start `keyone-saas` + `keyone-wa` under systemd.
6. **Install Caddy config** (`deploy/Caddyfile` adapted: hostname `app.keyone1.com`, upstreams 3000/7799/7788). `systemctl reload caddy`.
7. **Install systemd timers** for the cron jobs + backup.
8. **Smoke test on the box** (before DNS): `curl localhost:3000/api/health`, send a WhatsApp test with a connected session, confirm an AI reply.
9. **Cutover:** quiesce the Windows VPS (stop `mse-saas`, drain queue), take a final delta backup, restore the delta onto Ubuntu, then **re-point DNS** `app.keyone1.com → NEW_IP`.
10. **Validate** (section 6). Keep Windows VPS read-only for 72h.
11. *(optional, later)* migrate SQLite → Postgres per [DATABASE_MIGRATION_AUDIT](DATABASE_MIGRATION_AUDIT.md), and/or adopt the Docker/Watchtower model.

---

## 4. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **`AUTH_SECRET` not carried over** → all tenant provider keys unreadable, all sessions invalid | Med | Copy `.env` verbatim; verify a tenant key decrypts before cutover |
| 2 | **LLM proxy source unavailable** (not in Git) | Med | Stage `mse_ai_api` source first; confirm `keyone-llm` answers on 7788 before cutover |
| 3 | **Prisma engine mismatch** (built on wrong OS) | High if skipped | Always run `prisma generate` on Ubuntu after `npm ci` |
| 4 | **Path-style bugs** (`C:/` vs `/var`) in `DATABASE_URL`/`SESSIONS_DIR` | High | Search/replace all Windows paths; grep `.env` for `C:` |
| 5 | **WhatsApp re-auth storm** if sessions not restored | Med | Restore `wa-sessions/`; if not possible, pre-notify tenants for QR re-scan |
| 6 | **Chromium deps missing** (Puppeteer/Playwright) | Med | Install system libs (`apt install -y libnss3 libatk-bridge2.0-0 libgbm1 …`); `playwright install chromium` |
| 7 | **DNS mismatch** `app.keyone1.com` vs `k1wb.app.keyone1.com` | Med | Decide the canonical host; configure Caddy + DNS for it; update `NEXT_PUBLIC_SITE_URL` |
| 8 | **Port drift** (3001 vs 7799) | Low | Set wa-service `PORT=7799`, match `WHATSAPP_SERVICE_URL` + Caddy upstream |
| 9 | **TLS issuance delay** (ACME rate limits / DNS not propagated) | Low | Pre-validate DNS; Caddy retries; keep TTL low |
| 10 | **No off-site backup mid-migration** | Med | Take the backup off the VPS in step 1 before touching anything |

---

## 5. Downtime estimate & rollback

| Phase | Downtime |
|---|---|
| Parallel build of new server | **0** (old server serving) |
| Quiesce + final delta sync + DNS cutover | **5–15 min** (DNS-propagation bound with TTL 30s) |
| If Postgres migration bundled in | **+10–30 min** maintenance window |

**Rollback plan:**
- **Before DNS cutover:** trivial — just don't cut over; old server unaffected.
- **After DNS cutover, within 72h:** re-point DNS `app.keyone1.com → OLD_IP`, restart `mse-saas` on Windows. Any data written to Ubuntu post-cutover must be re-synced back (keep the window short; ideally cut over during low traffic).
- Keep the Windows VPS powered and untouched for 72h as the hot rollback target.

---

## 6. Validation checklist (must all pass post-cutover)

- [ ] `curl -sf https://app.keyone1.com/api/health` → `status:ok`, `db:ok`, `version` = deployed SHA
- [ ] `curl -sf https://app.keyone1.com/api/ready` → `ready:true`
- [ ] Valid Let's Encrypt cert (no browser warning); HSTS header present
- [ ] Admin login works; dashboard tenant data matches the old server (row counts)
- [ ] A tenant provider key decrypts (proves `AUTH_SECRET` carried over)
- [ ] WhatsApp: existing sessions reconnected (or QR re-scan completed); test send delivered
- [ ] Inbound WhatsApp reaches `/api/whatsapp/incoming` (200 + processed)
- [ ] AI reply works via LLM proxy on 7788 (or external provider)
- [ ] All 5 systemd timers active (`systemctl list-timers | grep keyone`)
- [ ] Backup timer produces a gzipped DB **and uploads it off-site**
- [ ] `npm run verify:all` (or at least `verify:schema-parity` + `verify:rbac`) passes
- [ ] Sentry receiving events (if enabled)
- [ ] Old Windows VPS retained read-only for 72h

---

## 7. Notes specific to KEYONE

- **WhatsApp send pipeline is untouched** by this migration — same code, same provider, just a new host. (CLAUDE.md hard rule respected.)
- **Uploads:** nothing to migrate — KEYONE stores no user binaries on disk (see [PROJECT_EXPORT_AUDIT](PROJECT_EXPORT_AUDIT.md) §5).
- **Redis/BullMQ:** optional; leave `ENABLE_BULLMQ=0` to keep the cron+SQLite-queue model and avoid adding Upstash as a hard dependency during migration.
- **Docker alternative:** once stable on systemd, `deploy/vps-docker-setup.sh` + `docker-compose.production.yml` give a containerized SaaS with Watchtower auto-deploy (~30s deploys vs the current 8–12 min Windows window).
