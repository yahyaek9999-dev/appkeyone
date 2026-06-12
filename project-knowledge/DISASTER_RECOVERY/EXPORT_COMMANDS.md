# EXPORT_COMMANDS — KEYONE EOL Extraction

**Date:** 2026-06-12 · **COMMANDS ONLY — DO NOT EXECUTE here.** Run from the owner's Mac, which has SSH access.
**Principle:** every command is **read-only on the VPS** — it copies *out* or redirects output *to the Mac*. None deletes, restarts, deploys, or modifies the VPS. (The single optional `.dump` reads a consistent snapshot inside a read transaction and writes nothing on the VPS.)

> The VPS is **Windows** (`Administrator@217.154.163.16`, OpenSSH). `scp` accepts forward-slash paths. Confirm which local key opens the VPS — candidates on this Mac: `~/.ssh/keyone_vps_github`, `~/.ssh/id_ed25519`.

---

## Setup (Mac)
```bash
export VPS=Administrator@217.154.163.16
export KEY=~/.ssh/keyone_vps_github        # verify in step 0; try ~/.ssh/id_ed25519 if this fails
export DEST=~/Desktop/KEYONE_EOL_EXTRACTION
mkdir -p "$DEST"/{db,env,wa-sessions,backups,configs,logs,engine}
```

## Step 0 — Verify access + confirm live paths (read-only listing)
```bash
# Prove SSH works and the host is reachable
ssh -i "$KEY" "$VPS" "hostname && whoami"

# Confirm which DB path is live + sizes (no changes)
ssh -i "$KEY" "$VPS" "powershell -Command \"Get-ChildItem C:\KEYONE\data, C:\app\saas\prisma, C:\app\backups -ErrorAction SilentlyContinue | Select-Object FullName,Length,LastWriteTime\""
# Confirm env + sessions + caddy presence
ssh -i "$KEY" "$VPS" "powershell -Command \"Test-Path C:\app\saas\.env; Test-Path C:\app\whatsapp-service\.env; Test-Path C:\app\.env; Test-Path C:\KEYONE\data\wa-sessions; Test-Path C:\Caddy\Caddyfile\""
```
> Use the output to pick the real DB path. The commands below copy **both** candidates regardless — harmless if one is absent.

---

## P0 — Production database (do this FIRST)
```bash
# 1a. Raw live DB files (+ WAL sidecars) — always works, no sqlite3 needed on VPS
scp -i "$KEY" "$VPS:C:/KEYONE/data/saas.db"      "$DEST/db/" 2>/dev/null || true
scp -i "$KEY" "$VPS:C:/KEYONE/data/saas.db-wal"  "$DEST/db/" 2>/dev/null || true
scp -i "$KEY" "$VPS:C:/KEYONE/data/saas.db-shm"  "$DEST/db/" 2>/dev/null || true

# 1b. Alternate DB path (the other documented location)
scp -i "$KEY" "$VPS:C:/app/saas/prisma/prod.db"      "$DEST/db/" 2>/dev/null || true
scp -i "$KEY" "$VPS:C:/app/saas/prisma/prod.db-wal"  "$DEST/db/" 2>/dev/null || true
scp -i "$KEY" "$VPS:C:/app/saas/prisma/prod.db-shm"  "$DEST/db/" 2>/dev/null || true

# 1c. Newest existing gzip backup (already-consistent snapshot) — belt & suspenders
ssh -i "$KEY" "$VPS" "powershell -Command \"(Get-ChildItem C:\app\backups\prod-*.db.gz | Sort-Object LastWriteTime -Desc | Select-Object -First 1).FullName\"" | tr -d '\r' > /tmp/newest_bak.txt
scp -i "$KEY" "$VPS:$(cat /tmp/newest_bak.txt | sed 's#\\\\#/#g')" "$DEST/db/" 2>/dev/null || true

# 1d. OPTIONAL consistent logical dump (zero-write on VPS; needs sqlite3.exe on PATH)
ssh -i "$KEY" "$VPS" "sqlite3 C:/KEYONE/data/saas.db .dump" > "$DEST/db/saas.dump.sql" 2>/dev/null || \
ssh -i "$KEY" "$VPS" "sqlite3 C:/app/saas/prisma/prod.db .dump" > "$DEST/db/prod.dump.sql" 2>/dev/null || true
```

## P0 — Production environment files (secrets)
```bash
scp -i "$KEY" "$VPS:C:/app/saas/.env"               "$DEST/env/saas.env"
scp -i "$KEY" "$VPS:C:/app/whatsapp-service/.env"   "$DEST/env/whatsapp-service.env"
scp -i "$KEY" "$VPS:C:/app/.env"                    "$DEST/env/root.env" 2>/dev/null || true
chmod 600 "$DEST"/env/*.env
```

## P1 — WhatsApp sessions
```bash
scp -r -i "$KEY" "$VPS:C:/KEYONE/data/wa-sessions" "$DEST/wa-sessions/"
# (if SESSIONS_DIR differs, confirm from whatsapp-service/.env then re-run with the real path)
```

## P1 — All local backups
```bash
scp -r -i "$KEY" "$VPS:C:/app/backups" "$DEST/backups/"
```

## P2 — Caddy config + TLS certs
```bash
ssh -i "$KEY" "$VPS" "powershell -Command \"Get-Content C:\Caddy\Caddyfile\"" > "$DEST/configs/Caddyfile"
# certificate dir (location varies — find it, then copy)
ssh -i "$KEY" "$VPS" "powershell -Command \"Get-ChildItem -Recurse C:\Caddy\data, \$env:AppData\Caddy -Filter *.crt -ErrorAction SilentlyContinue | Select FullName\"" > "$DEST/configs/caddy-cert-paths.txt"
scp -r -i "$KEY" "$VPS:C:/Caddy/data" "$DEST/configs/caddy-data/" 2>/dev/null || true
```

## P2 — Windows service definitions + scheduled tasks (text exports, zero-write on VPS)
```bash
for s in mse-saas mse-wa mse-whatsapp mse-llm mse-fashion-llm mse-caddy caddy; do
  ssh -i "$KEY" "$VPS" "nssm dump $s" 2>/dev/null >> "$DEST/configs/nssm-services.txt" || true
done
ssh -i "$KEY" "$VPS" "schtasks /query /fo LIST /v" > "$DEST/configs/scheduled-tasks.txt"
ssh -i "$KEY" "$VPS" "powershell -Command \"Get-Service | Where-Object {\$_.Name -like 'mse*' -or \$_.Name -like 'caddy*'} | Format-List *\"" > "$DEST/configs/services.txt"
ssh -i "$KEY" "$VPS" "powershell -Command \"Get-ChildItem C:\Windows\System32\drivers\etc\hosts; Get-Content C:\Windows\System32\drivers\etc\hosts\"" > "$DEST/configs/hosts.txt" 2>/dev/null || true
```

## P2 — CloakBrowser ChatGPT profile + logs (optional)
```bash
# Profile path comes from the LLM .env (CHROME_PROFILE_DIR); common default below:
scp -r -i "$KEY" "$VPS:C:/KEYONE/data/cloak-profile" "$DEST/engine/cloak-profile/" 2>/dev/null || true
scp -r -i "$KEY" "$VPS:C:/app/logs"      "$DEST/logs/app-logs/"    2>/dev/null || true
scp -r -i "$KEY" "$VPS:C:/KEYONE/logs"   "$DEST/logs/keyone-logs/" 2>/dev/null || true
```

---

## Verify the extraction (Mac — before trusting it)
```bash
# DB integrity + sanity (whichever file landed)
for f in "$DEST"/db/saas.db "$DEST"/db/prod.db; do
  [ -f "$f" ] && { echo "== $f =="; sqlite3 "$f" "PRAGMA integrity_check;"; sqlite3 "$f" "SELECT COUNT(*) AS users FROM User;"; sqlite3 "$f" "SELECT COUNT(*) AS bots FROM Bot;"; }
done
# Restore a logical dump to verify it if you took one
[ -f "$DEST/db/saas.dump.sql" ] && sqlite3 "$DEST/db/_verify.db" < "$DEST/db/saas.dump.sql" && sqlite3 "$DEST/db/_verify.db" "PRAGMA integrity_check;"
# Env: AUTH_SECRET present + length (value NOT printed)
for e in "$DEST"/env/*.env; do echo "== $e =="; awk -F= '/^AUTH_SECRET=/{print "AUTH_SECRET length:", length($2)} /^SAAS_INTERNAL_SECRET=/{print "SAAS_INTERNAL_SECRET set"}' "$e"; done
# Sessions present
ls -1 "$DEST"/wa-sessions/wa-sessions/.wwebjs_auth/ 2>/dev/null | head
# Nothing 0-byte
find "$DEST" -type f -size 0 -print
du -sh "$DEST"/*
```

## Encrypt the secret-bearing parts + push off-site
```bash
# DB + env contain AUTH_SECRET and tenant data — never store unencrypted off-device.
tar czf "$DEST/keyone-critical.tar.gz" -C "$DEST" db env wa-sessions
age -r age1YOURPUBKEY -o "$DEST/keyone-critical.tar.gz.age" "$DEST/keyone-critical.tar.gz" && rm "$DEST/keyone-critical.tar.gz"
# Upload encrypted archive off-site (reuse deploy/offsite remote)
rclone copy "$DEST/keyone-critical.tar.gz.age" b2:keyone-backups/eol-extraction/
# Second physical copy to external SSD
cp -R "$DEST" /Volumes/<YOUR_SSD>/KEYONE_EOL_EXTRACTION
```

---

## Preserve the local-only Mac assets (not on GitHub)
```bash
# 1. Push the local-only UI branch
git -C ~/Desktop/appkeyone push origin claude/hopeful-kowalevski-90a1e7

# 2. Commit + push the DR package + offsite scripts + UI doc (from this worktree branch)
cd ~/Desktop/appkeyone/.claude/worktrees/crazy-cartwright-8afae8
git add project-knowledge/DISASTER_RECOVERY deploy/offsite && git commit -m "docs(dr): EOL extraction + offsite backup package"
git push origin claude/crazy-cartwright-8afae8
git -C ~/Desktop/appkeyone add project-knowledge/UIUX_POLISH_PASS_2026_06_10.md && git -C ~/Desktop/appkeyone commit -m "docs: UI polish pass" && git -C ~/Desktop/appkeyone push

# 3. Version-control the AI engine (closes the only non-Git code asset)
gh repo create <owner>/keyone-llm-proxy --private
cd ~/Desktop/mse_ai_api-main && git init && \
  printf '.venv/\n__pycache__/\nsaas/\n*.env\nchrome-profile/\nemail_link_bot/\n' > .gitignore && \
  mkdir -p vendor && cp -R ~/Desktop/CloakBrowser-main/cloakbrowser vendor/cloakbrowser && \
  git add main.py requirements.txt Dockerfile docker-compose.yml deploy vendor .gitignore && \
  git commit -m "import: CloakBrowser LLM proxy (prod 2026-06-12)" && \
  git branch -M main && git remote add origin git@github.com:<owner>/keyone-llm-proxy.git && git push -u origin main
```

➡️ After running + verifying these, go to [SERVER_DELETION_READINESS](SERVER_DELETION_READINESS.md).
