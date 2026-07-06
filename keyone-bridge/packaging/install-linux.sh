#!/usr/bin/env bash
set -euo pipefail
# Install KEYONE Bridge as a systemd SYSTEM service (headless server / always-on).
# Usage: sudo ./install-linux.sh [path-to-keyone-bridge-binary]
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${1:-$HERE/keyone-bridge}"
PREFIX=/usr/local/bin
HOME_DIR=/var/lib/keyone-bridge
UNIT=/etc/systemd/system/keyone-bridge.service

[ "$(id -u)" = 0 ] || { echo "Run as root: sudo $0"; exit 1; }
[ -f "$BIN" ] || { echo "Binary not found: $BIN (build with 'make dist' or pass the path)"; exit 1; }

id keyone-bridge >/dev/null 2>&1 || \
  useradd --system --home-dir "$HOME_DIR" --shell /usr/sbin/nologin keyone-bridge
install -d -o keyone-bridge -g keyone-bridge -m 700 "$HOME_DIR"
install -m 755 "$BIN" "$PREFIX/keyone-bridge"
install -m 644 "$HERE/systemd/keyone-bridge.service" "$UNIT"
systemctl daemon-reload

echo "✓ Installed $PREFIX/keyone-bridge + $UNIT"
echo
echo "Next: link this Bridge to your workspace (device-code), then enable the service:"
echo "  sudo -u keyone-bridge KEYONE_BRIDGE_HOME=$HOME_DIR KEYONE_BRIDGE_SECRET_FILE=1 \\"
echo "       $PREFIX/keyone-bridge login"
echo "  sudo systemctl enable --now keyone-bridge"
echo "  sudo systemctl status keyone-bridge"
