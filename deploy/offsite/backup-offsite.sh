#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KEYONE — Off-site encrypted backup (Linux / Ubuntu target)
#
# Bundles → encrypts → uploads off the server:
#   • SQLite database (online .backup snapshot)
#   • WhatsApp session auth (SESSIONS_DIR)
#   • Uploads dir (if one ever exists; KEYONE currently stores none)
#   • Environment files (saas/.env, whatsapp-service/.env, root .env)
#   • A manifest (git SHA, timestamps, checksums)
#
# Encryption: age (https://github.com/FiloSottile/age) — recipient PUBLIC key only
#             lives on the server; the PRIVATE key stays OFF-server in your vault.
# Transport : rclone (any remote: Backblaze B2, Cloudflare R2, S3, GDrive…).
#
# This script DOES NOT modify production. It only reads + copies. Safe to cron.
#
# Setup (one-time):
#   1. apt install -y age rclone sqlite3
#   2. rclone config            # create a remote, e.g. "b2:keyone-backups"
#   3. Generate a keypair OFF the server:  age-keygen -o keyone-backup.key
#      Keep keyone-backup.key in your password manager. Put ONLY the public
#      line (age1…) on the server as AGE_RECIPIENT below.
#
# Usage:
#   AGE_RECIPIENT=age1xxxx RCLONE_REMOTE=b2:keyone-backups ./backup-offsite.sh
#   ./backup-offsite.sh --tier weekly        # tag the archive tier (daily|weekly|monthly)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Config (override via env) ────────────────────────────────────────────────
: "${KEYONE_DB_PATH:=/var/keyone/data/saas.db}"
: "${KEYONE_WA_SESSIONS_DIR:=/var/keyone/data/wa-sessions}"
: "${KEYONE_UPLOADS_DIR:=/var/keyone/data/uploads}"          # optional; skipped if absent
: "${KEYONE_ENV_FILES:=/home/keyone/app/saas/.env:/home/keyone/app/whatsapp-service/.env}"
: "${AGE_RECIPIENT:?Set AGE_RECIPIENT to your age public key (age1…)}"
: "${RCLONE_REMOTE:?Set RCLONE_REMOTE, e.g. b2:keyone-backups}"
: "${STAGING_DIR:=/var/keyone/backups}"
: "${RETAIN_DAILY:=30}"      # days
: "${RETAIN_WEEKLY:=56}"     # days (8 weeks)
: "${RETAIN_MONTHLY:=365}"   # days (12 months)

TIER="daily"
[ "${1:-}" = "--tier" ] && TIER="${2:?}"

STAMP="$(date -u '+%Y%m%d-%H%M%S')"
NAME="keyone-${TIER}-${STAMP}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log() { echo "[$(date -u '+%H:%M:%S')] $*"; }

# ── 1. Database (online snapshot — never copy a live .db directly) ────────────
if [ -f "$KEYONE_DB_PATH" ]; then
  log "DB snapshot → ${KEYONE_DB_PATH}"
  sqlite3 "$KEYONE_DB_PATH" ".backup '${WORK}/saas.db'"
  sqlite3 "${WORK}/saas.db" "PRAGMA integrity_check;" | head -1
else
  log "WARN: DB not found at ${KEYONE_DB_PATH} — skipping"
fi

# ── 2. WhatsApp sessions ─────────────────────────────────────────────────────
if [ -d "$KEYONE_WA_SESSIONS_DIR" ]; then
  log "WA sessions → ${KEYONE_WA_SESSIONS_DIR}"
  tar czf "${WORK}/wa-sessions.tar.gz" -C "$(dirname "$KEYONE_WA_SESSIONS_DIR")" "$(basename "$KEYONE_WA_SESSIONS_DIR")"
else
  log "WA sessions dir absent — skipping (tenants would re-scan QR)"
fi

# ── 3. Uploads (KEYONE currently stores none; future-proof) ──────────────────
if [ -d "$KEYONE_UPLOADS_DIR" ] && [ -n "$(ls -A "$KEYONE_UPLOADS_DIR" 2>/dev/null)" ]; then
  log "Uploads → ${KEYONE_UPLOADS_DIR}"
  tar czf "${WORK}/uploads.tar.gz" -C "$(dirname "$KEYONE_UPLOADS_DIR")" "$(basename "$KEYONE_UPLOADS_DIR")"
else
  log "No uploads on disk — skipping (expected for KEYONE)"
fi

# ── 4. Environment files (contain AUTH_SECRET — that's why we encrypt) ────────
mkdir -p "${WORK}/env"
IFS=':' read -ra EFILES <<< "$KEYONE_ENV_FILES"
for f in "${EFILES[@]}"; do
  if [ -f "$f" ]; then
    dest="${WORK}/env/$(echo "$f" | tr '/' '_')"
    cp "$f" "$dest"
    log "env → $f"
  fi
done

# ── 5. Manifest ──────────────────────────────────────────────────────────────
{
  echo "name=${NAME}"
  echo "tier=${TIER}"
  echo "utc=${STAMP}"
  echo "host=$(hostname)"
  echo "git_sha=$(git -C "$(dirname "${EFILES[0]}")/.." rev-parse --short HEAD 2>/dev/null || echo unknown)"
  echo "--- sha256 ---"
  (cd "$WORK" && find . -type f -not -name manifest.txt -exec sha256sum {} \;)
} > "${WORK}/manifest.txt"

# ── 6. Bundle + encrypt ──────────────────────────────────────────────────────
log "Bundling…"
tar czf "${STAGING_DIR}/${NAME}.tar.gz" -C "$WORK" .
mkdir -p "$STAGING_DIR"
log "Encrypting with age (recipient ${AGE_RECIPIENT:0:12}…)"
age -r "$AGE_RECIPIENT" -o "${STAGING_DIR}/${NAME}.tar.gz.age" "${STAGING_DIR}/${NAME}.tar.gz"
rm -f "${STAGING_DIR}/${NAME}.tar.gz"   # never keep the plaintext bundle

# ── 7. Upload off-site ───────────────────────────────────────────────────────
log "Uploading → ${RCLONE_REMOTE}/${TIER}/"
rclone copy "${STAGING_DIR}/${NAME}.tar.gz.age" "${RCLONE_REMOTE}/${TIER}/" --no-traverse
log "Verifying remote copy…"
rclone check "${STAGING_DIR}/${NAME}.tar.gz.age" "${RCLONE_REMOTE}/${TIER}/" --one-way || {
  log "ERROR: remote verification failed"; exit 1; }

# ── 8. Retention (remote) ────────────────────────────────────────────────────
case "$TIER" in
  daily)   AGE_DAYS=$RETAIN_DAILY ;;
  weekly)  AGE_DAYS=$RETAIN_WEEKLY ;;
  monthly) AGE_DAYS=$RETAIN_MONTHLY ;;
  *)       AGE_DAYS=$RETAIN_DAILY ;;
esac
log "Pruning ${RCLONE_REMOTE}/${TIER}/ older than ${AGE_DAYS}d"
rclone delete "${RCLONE_REMOTE}/${TIER}/" --min-age "${AGE_DAYS}d" || true

# Keep the local encrypted copy only briefly (local staging retention = 3 files)
ls -1t "${STAGING_DIR}"/keyone-${TIER}-*.tar.gz.age 2>/dev/null | tail -n +4 | xargs -r rm -f

log "✅ Off-site backup complete: ${NAME}.tar.gz.age"
