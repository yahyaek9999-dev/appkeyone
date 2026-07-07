#!/usr/bin/env bash
set -euo pipefail
# Build a macOS .pkg that installs the self-contained bundle to
# /usr/local/keyone-wa-bridge and a per-user LaunchAgent that auto-starts it.
# Detects Chrome/Chromium at install time. Signing/notarization is applied only
# if KEYONE_SIGN_ID is set (dev/unsigned build still installs + runs).
#
#   build-pkg.sh <darwin-arm64|darwin-x64> <version>
ARCH="${1:?arch}"; VERSION="${2:?version}"
HERE="$(cd "$(dirname "$0")" && pwd)"          # packaging/macos
PKGROOT="$HERE/../dist/$ARCH"                   # the assembled bundle
[ -d "$PKGROOT/app" ] || { echo "bundle missing — run build-bundle.sh $ARCH first"; exit 1; }
STAGE="$(mktemp -d)"; PAYLOAD="$STAGE/payload"; SCRIPTS="$STAGE/scripts"
INSTALL_DIR="/usr/local/keyone-wa-bridge"
mkdir -p "$PAYLOAD$INSTALL_DIR" "$SCRIPTS"

echo "▶ payload"
cp -R "$PKGROOT/." "$PAYLOAD$INSTALL_DIR/"

echo "▶ LaunchAgent template + postinstall"
cat > "$PAYLOAD$INSTALL_DIR/com.keyone.wa-bridge.plist.tmpl" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.keyone.wa-bridge</string>
  <key>ProgramArguments</key><array>
    <string>$INSTALL_DIR/run</string><string>start</string>
  </array>
  <key>EnvironmentVariables</key><dict>
    <key>KEYONE_CHROME</key><string>__CHROME__</string>
    <key>KEYONE_BRIDGE_HOME</key><string>__HOME__</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>__HOME__/bridge.out.log</string>
  <key>StandardErrorPath</key><string>__HOME__/bridge.err.log</string>
</dict></plist>
PLIST

cat > "$PAYLOAD$INSTALL_DIR/uninstall.sh" <<'UNINST'
#!/bin/bash
# Uninstall KEYONE WA Bridge (run with sudo). Keeps ~/.keyone-wa-bridge (session).
U="$(stat -f%Su /dev/console)"; UH="$(eval echo ~"$U")"
sudo -u "$U" launchctl bootout "gui/$(id -u "$U")/com.keyone.wa-bridge" 2>/dev/null || true
rm -f "$UH/Library/LaunchAgents/com.keyone.wa-bridge.plist"
rm -f /usr/local/bin/keyone-bridge /usr/local/bin/keyone-wa-bridge
rm -rf /usr/local/keyone-wa-bridge
echo "KEYONE WA Bridge removed. (~/.keyone-wa-bridge kept — delete it to fully unlink.)"
UNINST
chmod +x "$PAYLOAD$INSTALL_DIR/uninstall.sh"

cat > "$SCRIPTS/postinstall" <<'POST'
#!/bin/bash
set -e
INSTALL_DIR="/usr/local/keyone-wa-bridge"
# Put the CLI on PATH (both names). /usr/local/bin is on the default macOS PATH.
# The CLI + the LaunchAgent both use ~/.keyone-wa-bridge, so `keyone-bridge login`
# links the exact session the service runs.
mkdir -p /usr/local/bin
ln -sf "$INSTALL_DIR/run" /usr/local/bin/keyone-bridge
ln -sf "$INSTALL_DIR/run" /usr/local/bin/keyone-wa-bridge
# Detect Chrome/Chromium (system first — the reliable path for whatsapp-web.js).
CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  [ -x "$c" ] && CHROME="$c" && break
done
# The console (logged-in) user owns the WhatsApp session + LaunchAgent.
USER_NAME="$(stat -f%Su /dev/console)"; USER_HOME="$(eval echo ~"$USER_NAME")"
BRIDGE_HOME="$USER_HOME/.keyone-wa-bridge"; mkdir -p "$BRIDGE_HOME"; chown "$USER_NAME" "$BRIDGE_HOME"
LA_DIR="$USER_HOME/Library/LaunchAgents"; mkdir -p "$LA_DIR"
sed -e "s#__CHROME__#${CHROME}#" -e "s#__HOME__#${BRIDGE_HOME}#" \
    "$INSTALL_DIR/com.keyone.wa-bridge.plist.tmpl" > "$LA_DIR/com.keyone.wa-bridge.plist"
chown "$USER_NAME" "$LA_DIR/com.keyone.wa-bridge.plist"
echo "KEYONE WA Bridge installed. Chrome: ${CHROME:-'(none — will download Chromium on first run)'}"
# Load the agent as the console user (bootstraps + starts it).
UID_N="$(id -u "$USER_NAME")"
launchctl bootout "gui/$UID_N/com.keyone.wa-bridge" 2>/dev/null || true
launchctl bootstrap "gui/$UID_N" "$LA_DIR/com.keyone.wa-bridge.plist" 2>/dev/null || \
  sudo -u "$USER_NAME" launchctl load "$LA_DIR/com.keyone.wa-bridge.plist" 2>/dev/null || true
exit 0
POST
chmod +x "$SCRIPTS/postinstall"

echo "▶ pkgbuild"
COMPONENT="$STAGE/keyone-wa-bridge-component.pkg"
pkgbuild --root "$PAYLOAD" --scripts "$SCRIPTS" \
  --identifier com.keyone.wa-bridge --version "$VERSION" \
  --install-location "/" "$COMPONENT" >/dev/null
OUT="$HERE/../dist/keyone-wa-bridge-$VERSION-$ARCH.pkg"
if [ -n "${KEYONE_SIGN_ID:-}" ]; then
  productbuild --package "$COMPONENT" --sign "$KEYONE_SIGN_ID" "$OUT" >/dev/null
  echo "  signed with $KEYONE_SIGN_ID"
else
  productbuild --package "$COMPONENT" "$OUT" >/dev/null
  echo "  UNSIGNED dev build (set KEYONE_SIGN_ID to sign)"
fi
rm -rf "$STAGE"
echo "✓ $OUT ($(du -h "$OUT" | awk '{print $1}'))"
