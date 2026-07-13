#!/usr/bin/env bash
set -euo pipefail
# RETIRED 2026-07-13 — builds and publishes the Go/whatsmeow Bridge, which
# WhatsApp rejects pairing from (see bridge-node/keyone-wa-bridge.js header).
# Running this WOULD OVERWRITE the current working whatsapp-web.js Bridge in
# the download store (same path: /var/www/keyone-downloads/keyone-bridge) with
# the old broken one. Use deploy/publish-wwebjs.sh instead.
echo "REFUSING TO RUN: this script publishes the retired Go bridge and would" >&2
echo "overwrite the current working whatsapp-web.js Bridge. Use:" >&2
echo "  deploy/publish-wwebjs.sh <version>" >&2
exit 1

# --- original script body, kept for reference only, unreachable above ---
# Publish KEYONE Bridge downloads to the KEYONE self-hosted download store.
# NO GitHub. Serves at https://w.keyone1.com/downloads/keyone-bridge/.
#
#   deploy/publish-downloads.sh [VERSION]
# env: KEYONE_SSH_KEY (~/Downloads/keyone.pem), KEYONE_HOST (ubuntu@13.63.79.43)

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BR="$ROOT/keyone-bridge"
VERSION="${1:-$(git -C "$ROOT" describe --tags --always 2>/dev/null | sed 's/^v//' || echo 0.5.0)}"
SSH_KEY="${KEYONE_SSH_KEY:-$HOME/Downloads/keyone.pem}"
HOST="${KEYONE_HOST:-ubuntu@13.63.79.43}"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
STORE="/var/www/keyone-downloads/keyone-bridge"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"

echo "▶ VERSION=$VERSION"
echo "▶ build cross-platform binaries"
make -C "$BR" dist VERSION="$VERSION" >/dev/null

PKG=""
if command -v pkgbuild >/dev/null; then
  echo "▶ build macOS .pkg"
  ( cd "$BR" && bash packaging/macos-pkg/build-pkg.sh dist/keyone-bridge_darwin_arm64 "$VERSION" >/dev/null )
  PKG="$BR/keyone-bridge-$VERSION.pkg"
fi

echo "▶ upload dist + packaging to the box"
"${SSH[@]}" "$HOST" 'rm -rf /tmp/kb-pub && mkdir -p /tmp/kb-pub'
scp -q -i "$SSH_KEY" "$BR"/dist/keyone-bridge_* "$HOST:/tmp/kb-pub/"
[ -n "$PKG" ] && scp -q -i "$SSH_KEY" "$PKG" "$HOST:/tmp/kb-pub/keyone-bridge.pkg"
scp -qr -i "$SSH_KEY" "$BR/packaging" "$HOST:/tmp/kb-pub/packaging"

echo "▶ arrange store + build .deb on the box + write manifest"
"${SSH[@]}" "$HOST" "VERSION='$VERSION' STORE='$STORE' bash -s" <<'REMOTE'
set -euo pipefail
cd /tmp/kb-pub
sudo mkdir -p "$STORE/windows" "$STORE/macos" "$STORE/linux"

# binaries (raw — used by the auto-updater's self-swap AND as customer downloads)
sudo cp keyone-bridge_windows_amd64.exe "$STORE/windows/keyone-bridge_windows_amd64.exe"
sudo cp keyone-bridge_windows_amd64.exe "$STORE/windows/latest.exe"
sudo cp keyone-bridge_darwin_arm64      "$STORE/macos/keyone-bridge_darwin_arm64"
sudo cp keyone-bridge_darwin_amd64      "$STORE/macos/keyone-bridge_darwin_amd64"
sudo cp keyone-bridge_linux_amd64       "$STORE/linux/keyone-bridge_linux_amd64"
sudo cp keyone-bridge_linux_arm64       "$STORE/linux/keyone-bridge_linux_arm64"

# macOS installer
[ -f keyone-bridge.pkg ] && sudo cp keyone-bridge.pkg "$STORE/macos/latest.pkg" || echo "  (no .pkg uploaded)"

# Linux .deb — built here on Ubuntu (dpkg-deb available)
if command -v dpkg-deb >/dev/null; then
  ( cd packaging/deb && bash build-deb.sh /tmp/kb-pub/keyone-bridge_linux_amd64 "$VERSION" amd64 >/dev/null )
  DEB=$(ls packaging/deb/keyone-bridge_*_amd64.deb 2>/dev/null | head -1)
  [ -n "$DEB" ] && sudo cp "$DEB" "$STORE/linux/latest.deb" && echo "  built .deb"
else
  echo "  (dpkg-deb missing — no .deb)"
fi

# perms: world-readable so Caddy can serve
sudo find "$STORE" -type d -exec chmod 755 {} \;
sudo find "$STORE" -type f -exec chmod 644 {} \;

# version.json + checksums.txt (manifest the updater + dashboard read).
# Run node as the login user (not sudo) so STORE/VERSION env survive; it only
# reads the world-readable store + writes to /tmp, then we sudo-cp into place.
STORE="$STORE" VERSION="$VERSION" node -e '
const fs=require("fs"),cp=require("child_process"),path=require("path");
const store=process.env.STORE, version=process.env.VERSION;
const plat={
  windows_amd64:"windows/keyone-bridge_windows_amd64.exe",
  darwin_arm64:"macos/keyone-bridge_darwin_arm64",
  darwin_amd64:"macos/keyone-bridge_darwin_amd64",
  linux_amd64:"linux/keyone-bridge_linux_amd64",
  linux_arm64:"linux/keyone-bridge_linux_arm64",
};
const sha=f=>cp.execSync("sha256sum "+JSON.stringify(path.join(store,f))).toString().split(" ")[0];
const size=f=>fs.statSync(path.join(store,f)).size;
const platforms={}; for(const [k,f] of Object.entries(plat)) platforms[k]={file:f,sha256:sha(f),size:size(f)};
const installers={windows:"windows/latest.exe"};
if(fs.existsSync(path.join(store,"macos/latest.pkg"))) installers.macos="macos/latest.pkg";
if(fs.existsSync(path.join(store,"linux/latest.deb"))) installers.linux="linux/latest.deb";
const manifest={version, released:new Date().toISOString(), platforms, installers};
fs.writeFileSync("/tmp/version.json", JSON.stringify(manifest,null,2));
// checksums.txt over every served file
let sums="";
for(const f of cp.execSync("cd "+JSON.stringify(store)+" && find . -type f ! -name checksums.txt ! -name version.json | sort").toString().trim().split("\n")){
  const rel=f.replace(/^\.\//,""); sums+=sha(rel)+"  "+rel+"\n";
}
fs.writeFileSync("/tmp/checksums.txt", sums);
' 2>&1 || { echo "manifest gen FAILED"; exit 1; }
sudo cp /tmp/version.json "$STORE/version.json"
sudo cp /tmp/checksums.txt "$STORE/checksums.txt"
sudo chmod 644 "$STORE/version.json" "$STORE/checksums.txt"
echo "  wrote version.json + checksums.txt"
ls -la "$STORE"/windows "$STORE"/macos "$STORE"/linux | grep -vE '^total|^d' | awk '{print "   "$5, $9}'
REMOTE
echo "✓ published $VERSION to the KEYONE download store"
