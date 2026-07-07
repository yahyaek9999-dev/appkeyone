#!/usr/bin/env bash
set -euo pipefail
# Publish the whatsapp-web.js Bridge (bridge-node) to the KEYONE download store,
# REPLACING the old Go/whatsmeow artifacts. Customers download ONLY the working
# Bridge. Reuses macos/latest.pkg + linux/latest.deb paths so existing URLs now
# serve the new bridge; removes every Go binary.
#
#   deploy/publish-wwebjs.sh [VERSION]
VERSION="${1:-1.0.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BN="$ROOT/bridge-node"; PK="$BN/packaging"
SSH_KEY="${KEYONE_SSH_KEY:-$HOME/Downloads/keyone.pem}"
HOST="${KEYONE_HOST:-ubuntu@13.63.79.43}"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
STORE="/var/www/keyone-downloads/keyone-bridge"
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
NODE_VER="v20.18.1"

echo "▶ VERSION=$VERSION — assembling bundles (reuse one vendored app/ across arches)"
# Reference app/ (vendored prod node_modules — platform-agnostic JS). Build once.
[ -d "$PK/dist/linux-x64/app/node_modules" ] || bash "$PK/build-bundle.sh" linux-x64 "$NODE_VER" >/dev/null
REF="$PK/dist/linux-x64/app"

assemble() { # <target>
  local T="$1" OUT="$PK/dist/$T"
  case "$T" in
    darwin-arm64) N="node-$NODE_VER-darwin-arm64"; E="tar.gz"; B="bin/node"; W=0;;
    darwin-x64)   N="node-$NODE_VER-darwin-x64";   E="tar.gz"; B="bin/node"; W=0;;
    linux-x64)    N="node-$NODE_VER-linux-x64";    E="tar.xz"; B="bin/node"; W=0;;
    linux-arm64)  N="node-$NODE_VER-linux-arm64";  E="tar.xz"; B="bin/node"; W=0;;
    win-x64)      N="node-$NODE_VER-win-x64";      E="zip";    B="node.exe"; W=1;;
  esac
  mkdir -p "$OUT"; rm -rf "$OUT/app"; cp -R "$REF" "$OUT/app"
  local C="$PK/.nodecache"; mkdir -p "$C"
  [ -f "$C/$N.$E" ] || curl -fsSL "https://nodejs.org/dist/$NODE_VER/$N.$E" -o "$C/$N.$E"
  local TMP; TMP="$(mktemp -d)"; ( cd "$TMP" && case "$E" in tar.gz) tar xzf "$C/$N.$E";; tar.xz) tar xJf "$C/$N.$E";; zip) unzip -q "$C/$N.$E";; esac )
  if [ "$W" = 1 ]; then cp "$TMP/$N/$B" "$OUT/node.exe"; printf '@echo off\r\n"%%~dp0node.exe" "%%~dp0app\\keyone-wa-bridge.js" %%*\r\n' > "$OUT/run.cmd";
  else
    cp "$TMP/$N/$B" "$OUT/node"; chmod +x "$OUT/node"
    cat > "$OUT/run" <<'RUN'
#!/bin/sh
SELF="$0"
while [ -h "$SELF" ]; do L="$(readlink "$SELF")"; case "$L" in /*) SELF="$L";; *) SELF="$(dirname "$SELF")/$L";; esac; done
DIR="$(cd "$(dirname "$SELF")" && pwd)"
exec "$DIR/node" "$DIR/app/keyone-wa-bridge.js" "$@"
RUN
    chmod +x "$OUT/run"
  fi
  rm -rf "$TMP"; echo "  ✓ $T ($(du -sh "$OUT"|cut -f1))"
}
for T in darwin-arm64 darwin-x64 linux-x64 linux-arm64 win-x64; do assemble "$T"; done
# refresh app js everywhere (in case it changed) + rebuild ref app.tar.gz
cp "$BN/keyone-wa-bridge.js" "$REF/keyone-wa-bridge.js"
for T in darwin-arm64 darwin-x64 linux-arm64 win-x64; do cp "$BN/keyone-wa-bridge.js" "$PK/dist/$T/app/keyone-wa-bridge.js"; done

echo "▶ macOS PKGs"
bash "$PK/macos/build-pkg.sh" darwin-arm64 "$VERSION" >/dev/null && echo "  ✓ arm64 pkg"
bash "$PK/macos/build-pkg.sh" darwin-x64   "$VERSION" >/dev/null && echo "  ✓ x64 pkg"

echo "▶ Windows ZIP"
WZ="$PK/dist/keyone-wa-bridge-win-x64.zip"; rm -f "$WZ"
( cd "$PK/dist/win-x64" && cp "$PK/windows/install.ps1" "$PK/windows/uninstall.ps1" . && zip -qr "$WZ" node.exe app run.cmd install.ps1 uninstall.ps1 )
echo "  ✓ $(du -h "$WZ"|cut -f1)"

echo "▶ app.tar.gz (platform-agnostic self-update package)"
APP="$PK/dist/app.tar.gz"; ( cd "$REF/.." && tar czf "$APP" -C app . ); echo "  ✓ $(du -h "$APP"|cut -f1)"

echo "▶ upload to the box"
"${SSH[@]}" "$HOST" 'mkdir -p /tmp/kwpub; find /tmp/kwpub -mindepth 1 -delete 2>/dev/null; mkdir -p /tmp/kwpub/linux'
scp -q -i "$SSH_KEY" "$PK/dist/keyone-wa-bridge-$VERSION-darwin-arm64.pkg" "$HOST:/tmp/kwpub/latest.pkg"
scp -q -i "$SSH_KEY" "$PK/dist/keyone-wa-bridge-$VERSION-darwin-x64.pkg"   "$HOST:/tmp/kwpub/keyone-wa-bridge-darwin-x64.pkg"
scp -q -i "$SSH_KEY" "$WZ" "$HOST:/tmp/kwpub/keyone-wa-bridge-win-x64.zip"
scp -q -i "$SSH_KEY" "$APP" "$HOST:/tmp/kwpub/app.tar.gz"
scp -q -i "$SSH_KEY" -r "$PK/dist/linux-x64"  "$HOST:/tmp/kwpub/linux/linux-x64"
scp -q -i "$SSH_KEY" -r "$PK/dist/linux-arm64" "$HOST:/tmp/kwpub/linux/linux-arm64"
scp -q -i "$SSH_KEY" "$PK/linux/build-deb.sh" "$HOST:/tmp/kwpub/linux/build-deb.sh"

echo "▶ build DEBs + arrange store + version.json + REMOVE old Go artifacts"
"${SSH[@]}" "$HOST" "VERSION='$VERSION' STORE='$STORE' bash -s" <<'REMOTE'
set -euo pipefail
cd /tmp/kwpub
# DEBs (bundle path expected at ../dist/<arch> by build-deb.sh)
mkdir -p linux/dist && cp -R linux/linux-x64 linux/dist/linux-x64 && cp -R linux/linux-arm64 linux/dist/linux-arm64
( cd linux && bash build-deb.sh linux-x64 "$VERSION" >/dev/null && bash build-deb.sh linux-arm64 "$VERSION" >/dev/null )
DEB_AMD=$(ls linux/dist/keyone-wa-bridge_*_amd64.deb | head -1)
DEB_ARM=$(ls linux/dist/keyone-wa-bridge_*_arm64.deb | head -1)

# ---- REMOVE every old Go/whatsmeow artifact so it is unreachable ----
sudo rm -f "$STORE"/windows/keyone-bridge_windows_amd64.exe "$STORE"/windows/latest.exe
sudo rm -f "$STORE"/macos/keyone-bridge_darwin_arm64 "$STORE"/macos/keyone-bridge_darwin_amd64
sudo rm -f "$STORE"/linux/keyone-bridge_linux_amd64 "$STORE"/linux/keyone-bridge_linux_arm64

# ---- install the new wwebjs artifacts (reuse latest.pkg/latest.deb paths) ----
sudo mkdir -p "$STORE"/windows "$STORE"/macos "$STORE"/linux
sudo cp latest.pkg "$STORE/macos/latest.pkg"
sudo cp keyone-wa-bridge-darwin-x64.pkg "$STORE/macos/keyone-wa-bridge-darwin-x64.pkg"
sudo cp "$DEB_AMD" "$STORE/linux/latest.deb"
sudo cp "$DEB_ARM" "$STORE/linux/keyone-wa-bridge_arm64.deb"
sudo cp keyone-wa-bridge-win-x64.zip "$STORE/windows/keyone-wa-bridge-win-x64.zip"
sudo cp app.tar.gz "$STORE/app.tar.gz"
sudo find "$STORE" -type d -exec chmod 755 {} \; ; sudo find "$STORE" -type f -exec chmod 644 {} \;

# ---- version.json (manifest + self-update pointer) + checksums.txt ----
STORE="$STORE" VERSION="$VERSION" node -e '
const fs=require("fs"),cp=require("child_process"),p=require("path");
const store=process.env.STORE, version=process.env.VERSION;
const sha=f=>cp.execSync("sha256sum "+JSON.stringify(p.join(store,f))).toString().split(" ")[0];
const size=f=>fs.statSync(p.join(store,f)).size;
const meta=f=>({file:f,sha256:sha(f),size:size(f)});
const m={ version, engine:"whatsapp-web.js", released:new Date().toISOString(),
  app: meta("app.tar.gz"),
  installers:{ macos:"macos/latest.pkg", macos_intel:"macos/keyone-wa-bridge-darwin-x64.pkg",
    linux:"linux/latest.deb", linux_arm64:"linux/keyone-wa-bridge_arm64.deb",
    windows:"windows/keyone-wa-bridge-win-x64.zip", docker:"ghcr-not-used-see-Dockerfile" },
  platforms:{
    darwin_arm64: meta("macos/latest.pkg"), darwin_x64: meta("macos/keyone-wa-bridge-darwin-x64.pkg"),
    linux_amd64: meta("linux/latest.deb"), linux_arm64: meta("linux/keyone-wa-bridge_arm64.deb"),
    windows_amd64: meta("windows/keyone-wa-bridge-win-x64.zip") } };
fs.writeFileSync("/tmp/version.json", JSON.stringify(m,null,2));
let sums=""; for(const f of cp.execSync("cd "+JSON.stringify(store)+" && find . -type f ! -name checksums.txt ! -name version.json | sort").toString().trim().split("\n")){ const rel=f.replace(/^\.\//,""); sums+=sha(rel)+"  "+rel+"\n"; }
fs.writeFileSync("/tmp/checksums.txt", sums);
'
sudo cp /tmp/version.json "$STORE/version.json"; sudo cp /tmp/checksums.txt "$STORE/checksums.txt"
sudo chmod 644 "$STORE/version.json" "$STORE/checksums.txt"
echo "  ✓ store updated"
echo "  --- store contents ---"; ls -R "$STORE" | grep -vE '^$'
echo "  --- any Go artifact left? ---"; find "$STORE" -name 'keyone-bridge_*' -o -name 'latest.exe' | sed 's/^/  LEFTOVER: /' || true
REMOTE
echo "✓ published wwebjs Bridge $VERSION"
