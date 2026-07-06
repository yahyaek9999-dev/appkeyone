#!/usr/bin/env bash
set -euo pipefail
# Uninstall the KEYONE Bridge systemd system service. Keeps the data dir unless
# --purge is given. Usage: sudo ./uninstall-linux.sh [--purge]
[ "$(id -u)" = 0 ] || { echo "Run as root: sudo $0"; exit 1; }
systemctl disable --now keyone-bridge 2>/dev/null || true
rm -f /etc/systemd/system/keyone-bridge.service
systemctl daemon-reload
rm -f /usr/local/bin/keyone-bridge
if [ "${1:-}" = "--purge" ]; then
  rm -rf /var/lib/keyone-bridge
  userdel keyone-bridge 2>/dev/null || true
  echo "✓ Uninstalled + purged data + user."
else
  echo "✓ Uninstalled. Data kept in /var/lib/keyone-bridge (use --purge to remove)."
fi
