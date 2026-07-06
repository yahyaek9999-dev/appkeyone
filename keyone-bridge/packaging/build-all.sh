#!/usr/bin/env bash
set -euo pipefail
# Build cross-platform binaries, then every native installer whose tooling is
# available on this host. Missing toolchains are skipped (not an error) so this
# runs anywhere and CI can assemble the rest.
HERE="$(cd "$(dirname "$0")" && pwd)"
MOD="$(cd "$HERE/.." && pwd)"
VERSION="${VERSION:-$(cd "$MOD" && git describe --tags --always --dirty 2>/dev/null || echo 0.4.0-dev)}"
DIST="$MOD/dist"

echo "▶ make dist (VERSION=$VERSION)"
make -C "$MOD" dist VERSION="$VERSION"

pkg() { echo "  → $*"; "$@" || echo "    (skipped/failed: $*)"; }

echo "▶ native packages (present tooling only)"
if command -v dpkg-deb >/dev/null; then
  pkg bash "$HERE/deb/build-deb.sh" "$DIST/keyone-bridge_linux_amd64" "$VERSION" amd64
  pkg bash "$HERE/deb/build-deb.sh" "$DIST/keyone-bridge_linux_arm64" "$VERSION" arm64
else echo "  · skip .deb (no dpkg-deb)"; fi

if command -v appimagetool >/dev/null; then
  pkg bash "$HERE/appimage/build-appimage.sh" "$DIST/keyone-bridge_linux_amd64" "$VERSION" x86_64
else echo "  · skip AppImage (no appimagetool)"; fi

if command -v pkgbuild >/dev/null; then
  pkg bash "$HERE/macos-pkg/build-pkg.sh" "$DIST/keyone-bridge_darwin_arm64" "$VERSION"
else echo "  · skip .pkg (no pkgbuild)"; fi

echo "  · .msi builds on Windows via windows-msi/build.ps1 (WiX)"
echo "✓ done. Artifacts in $DIST + package files in $HERE"
