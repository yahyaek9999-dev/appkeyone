#!/usr/bin/env bash
set -euo pipefail
# Build a .deb for KEYONE Bridge (Debian/Ubuntu). Requires dpkg-deb.
# Usage: ./build-deb.sh <linux-binary> <version> [amd64|arm64]
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${1:?usage: build-deb.sh <binary> <version> [arch]}"
VERSION="${2:?version required}"
ARCH="${3:-amd64}"
OUT="keyone-bridge_${VERSION}_${ARCH}.deb"

command -v dpkg-deb >/dev/null || { echo "dpkg-deb required (apt-get install dpkg-dev)"; exit 1; }
[ -f "$BIN" ] || { echo "binary not found: $BIN"; exit 1; }

ROOT="$(mktemp -d)"
trap 'rm -rf "$ROOT"' EXIT
mkdir -p "$ROOT/DEBIAN" "$ROOT/usr/local/bin" "$ROOT/lib/systemd/system"

install -m 755 "$BIN" "$ROOT/usr/local/bin/keyone-bridge"
install -m 644 "$HERE/../systemd/keyone-bridge.service" "$ROOT/lib/systemd/system/keyone-bridge.service"

cat > "$ROOT/DEBIAN/control" <<EOF
Package: keyone-bridge
Version: ${VERSION}
Section: net
Priority: optional
Architecture: ${ARCH}
Maintainer: KEYONE <ops@keyone1.com>
Description: KEYONE Bridge transport connector
 Headless, transport-agnostic connector that links a self-hosted machine to the
 KEYONE Cloud. Runs as a systemd service. Configure with: keyone-bridge login.
EOF

cat > "$ROOT/DEBIAN/postinst" <<'EOF'
#!/bin/sh
set -e
if ! id keyone-bridge >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/keyone-bridge --shell /usr/sbin/nologin keyone-bridge
fi
install -d -o keyone-bridge -g keyone-bridge -m 700 /var/lib/keyone-bridge
systemctl daemon-reload || true
echo "KEYONE Bridge installed. Link it, then enable the service:"
echo "  sudo -u keyone-bridge KEYONE_BRIDGE_HOME=/var/lib/keyone-bridge KEYONE_BRIDGE_SECRET_FILE=1 keyone-bridge login"
echo "  sudo systemctl enable --now keyone-bridge"
EOF
chmod 755 "$ROOT/DEBIAN/postinst"

cat > "$ROOT/DEBIAN/prerm" <<'EOF'
#!/bin/sh
set -e
systemctl disable --now keyone-bridge 2>/dev/null || true
EOF
chmod 755 "$ROOT/DEBIAN/prerm"

dpkg-deb --build --root-owner-group "$ROOT" "$OUT"
echo "✓ built $OUT"
