#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KEYONE VPS — Docker Setup Script (Linux VPS)
#
# Run once on a fresh Ubuntu 22.04 / Debian 12 VPS to set up:
#   - Docker CE + Docker Compose v2
#   - Host directory structure for persistent volumes
#   - GHCR authentication (for Watchtower to pull private images)
#   - docker-compose.production.yml deployment
#
# Usage:
#   scp deploy/vps-docker-setup.sh root@<VPS_IP>:/tmp/
#   ssh root@<VPS_IP> "bash /tmp/vps-docker-setup.sh"
#
# Variables to customize before running:
#   GHCR_OWNER      — Your GitHub username or org
#   GHCR_TOKEN      — GitHub PAT with read:packages scope
#   ENV_FILE_PATH   — Local path to .env.saas to upload
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

GHCR_OWNER="${GHCR_OWNER:-your-github-username}"
KEYONE_DIR="/keyone"
DATA_DIR="$KEYONE_DIR/data"
LOGS_DIR="$KEYONE_DIR/logs/saas"
ENV_FILE="$KEYONE_DIR/.env.saas"

echo "════════════════════════════════════════"
echo "  KEYONE Docker VPS Setup"
echo "════════════════════════════════════════"

# ── 1. Install Docker CE ──────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    echo "[+] Installing Docker CE..."
    apt-get update -qq
    apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg lsb-release

    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
        | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
        > /etc/apt/sources.list.d/docker.list

    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
    echo "[+] Docker installed: $(docker --version)"
else
    echo "[✓] Docker already installed: $(docker --version)"
fi

# ── 2. Create host directory structure ───────────────────────────────────────
echo "[+] Creating /keyone directory layout..."
mkdir -p "$DATA_DIR"
mkdir -p "$LOGS_DIR"
mkdir -p "$KEYONE_DIR/backups"

# ── 3. Migrate existing SQLite database (if coming from Windows deploy) ───────
echo ""
echo "────────────────────────────────────────"
echo "  DATABASE MIGRATION CHECK"
echo "  If migrating from Windows VPS, you must manually upload prod.db:"
echo "    scp Administrator@217.154.163.16:'C:/KEYONE/data/saas.db' root@<NEW_VPS>:$DATA_DIR/saas.db"
echo "  DO NOT proceed until the database is in place."
echo "────────────────────────────────────────"
echo ""

if [ -f "$DATA_DIR/saas.db" ]; then
    echo "[✓] Database found at $DATA_DIR/saas.db ($(du -h "$DATA_DIR/saas.db" | cut -f1))"
else
    echo "[!] WARNING: No database found at $DATA_DIR/saas.db"
    echo "    Container will start but will have no data until database is placed here."
fi

# ── 4. Environment file check ─────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
    echo "[!] No .env.saas found at $ENV_FILE"
    echo "    Create it now with your production values:"
    echo "    nano $ENV_FILE"
    cat <<'ENVTEMPLATE'

Required variables in /keyone/.env.saas:
  NEXT_PUBLIC_SITE_URL=https://app.keyone1.com
  DATABASE_URL=file:/data/saas.db
  AUTH_SECRET=<64-char-hex>
  LLM_API_URL=http://host-gateway:7788
  LLM_API_KEY=<secret>
  WHATSAPP_SERVICE_URL=http://host-gateway:7799
  WHATSAPP_SHARED_SECRET=<secret>
  NODE_ENV=production
  PORT=3000

ENVTEMPLATE
else
    echo "[✓] Environment file found at $ENV_FILE"
fi

# ── 5. GHCR authentication (Watchtower needs this to pull private images) ─────
echo "[+] Setting up GHCR authentication..."
echo ""
echo "  You need a GitHub Personal Access Token with 'read:packages' scope."
echo "  Create one at: https://github.com/settings/tokens/new?scopes=read:packages"
echo ""
if [ -z "${GHCR_TOKEN:-}" ]; then
    read -rsp "  Enter GHCR_TOKEN (PAT with read:packages): " GHCR_TOKEN
    echo ""
fi

echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_OWNER" --password-stdin
echo "[✓] GHCR authentication saved to ~/.docker/config.json"

# ── 6. Initial image pull ─────────────────────────────────────────────────────
echo "[+] Pulling initial image from GHCR..."
docker pull "ghcr.io/$GHCR_OWNER/keyone-saas:main" || {
    echo "[!] Could not pull image. Ensure:"
    echo "    1. GitHub Actions has run and pushed :main"
    echo "    2. GHCR_OWNER is correct: $GHCR_OWNER"
    echo "    3. Token has read:packages scope"
    exit 1
}

# ── 7. Deploy docker-compose.production.yml ───────────────────────────────────
COMPOSE_FILE="$KEYONE_DIR/docker-compose.production.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "[!] docker-compose.production.yml not found at $COMPOSE_FILE"
    echo "    Upload it with:"
    echo "    scp docker-compose.production.yml root@<VPS_IP>:$COMPOSE_FILE"
    exit 1
fi

# Set GHCR_OWNER in compose env
export GHCR_OWNER="$GHCR_OWNER"

echo "[+] Starting services..."
docker compose -f "$COMPOSE_FILE" up -d

# ── 8. Health verification ────────────────────────────────────────────────────
echo "[+] Waiting 60s for container to start..."
sleep 60

HEALTH=$(curl -sf --max-time 10 http://localhost:3000/api/health 2>/dev/null || echo '{"status":"unreachable"}')
echo "Health response: $HEALTH"

if echo "$HEALTH" | grep -q '"status":"ok"'; then
    echo ""
    echo "════════════════════════════════════════"
    echo "  ✓ KEYONE is running in Docker!"
    echo "  Health: OK"
    echo "  Update Caddy to proxy port 3000"
    echo "════════════════════════════════════════"
else
    echo "[!] Health check failed. Check logs:"
    echo "    docker logs keyone-saas --tail 50"
fi

# ── 9. Configure Caddy reverse proxy ──────────────────────────────────────────
echo ""
echo "────────────────────────────────────────"
echo "  CADDY UPDATE REQUIRED"
echo "  Replace your Caddyfile reverse_proxy target:"
echo "    Old: localhost:3000 (or direct process)"
echo "    New: localhost:3000 (same port — no change needed if already proxying :3000)"
echo "────────────────────────────────────────"

echo ""
echo "[+] Setup complete. Useful commands:"
echo "    docker logs keyone-saas -f              # follow app logs"
echo "    docker compose -f $COMPOSE_FILE ps       # status"
echo "    docker compose -f $COMPOSE_FILE pull    # manual update"
echo "    docker compose -f $COMPOSE_FILE down    # stop all"
