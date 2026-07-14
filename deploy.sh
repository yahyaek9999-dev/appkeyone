#!/usr/bin/env bash
set -euo pipefail

# RETIRED — this script deploys to the old Windows VPS (Administrator@217.154.163.16),
# which is no longer production. Production is AWS Linux; deploy with
# deploy/release-aws.sh instead. See project-knowledge/DEPLOYMENT_RULES.md.
if [ -z "${I_KNOW_THIS_TARGETS_THE_RETIRED_WINDOWS_VPS:-}" ]; then
  echo "🛑 deploy.sh targets the RETIRED Windows VPS — production is now AWS." >&2
  echo "   Use deploy/release-aws.sh instead. See project-knowledge/DEPLOYMENT_RULES.md." >&2
  exit 1
fi

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
