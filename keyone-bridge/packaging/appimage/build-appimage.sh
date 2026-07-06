#!/usr/bin/env bash
set -euo pipefail
# Build a portable Linux AppImage. Requires appimagetool on PATH (from the AppImageKit project)
#.
# Usage: ./build-appimage.sh <linux-binary> <version> [x86_64|aarch64]
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${1:?usage: build-appimage.sh <binary> <version> [arch]}"
VERSION="${2:?version required}"
ARCH="${3:-x86_64}"

command -v appimagetool >/dev/null || { echo "appimagetool required on PATH"; exit 1; }
[ -f "$BIN" ] || { echo "binary not found: $BIN"; exit 1; }

APPDIR="$(mktemp -d)/KeyoneBridge.AppDir"
mkdir -p "$APPDIR/usr/bin"
install -m 755 "$BIN" "$APPDIR/usr/bin/keyone-bridge"
install -m 755 "$HERE/AppRun" "$APPDIR/AppRun"
install -m 644 "$HERE/keyone-bridge.desktop" "$APPDIR/keyone-bridge.desktop"
# Minimal 1x1 PNG icon placeholder (replace with a real brand icon before GA).
printf '\x89PNG\r\n\x1a\n' > "$APPDIR/keyone-bridge.png"

ARCH="$ARCH" appimagetool "$APPDIR" "keyone-bridge-${VERSION}-${ARCH}.AppImage"
echo "✓ built keyone-bridge-${VERSION}-${ARCH}.AppImage"
