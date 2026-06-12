#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# KEYONE — Restore from an off-site encrypted backup (Linux)
#
# Pulls an archive from the remote, decrypts with your PRIVATE age key, and
# extracts into a STAGING directory. It DOES NOT overwrite live data unless you
# pass --apply (and even then it backs up the current files first).
#
# Requires: rclone, age, sqlite3, and your PRIVATE key (age identity file) which
# lives in your vault — NOT on the server normally.
#
# Usage:
#   # 1) list what's available
#   RCLONE_REMOTE=b2:keyone-backups ./restore-offsite.sh --list daily
#
#   # 2) fetch + decrypt + verify into ./restore (no live changes)
#   AGE_IDENTITY=~/keyone-backup.key RCLONE_REMOTE=b2:keyone-backups \
#     ./restore-offsite.sh --fetch keyone-daily-20260612-033000.tar.gz.age
#
#   # 3) apply (stops services, backs up current, swaps in restored files)
#   ./restore-offsite.sh --apply ./restore/keyone-daily-20260612-033000
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail
: "${RCLONE_REMOTE:?Set RCLONE_REMOTE}"
: "${RESTORE_DIR:=./restore}"
: "${KEYONE_DB_PATH:=/var/keyone/data/saas.db}"
: "${KEYONE_WA_SESSIONS_DIR:=/var/keyone/data/wa-sessions}"
log(){ echo "[restore] $*"; }

case "${1:-}" in
  --list)
    TIER="${2:-daily}"
    rclone lsl "${RCLONE_REMOTE}/${TIER}/" | sort
    ;;

  --fetch)
    ARCHIVE="${2:?archive name}"
    : "${AGE_IDENTITY:?Set AGE_IDENTITY to your private age key file}"
    mkdir -p "$RESTORE_DIR"
    # find it across tiers
    SRC=""
    for t in daily weekly monthly; do
      if rclone lsf "${RCLONE_REMOTE}/${t}/" 2>/dev/null | grep -qx "$ARCHIVE"; then SRC="${RCLONE_REMOTE}/${t}/${ARCHIVE}"; break; fi
    done
    [ -n "$SRC" ] || { log "not found: $ARCHIVE"; exit 1; }
    log "Downloading $SRC"
    rclone copy "$SRC" "$RESTORE_DIR/" --no-traverse
    log "Decrypting"
    age -d -i "$AGE_IDENTITY" -o "$RESTORE_DIR/${ARCHIVE%.age}" "$RESTORE_DIR/${ARCHIVE}"
    OUT="$RESTORE_DIR/${ARCHIVE%.tar.gz.age}"; mkdir -p "$OUT"
    tar xzf "$RESTORE_DIR/${ARCHIVE%.age}" -C "$OUT"
    log "Extracted → $OUT"
    log "Verifying DB integrity"
    [ -f "$OUT/saas.db" ] && sqlite3 "$OUT/saas.db" "PRAGMA integrity_check;" | head -1
    log "Manifest:"; cat "$OUT/manifest.txt" | head -8
    log "Review files in $OUT, then run: $0 --apply $OUT"
    ;;

  --apply)
    SRC="${2:?extracted dir}"
    TS="$(date -u +%Y%m%d-%H%M%S)"
    log "Stopping services (edit for your process manager)…"
    (systemctl stop keyone-saas keyone-wa 2>/dev/null || pm2 stop mse-saas mse-wa 2>/dev/null || true)
    # back up current before overwriting
    [ -f "$KEYONE_DB_PATH" ] && cp "$KEYONE_DB_PATH" "${KEYONE_DB_PATH}.pre-restore-${TS}"
    if [ -f "$SRC/saas.db" ]; then log "Restoring DB"; cp "$SRC/saas.db" "$KEYONE_DB_PATH"; fi
    if [ -f "$SRC/wa-sessions.tar.gz" ]; then
      log "Restoring WA sessions"
      mkdir -p "$(dirname "$KEYONE_WA_SESSIONS_DIR")"
      tar xzf "$SRC/wa-sessions.tar.gz" -C "$(dirname "$KEYONE_WA_SESSIONS_DIR")"
    fi
    log "Env files are in $SRC/env/ — review and place manually (they contain secrets)."
    log "Starting services…"
    (systemctl start keyone-saas keyone-wa 2>/dev/null || pm2 start mse-saas mse-wa 2>/dev/null || true)
    log "✅ Applied. Verify: curl -sf localhost:3000/api/health"
    ;;

  *)
    echo "usage: $0 --list [tier] | --fetch <archive.tar.gz.age> | --apply <extracted-dir>"; exit 1 ;;
esac
