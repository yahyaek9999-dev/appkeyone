# DISASTER_RECOVERY — KEYONE

**Date:** 2026-06-12
**Purpose:** Step-by-step recovery runbook for six disaster scenarios. Exact commands included.
**Audience:** the platform owner / on-call operator.

> Read [PROJECT_EXPORT_AUDIT](PROJECT_EXPORT_AUDIT.md) and [ENVIRONMENT_AUDIT](ENVIRONMENT_AUDIT.md) first for the artifact inventory. This runbook assumes you have, or are recovering, those artifacts.

---

## 0. Recovery prerequisites — keep these OFF the VPS

You cannot recover from Git alone. Keep these in a place that survives the VPS:

1. **Git access** — this repository (GitHub).
2. **A recent database backup** — `saas.db` (gzipped).
3. **The secrets** — full `.env` set, especially **`AUTH_SECRET`** (decrypts tenant keys), `SAAS_INTERNAL_SECRET`, `WHATSAPP_SHARED_SECRET`, `LLM_API_KEY`.
4. **The CloakBrowser LLM proxy source** (`mse_ai_api` / `main.py`) — not in Git.
5. **DNS registrar credentials** — to re-point `app.keyone1.com`.
6. *(optional)* **WhatsApp sessions** — to skip QR re-scans.

If you have 1–4, you can fully rebuild. If you have only Git, you can rebuild the **app shell** but not the data, secrets, or AI engine.

---

## Scenario A — Complete server loss (Windows VPS gone)

**Goal:** rebuild on a fresh Ubuntu 24.04 VPS. *(For a Windows-on-Windows rebuild use `deploy/setup-vps.ps1`; this section targets Ubuntu — the recommended forward path.)*

**Estimated downtime:** 30–90 min if backups are in hand.

```bash
# === 1. Provision a fresh Ubuntu 24.04 VPS (2+ vCPU, 4+ GB RAM, 40+ GB disk) ===
ssh root@NEW_VPS_IP
apt update && apt -y upgrade
adduser keyone && usermod -aG sudo keyone

# === 2. Install runtimes ===
# Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git build-essential
# Python 3.10+ for the LLM proxy
apt install -y python3 python3-venv python3-pip
# Caddy (reverse proxy + auto TLS)
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy

# === 3. Lay out data dirs ===
sudo mkdir -p /var/keyone/data/wa-sessions /var/keyone/data/cloak-profile /var/keyone/logs /var/keyone/backups
sudo chown -R keyone:keyone /var/keyone

# === 4. Clone the repo ===
sudo -iu keyone
git clone https://github.com/<owner>/appkeyone.git /home/keyone/app
cd /home/keyone/app

# === 5. Restore the database (from your off-site backup) ===
gunzip -c /path/to/prod-YYYYMMDD.db.gz > /var/keyone/data/saas.db
sqlite3 /var/keyone/data/saas.db "PRAGMA integrity_check;"   # expect: ok

# === 6. Restore secrets — create saas/.env with the OLD AUTH_SECRET (critical) ===
cat > saas/.env <<'EOF'
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_SITE_URL=https://app.keyone1.com
AUTH_SECRET=<RESTORE EXACT OLD VALUE — do not regenerate>
DATABASE_URL=file:/var/keyone/data/saas.db
SAAS_INTERNAL_SECRET=<restore or regenerate; must match wa-service>
WHATSAPP_SERVICE_URL=http://127.0.0.1:7799
WHATSAPP_SHARED_SECRET=<restore or regenerate; must match wa-service>
LLM_API_URL=http://127.0.0.1:7788
LLM_API_KEY=<must match LLM proxy API_KEY>
LLM_MODEL=gpt-4o-mini
TRUSTED_PROXY_COUNT=1
# optional: OPENAI_API_KEY, UPSTASH_*, NEXT_PUBLIC_SENTRY_DSN, META_*
EOF

cat > whatsapp-service/.env <<'EOF'
PORT=7799
SAAS_INTERNAL_SECRET=<same as saas>
SAAS_INCOMING_URL=http://127.0.0.1:3000/api/whatsapp/incoming
SESSIONS_DIR=/var/keyone/data/wa-sessions
EOF

# === 7. Restore WhatsApp sessions (optional — else tenants re-scan QR) ===
rsync -a /path/to/wa-sessions/ /var/keyone/data/wa-sessions/

# === 8. Build & run the SaaS ===
cd saas
npm ci
./node_modules/.bin/prisma generate          # produces the LINUX query engine
npm run build
# run under a process manager (systemd unit or pm2). Example pm2:
npm i -g pm2
pm2 start "npm run start" --name mse-saas --cwd /home/keyone/app/saas

# === 9. Build & run the WhatsApp service ===
cd /home/keyone/app/whatsapp-service
npm ci
pm2 start "node src/index.js" --name mse-wa

# === 10. Restore & run the CloakBrowser LLM proxy (from non-Git source) ===
cd /home/keyone/app   # place the mse_ai_api source here (main.py, requirements.txt)
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
# create root .env with HOST/PORT=7788, API_KEY (== LLM_API_KEY)
pm2 start ".venv/bin/python main.py" --name mse-llm
pm2 save && pm2 startup    # persist across reboot

# === 11. Caddy reverse proxy ===
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
# edit the hostname to app.keyone1.com and upstreams (3000 / 7799 / 7788), then:
sudo systemctl reload caddy

# === 12. Re-point DNS ===
# At the registrar: set A record app.keyone1.com -> NEW_VPS_IP (TTL 30s).
# Caddy auto-issues a fresh Let's Encrypt cert once DNS resolves.

# === 13. Validate ===
curl -sf https://app.keyone1.com/api/health     # expect db:ok, version=HEAD sha
curl -sf https://app.keyone1.com/api/ready      # expect ready:true
```
**Then:** log in, confirm dashboard data, send a WhatsApp test, confirm an AI reply. If sessions weren't restored, notify tenants to re-scan QR. See [UBUNTU_MIGRATION_PLAN](UBUNTU_MIGRATION_PLAN.md) for the validation checklist.

> If you have **no DB backup**, you cannot recover tenant data — recovery becomes a clean reinstall (seed a new admin via `prisma/seed.ts`). This is the failure mode the [BACKUP_POLICY](BACKUP_POLICY.md) exists to prevent.

---

## Scenario B — VPS migration (planned, old server still alive)

**Goal:** move to a new VPS with near-zero data loss. **Downtime target:** ~5–15 min (DNS-bound).

```bash
# 1. Lower DNS TTL to 30s at least 24h in advance.
# 2. Build the NEW server through Scenario A steps 1–4, 8–11 (app + services up, but idle).
# 3. Quiesce the OLD server: stop cron tasks + drain the WhatsApp queue.
nssm stop mse-saas        # on old Windows VPS (brief)
# 4. Snapshot fresh data on the OLD server:
powershell -File deploy\backup-all.ps1        # DB + sessions + .env
# 5. Transfer to NEW server:
scp -r Administrator@OLD_IP:C:/app/backups/pre-deploy-<ts>/ ./restore/
#    Restore DB + wa-sessions + .env onto NEW (Scenario A steps 5–7).
# 6. Re-point DNS A record -> NEW_VPS_IP.
# 7. Validate /api/health + /api/ready on NEW; send a test message.
# 8. Keep OLD server powered (read-only) for 72h as a rollback.
```
**Rollback:** point DNS back to OLD_IP and restart `mse-saas` there.

---

## Scenario C — GitHub repository recovery (repo lost/corrupted)

The repo is mirrored on every machine that has cloned it (the VPS deploy checkout, the owner's Mac, GitHub). To recover:

```bash
# From any existing clone (e.g. the owner's Mac or the VPS C:\app):
cd /path/to/existing/clone
git remote -v
# Recreate the GitHub repo (gh CLI), then push every branch + tags:
gh repo create <owner>/appkeyone --private
git push --all   https://github.com/<owner>/appkeyone.git
git push --tags  https://github.com/<owner>/appkeyone.git

# If NO clone exists but the VPS is alive, the VPS deploy dir is a full clone:
#   C:\app  (git fetch/reset is used by release-git.sh, so .git is present)
```
**Note:** GitHub history does **not** contain secrets, the DB, sessions, or the LLM proxy — those are recovered via Scenarios A/D/E and the off-site secrets vault. Add the LLM proxy source to a repo now (see [GITHUB_COMPLETENESS_AUDIT](GITHUB_COMPLETENESS_AUDIT.md) M1).

---

## Scenario D — Database corruption

**Symptoms:** `/api/health` returns `db:error`, `SQLITE_CORRUPT`, or `PRAGMA integrity_check` ≠ `ok`.

```bash
# 1. Stop writers immediately
nssm stop mse-saas                 # Windows
# (pause cron tasks too)

# 2. Try in-place repair first (sometimes recovers a WAL-related issue)
sqlite3 saas.db "PRAGMA integrity_check;"
sqlite3 saas.db ".recover" | sqlite3 saas-recovered.db    # salvage what's readable
sqlite3 saas-recovered.db "PRAGMA integrity_check;"       # if ok, promote it

# 3. If repair fails, restore the latest GOOD backup
#    (verify-backup.ps1 confirms which backups are valid)
powershell -File deploy\verify-backup.ps1                 # finds + validates newest
gunzip -c C:\app\backups\prod-<good-ts>.db.gz > C:\KEYONE\data\saas.db   # or .NET on Win
sqlite3 C:\KEYONE\data\saas.db "PRAGMA integrity_check;"  # expect ok

# 4. Restart and validate
nssm start mse-saas
curl -sf https://app.keyone1.com/api/health               # db:ok
```
**Data loss window** = time since last good backup (currently up to ~24h with daily backups — shorten via [BACKUP_POLICY](BACKUP_POLICY.md)). Confirm `AUTH_SECRET` is unchanged so encrypted columns still decrypt.

---

## Scenario E — WhatsApp session loss

See [WHATSAPP_RECOVERY_AUDIT](WHATSAPP_RECOVERY_AUDIT.md) for full detail. Quick path:

```bash
# If you have a sessions backup:
nssm stop mse-wa
robocopy "C:\app\backups\pre-deploy-<ts>\wa-sessions" "C:\KEYONE\data\wa-sessions" /E /COPY:DAT
nssm start mse-wa          # auto-restores on boot

# If you do NOT:
nssm start mse-wa          # starts with empty SESSIONS_DIR
# -> each tenant re-scans QR from their dashboard (Linked Devices on their phone)
```
**No message/customer data is lost** — that lives in the DB. Only the live device link is re-established. Ensure `SAAS_INTERNAL_SECRET` matches between saas and wa-service.

---

## Scenario F — Rollback to a previous release

Three rollback mechanisms exist; pick by deploy method.

```bash
# A) Artifact deploys (release.sh path) — file swap, no rebuild:
./deploy.sh --rollback        # -> deploy/rollback-release.sh swaps .next + node_modules
                              #    with C:\app\releases\previous
#    ⚠️ Verify C:\app\releases\previous EXISTS first — it was absent on 2026-06-05.

# B) Full snapshot rollback (rollback.ps1) — DB + .env + sessions + code:
powershell -File deploy\rollback.ps1                  # uses C:\app\backups\latest.txt
powershell -File deploy\rollback.ps1 -Snapshot pre-deploy-<ts>   # explicit snapshot

# C) Git-based code rollback:
ssh Administrator@VPS
cd C:\app
git reset --hard <previous-good-sha>
cd saas && npm ci && .\node_modules\.bin\prisma generate && npm run build
nssm restart mse-saas
curl -sf https://app.keyone1.com/api/ready
```
**Choosing:** for a bad **code** deploy use A or C (DB untouched). Use B only if the deploy also changed data and you need to roll back the DB too — and confirm the snapshot is recent enough to accept its data loss.

---

## Post-recovery checklist (all scenarios)

- [ ] `GET /api/health` → `status:ok`, `db:ok`, `version` == deployed SHA
- [ ] `GET /api/ready` → `ready:true`
- [ ] Public pages 200; auth-gated pages redirect to `/login`
- [ ] Admin login works; dashboard shows expected tenant data (row counts sane)
- [ ] Send a WhatsApp test message → delivered
- [ ] Inbound WhatsApp message → reaches `/api/whatsapp/incoming`
- [ ] AI reply works (LLM proxy reachable on 7788) — or external provider configured
- [ ] Caddy serving valid TLS for `app.keyone1.com`
- [ ] Scheduled jobs re-installed (broadcasts/follow-ups/automations/abandoned-cart/backup)
- [ ] A fresh backup taken and **copied off-site**
- [ ] Tenants notified if QR re-scan was required
