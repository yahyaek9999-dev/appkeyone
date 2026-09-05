#!/bin/bash
# KEYONE production Postgres backup — nightly via keyone-dbbackup.timer.
#
# On-box only: there is currently NO off-site copy. Verified on the live host
# (16.171.230.84, account 873775216781): no ~/.aws credentials and no awscli
# installed, so an S3 grant alone would not be enough — a principal and the CLI
# have to exist on the box first. This protects against the common cases (bad
# migration, accidental DELETE, application bug) but NOT instance/disk loss.
# To close that gap later: install awscli, attach a role/credential, then add
# an `aws s3 cp "$OUT" s3://<bucket>/` line after the integrity check below.
set -euo pipefail

# Dumps contain every tenant row. The host default umask is 0002, which would
# leave the directory 775 and the dump 664 (world-readable). Force 077 so the
# backup dir is 700 and each dump 600, owned by ubuntu only.
umask 077

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
