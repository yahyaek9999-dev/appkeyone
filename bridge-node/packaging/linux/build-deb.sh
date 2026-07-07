#!/usr/bin/env bash
set -euo pipefail
# Build a .deb that installs the self-contained bundle to /opt/keyone-wa-bridge,
# a systemd service, and detects Chrome/Chromium at install time.
#   build-deb.sh <linux-x64|linux-arm64> <version>
ARCH="${1:?arch}"; VERSION="${2:?version}"
HERE="$(cd "$(dirname "$0")" && pwd)"          # packaging/linux
BUNDLE="$HERE/../dist/$ARCH"
[ -d "$BUNDLE/app" ] || { echo "bundle missing — run build-bundle.sh $ARCH first"; exit 1; }
case "$ARCH" in linux-x64) DEBARCH=amd64;; linux-arm64) DEBARCH=arm64;; *) echo "bad arch"; exit 1;; esac
STAGE="$(mktemp -d)"; ROOT="$STAGE/pkg"
mkdir -p "$ROOT/opt/keyone-wa-bridge" "$ROOT/lib/systemd/system" "$ROOT/DEBIAN"

cp -R "$BUNDLE/." "$ROOT/opt/keyone-wa-bridge/"

cat > "$ROOT/DEBIAN/control" <<CTRL
Package: keyone-wa-bridge
Version: $VERSION
Section: net
Priority: optional
Architecture: $DEBARCH
Maintainer: KEYONE <support@keyone1.com>
Depends: ca-certificates, fonts-liberation, libnss3, libnspr4, libdrm2, libgbm1, libxkbcommon0, libxcomposite1, libxdamage1, libxfixes3, libxrandr2, libpango-1.0-0, libcairo2, libatk1.0-0 | libatk1.0-0t64, libatk-bridge2.0-0 | libatk-bridge2.0-0t64, libcups2 | libcups2t64, libasound2 | libasound2t64, libatspi2.0-0 | libatspi2.0-0t64, libgtk-3-0 | libgtk-3-0t64
Description: KEYONE WhatsApp Bridge — whatsapp-web.js transport (real WhatsApp Web).
 Self-contained (bundled Node). Downloads its own matched Chromium on first run;
 runs headless as a systemd service (as the installing user). The Depends above
 are the shared libraries that Chromium needs. Link with: keyone-bridge login
CTRL

# postinst writes the systemd unit at install time so the service runs as the
# HUMAN who installed it — the same account that runs `keyone-bridge login`, so
# both share ~/.keyone-wa-bridge (no separate service-user home mismatch).
cat > "$ROOT/DEBIAN/postinst" <<'POST'
#!/bin/sh
set -e
TARGET_USER="${SUDO_USER:-root}"
TARGET_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"; [ -n "$TARGET_HOME" ] || TARGET_HOME=/root
BRIDGE_HOME="$TARGET_HOME/.keyone-wa-bridge"
mkdir -p "$BRIDGE_HOME"; chown "$TARGET_USER" "$BRIDGE_HOME" 2>/dev/null || true
# The Bridge downloads its OWN matched Chromium into $BRIDGE_HOME/chromium on
# first run (the build WhatsApp Web pairing needs) — we deliberately do NOT point
# it at a system Chrome, which is a mismatched build that breaks pairing.
printf 'KEYONE_BRIDGE_HOME=%s\n' "$BRIDGE_HOME" > /etc/keyone-wa-bridge.env
cat > /lib/systemd/system/keyone-wa-bridge.service <<UNIT
[Unit]
Description=KEYONE WhatsApp Bridge (whatsapp-web.js)
After=network-online.target
Wants=network-online.target
[Service]
Type=simple
User=$TARGET_USER
EnvironmentFile=/etc/keyone-wa-bridge.env
ExecStart=/opt/keyone-wa-bridge/run start
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
# CLI on PATH — BOTH documented names. /usr/local/bin is on the default PATH.
ln -sf /opt/keyone-wa-bridge/run /usr/local/bin/keyone-bridge
ln -sf /opt/keyone-wa-bridge/run /usr/local/bin/keyone-wa-bridge
echo "KEYONE WA Bridge installed for user $TARGET_USER. It downloads its WhatsApp engine on first run."
echo "  Link it now:  keyone-bridge login"
systemctl daemon-reload || true
systemctl enable keyone-wa-bridge.service >/dev/null 2>&1 || true
if systemctl start keyone-wa-bridge.service >/dev/null 2>&1; then
  echo "  service started."
else
  echo "  WARNING: service did not start now (it is enabled and will start on boot)."
  echo "  Start it now:  sudo systemctl start keyone-wa-bridge.service"
fi
exit 0
POST

cat > "$ROOT/DEBIAN/prerm" <<'PRE'
#!/bin/sh
set -e
systemctl stop keyone-wa-bridge.service >/dev/null 2>&1 || true
systemctl disable keyone-wa-bridge.service >/dev/null 2>&1 || true
rm -f /usr/local/bin/keyone-bridge /usr/local/bin/keyone-wa-bridge /lib/systemd/system/keyone-wa-bridge.service /etc/keyone-wa-bridge.env
systemctl daemon-reload >/dev/null 2>&1 || true
exit 0
PRE
chmod 0755 "$ROOT/DEBIAN/postinst" "$ROOT/DEBIAN/prerm"

OUT="$HERE/../dist/keyone-wa-bridge_${VERSION}_${DEBARCH}.deb"
dpkg-deb --build --root-owner-group "$ROOT" "$OUT" >/dev/null
rm -rf "$STAGE"
echo "✓ $OUT ($(du -h "$OUT" | awk '{print $1}'))"
