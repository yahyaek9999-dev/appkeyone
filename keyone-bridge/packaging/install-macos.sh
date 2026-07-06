#!/usr/bin/env bash
set -euo pipefail
# Install KEYONE Bridge as a macOS LaunchAgent (per-user; uses the login Keychain).
# Usage: ./install-macos.sh [path-to-keyone-bridge-binary]
HERE="$(cd "$(dirname "$0")" && pwd)"
BIN="${1:-$HERE/keyone-bridge}"
[ -f "$BIN" ] || { echo "Binary not found: $BIN"; exit 1; }

echo "Installing binary → /usr/local/bin/keyone-bridge (sudo)…"
sudo install -m 755 "$BIN" /usr/local/bin/keyone-bridge

AGENTS="$HOME/Library/LaunchAgents"
mkdir -p "$AGENTS"
cp "$HERE/launchd/com.keyone.bridge.plist" "$AGENTS/com.keyone.bridge.plist"

echo "✓ Installed. Now link + load:"
echo "  keyone-bridge login"
echo "  launchctl load -w $AGENTS/com.keyone.bridge.plist"
echo "  keyone-bridge status"
