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

cat > "$ROOT/lib/systemd/system/keyone-wa-bridge.service" <<UNIT
[Unit]
Description=KEYONE WhatsApp Bridge (whatsapp-web.js)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=keyone-bridge
Environment=KEYONE_BRIDGE_HOME=/var/lib/keyone-wa-bridge
EnvironmentFile=-/etc/keyone-wa-bridge.env
ExecStart=/opt/keyone-wa-bridge/run start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

cat > "$ROOT/DEBIAN/control" <<CTRL
Package: keyone-wa-bridge
Version: $VERSION
Section: net
Priority: optional
Architecture: $DEBARCH
Maintainer: KEYONE <support@keyone1.com>
Depends: ca-certificates, fonts-liberation
Recommends: chromium | chromium-browser | google-chrome-stable
Description: KEYONE WhatsApp Bridge — whatsapp-web.js transport (real WhatsApp Web).
 Self-contained (bundled Node). Detects system Chrome/Chromium; runs headless as
 a systemd service. Link with: keyone-wa-bridge login
CTRL

cat > "$ROOT/DEBIAN/postinst" <<'POST'
#!/bin/sh
set -e
id keyone-bridge >/dev/null 2>&1 || useradd --system --home /var/lib/keyone-wa-bridge --shell /usr/sbin/nologin keyone-bridge
mkdir -p /var/lib/keyone-wa-bridge && chown -R keyone-bridge:keyone-bridge /var/lib/keyone-wa-bridge
ln -sf /opt/keyone-wa-bridge/run /usr/local/bin/keyone-wa-bridge
# Detect Chrome/Chromium; record it for the service (empty → puppeteer downloads on first run).
CHROME=""
for c in /usr/bin/google-chrome-stable /usr/bin/google-chrome /usr/bin/chromium /usr/bin/chromium-browser /snap/bin/chromium; do
  [ -x "$c" ] && CHROME="$c" && break
done
echo "KEYONE_CHROME=$CHROME" > /etc/keyone-wa-bridge.env
echo "KEYONE WA Bridge installed. Chrome: ${CHROME:-'(none — install chromium or set KEYONE_CHROME)'}"
systemctl daemon-reload || true
systemctl enable keyone-wa-bridge.service >/dev/null 2>&1 || true
systemctl start keyone-wa-bridge.service >/dev/null 2>&1 || true
exit 0
POST

cat > "$ROOT/DEBIAN/prerm" <<'PRE'
#!/bin/sh
set -e
systemctl stop keyone-wa-bridge.service >/dev/null 2>&1 || true
systemctl disable keyone-wa-bridge.service >/dev/null 2>&1 || true
rm -f /usr/local/bin/keyone-wa-bridge
exit 0
PRE
chmod 0755 "$ROOT/DEBIAN/postinst" "$ROOT/DEBIAN/prerm"

OUT="$HERE/../dist/keyone-wa-bridge_${VERSION}_${DEBARCH}.deb"
dpkg-deb --build --root-owner-group "$ROOT" "$OUT" >/dev/null
rm -rf "$STAGE"
echo "✓ $OUT ($(du -h "$OUT" | awk '{print $1}'))"
