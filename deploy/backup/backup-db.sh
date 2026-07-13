#!/bin/bash
# KEYONE production Postgres backup — nightly via keyone-dbbackup.timer.
#
# On-box only: this IAM user has no s3:CreateBucket/s3:PutObject permission,
# so there is currently no off-site copy — if this EC2 instance/disk is lost,
# these backups are lost with it. This protects against the far more common
# cases (bad migration, accidental DELETE, application bug), not instance
# loss. Grant the keyone IAM user s3 write access to a backup bucket to close
# that gap; no script change needed beyond adding an `aws s3 cp` line below.
set -euo pipefail

ENV_FILE="/home/ubuntu/keyone/.env"
BACKUP_DIR="/home/ubuntu/backups/postgres"
RETENTION_DAYS=14
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/keyone-$STAMP.dump"

mkdir -p "$BACKUP_DIR"

POSTGRES_URL="$(grep '^POSTGRES_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"')"
if [ -z "$POSTGRES_URL" ]; then
  echo "✗ POSTGRES_URL not found in $ENV_FILE" >&2
  exit 1
fi
# Prisma appends ?schema=public — a Prisma-only convention, not a libpq
# connection parameter. pg_dump's URI parser rejects unknown query params
# ("invalid URI query parameter"), so strip the query string before use.
POSTGRES_URL="${POSTGRES_URL%%\?*}"

echo "▶ pg_dump → $OUT"
pg_dump "$POSTGRES_URL" -Fc -f "$OUT"

echo "▶ verifying archive integrity (pg_restore --list, no actual restore)"
if ! pg_restore --list "$OUT" >/dev/null; then
  echo "✗ backup archive failed integrity check — removing bad file" >&2
  rm -f "$OUT"
  exit 1
fi

SIZE="$(du -h "$OUT" | cut -f1)"
echo "✓ backup ok: $OUT ($SIZE)"

echo "▶ pruning backups older than ${RETENTION_DAYS}d"
find "$BACKUP_DIR" -name 'keyone-*.dump' -mtime "+$RETENTION_DAYS" -print -delete
