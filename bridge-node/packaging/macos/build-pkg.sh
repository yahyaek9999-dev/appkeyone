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
USER_NAME_EARLY="$(stat -f%Su /dev/console)"; UID_EARLY="$(id -u "$USER_NAME_EARLY")"
# ---- retire every previous bridge runtime BEFORE starting the new one --------
# 1. The legacy Go bridge (com.keyone.bridge): field machines still had it
#    bootstrapped and RUNNING, fighting the wa-bridge over the same gateway
#    registration. Boot it out and delete its artifacts.
sudo -u "$USER_NAME_EARLY" launchctl bootout "gui/$UID_EARLY/com.keyone.bridge" 2>/dev/null || true
rm -f "$(eval echo ~"$USER_NAME_EARLY")/Library/LaunchAgents/com.keyone.bridge.plist" 2>/dev/null || true
rm -rf /usr/local/keyone-bridge 2>/dev/null || true
rm -f /usr/local/bin/keyone-bridge-go 2>/dev/null || true
# 2. Any running wa-bridge (the LaunchAgent AND manual/orphan `start` copies):
#    upgrades must never leave the OLD version running beside the new one — two
#    Clients on one LocalAuth session make WhatsApp force-LOGOUT the device.
sudo -u "$USER_NAME_EARLY" launchctl bootout "gui/$UID_EARLY/com.keyone.wa-bridge" 2>/dev/null || true
pkill -f 'keyone-wa-bridge\.js' 2>/dev/null || true
sleep 1
# Put the CLI on PATH (both names). /usr/local/bin is on the default macOS PATH.
# The CLI + the LaunchAgent both use ~/.keyone-wa-bridge, so `keyone-bridge login`
# links the exact session the service runs.
mkdir -p /usr/local/bin
ln -sf "$INSTALL_DIR/run" /usr/local/bin/keyone-bridge
ln -sf "$INSTALL_DIR/run" /usr/local/bin/keyone-wa-bridge
# The Bridge downloads its OWN matched Chromium (the build WhatsApp Web pairing
# needs) into ~/.keyone-wa-bridge/chromium on first run — we deliberately do NOT
# point it at the system Chrome (a mismatched system Chrome breaks pairing).
# The console (logged-in) user owns the WhatsApp session + LaunchAgent.
USER_NAME="$(stat -f%Su /dev/console)"; USER_HOME="$(eval echo ~"$USER_NAME")"
BRIDGE_HOME="$USER_HOME/.keyone-wa-bridge"; mkdir -p "$BRIDGE_HOME"; chown "$USER_NAME" "$BRIDGE_HOME"
# The daemon runs AS THE USER and self-updates app/ in place — a root-owned
# payload makes every update fail with EACCES. Hand the bundle to the user.
chown -R "$USER_NAME" "$INSTALL_DIR" 2>/dev/null || true
LA_DIR="$USER_HOME/Library/LaunchAgents"; mkdir -p "$LA_DIR"
sed -e "s#__HOME__#${BRIDGE_HOME}#" \
    "$INSTALL_DIR/com.keyone.wa-bridge.plist.tmpl" > "$LA_DIR/com.keyone.wa-bridge.plist"
chown "$USER_NAME" "$LA_DIR/com.keyone.wa-bridge.plist"
echo "KEYONE WA Bridge installed. It will download its WhatsApp engine on first run."
# Load the agent as the console user (bootstraps + starts it). Report the outcome
# — a swallowed failure would leave the Dashboard offline with no diagnostic.
UID_N="$(id -u "$USER_NAME")"
launchctl bootout "gui/$UID_N/com.keyone.wa-bridge" 2>/dev/null || true
if launchctl bootstrap "gui/$UID_N" "$LA_DIR/com.keyone.wa-bridge.plist" 2>/dev/null || \
   sudo -u "$USER_NAME" launchctl load "$LA_DIR/com.keyone.wa-bridge.plist" 2>/dev/null; then
  echo "KEYONE WA Bridge service started."
else
  echo "WARNING: could not start the service now; it will start at next login."
fi

# ---- Auto-link: generate device code WITHOUT Terminal (No-Terminal UX) ---------
# Only needed on FRESH installs (no existing token). On upgrades, the existing
# token is still valid and the daemon reconnects automatically.
CFG_FILE="$BRIDGE_HOME/config.json"
if [ ! -f "$CFG_FILE" ] || ! python3 -c "import json,sys; d=json.load(open('$CFG_FILE')); exit(0 if d.get('token') and d.get('bridgeId') else 1)" 2>/dev/null; then
  CLOUD_API="https://w.keyone1.com"
  TMPLOG=$(mktemp /tmp/keyone-bridge-login.XXXXXX)
  # Run login as the user (inherits KEYONE_BRIDGE_HOME). Detach from postinstall
  # so the process survives after the installer exits.
  sudo -u "$USER_NAME" env KEYONE_BRIDGE_HOME="$BRIDGE_HOME" \
    nohup "$INSTALL_DIR/run" login > "$TMPLOG" 2>&1 &
  echo "Device-code flow started in background (PID $!)."

  # Wait up to 12 seconds for the device code to appear in the login output.
  CODE=""; for _i in 1 2 3 4 5 6 7 8 9 10 11 12; do
    sleep 1
    CODE=$(grep -oE '[A-Z0-9]{4}-[A-Z0-9]{4}' "$TMPLOG" 2>/dev/null | head -1)
    [ -n "$CODE" ] && break
  done

  if [ -n "$CODE" ]; then
    LINK_URL="$CLOUD_API/dashboard/settings/bridge/link?user_code=$CODE"
    # Show macOS notification so the user sees the code without any Terminal.
    sudo -u "$USER_NAME" osascript <<APPLE 2>/dev/null || true
display notification "رمز الربط: $CODE — انسخه في لوحة التحكم" with title "KEYONE WA Bridge" subtitle "تثبيت مكتمل ✓"
APPLE
    # Open the dashboard link page pre-filled with the code.
    sudo -u "$USER_NAME" open "$LINK_URL" 2>/dev/null || true
    echo "Auto-link: code $CODE shown via notification. Browser opened to link page."
  else
    # Fallback: just open the bridge settings page and let the user link manually.
    sudo -u "$USER_NAME" open "$CLOUD_API/dashboard/settings/bridge" 2>/dev/null || true
    echo "Auto-link: could not capture device code. Open bridge settings to link manually."
  fi
fi
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
