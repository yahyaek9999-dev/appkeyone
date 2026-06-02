#!/usr/bin/env bash
# Generates prisma/schema.postgres.prisma from prisma/schema.prisma
# by switching the provider to postgresql and updating the datasource URL.
# Run this after significant schema changes.
#
# Usage: bash scripts/generate-pg-schema.sh
set -euo pipefail
cd "$(dirname "$0")/.."
INPUT="prisma/schema.prisma"
OUTPUT="prisma/schema.postgres.prisma"
echo "Generating $OUTPUT from $INPUT..."
sed 's/provider = "sqlite"/provider = "postgresql"/' "$INPUT" \
  | sed 's|url *= *env("DATABASE_URL")|url       = env("POSTGRES_URL")\n  directUrl = env("POSTGRES_DIRECT_URL")|' \
  > "$OUTPUT"
echo "Done. $(wc -l < "$OUTPUT") lines written."
