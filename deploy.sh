#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# KEYONE Deploy — Build once, deploy artifact, restart only.
#
# Builds Next.js + Prisma locally, packages the compiled output, uploads the
# artifact to the VPS, extracts, runs Prisma migration, and restarts the
# service. No npm ci or next build on the VPS.
#
# Target: deployment under 60 seconds.
#
# Usage:
#   ./deploy.sh                        # build + deploy
#   ./deploy.sh --skip-build           # use existing build artifact
#   ./deploy.sh --release my-build.tar.gz
#   ./deploy.sh --rollback
# ─────────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "${1:-}" in
  --rollback|-r)
    bash "$SCRIPT_DIR/deploy/rollback-release.sh"
    ;;
  --skip-build|-s)
    bash "$SCRIPT_DIR/deploy/release.sh" --skip-build
    ;;
  --release)
    bash "$SCRIPT_DIR/deploy/release.sh" "${2:-release.tar.gz}"
    ;;
  *)
    bash "$SCRIPT_DIR/deploy/release.sh" "${1:-release.tar.gz}"
    ;;
esac
