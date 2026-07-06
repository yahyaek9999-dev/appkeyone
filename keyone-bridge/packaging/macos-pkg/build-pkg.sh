#!/usr/bin/env bash
set -euo pipefail
# Build a macOS installer .pkg. Uses pkgbuild (bundled with macOS).
# Usage: ./build-pkg.sh <darwin-binary> <version>
# Signing (before distribution): re-run with a Developer ID:
#   productsign --sign "Developer ID Installer: <Team>" unsigned.pkg signed.pkg
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${1:?usage: build-pkg.sh <binary> <version>}"
VERSION="${2:?version required}"
OUT="keyone-bridge-${VERSION}.pkg"

command -v pkgbuild >/dev/null || { echo "pkgbuild required (macOS)"; exit 1; }
[ -f "$BIN" ] || { echo "binary not found: $BIN"; exit 1; }

PAYLOAD="$(mktemp -d)"
SCRIPTS="$(mktemp -d)"
trap 'rm -rf "$PAYLOAD" "$SCRIPTS"' EXIT

mkdir -p "$PAYLOAD/usr/local/bin" "$PAYLOAD/Library/LaunchAgents"
install -m 755 "$BIN" "$PAYLOAD/usr/local/bin/keyone-bridge"
install -m 644 "$HERE/../launchd/com.keyone.bridge.plist" "$PAYLOAD/Library/LaunchAgents/com.keyone.bridge.plist"
install -m 755 "$HERE/postinstall" "$SCRIPTS/postinstall"

pkgbuild \
  --root "$PAYLOAD" \
  --scripts "$SCRIPTS" \
  --identifier com.keyone.bridge \
  --version "$VERSION" \
  --install-location / \
  "$OUT"
echo "✓ built $OUT (UNSIGNED — productsign before distribution)"
