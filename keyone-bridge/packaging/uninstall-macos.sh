#!/usr/bin/env bash
set -euo pipefail
# Uninstall the KEYONE Bridge LaunchAgent. Usage: ./uninstall-macos.sh
AGENT="$HOME/Library/LaunchAgents/com.keyone.bridge.plist"
launchctl unload -w "$AGENT" 2>/dev/null || true
rm -f "$AGENT"
sudo rm -f /usr/local/bin/keyone-bridge
echo "✓ Uninstalled. Local data kept in ~/Library/Application Support/keyone-bridge."
echo "  Run 'keyone-bridge logout' before uninstalling to wipe the session, if desired."
