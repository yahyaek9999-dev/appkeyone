#!/usr/bin/env bash
set -euo pipefail
# Runs ON THE BOX (16GB). Builds the whatsapp-web.js Bridge artifacts for every
# platform, builds Linux DEBs + Windows zip + app.tar.gz, tars the darwin bundles
# for the Mac to wrap into .pkg, and stages the store swap (removes Go artifacts,
# installs linux/windows/app). version.json is generated LATER (after the Mac
# uploads the macOS .pkgs) by box-finalize.sh.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
export PUPPETEER_SKIP_DOWNLOAD=true
NV=v20.18.1
STORE=/var/www/keyone-downloads/keyone-bridge
cd /tmp/kwbuild

echo "▶ vendor app deps (node_modules) once"
mkdir -p app; cp src/keyone-wa-bridge.js app/; cp src/package.json app/
( cd app && npm install --omit=dev --no-audit --no-fund --silent )
tar czf app.tar.gz -C app .
echo "  app.tar.gz: $(du -h app.tar.gz | cut -f1)"

fetch_node() { # <name> <ext>
  local N="$1" E="$2"
  mkdir -p nc
  [ -f "nc/$N.$E" ] || curl -fsSL "https://nodejs.org/dist/$NV/$N.$E" -o "nc/$N.$E"
}
assemble() { # <target>
  local T="$1" N E B W O
  case "$T" in
    linux-x64)   N=node-$NV-linux-x64;   E=tar.xz; B=bin/node; W=0;;
    linux-arm64) N=node-$NV-linux-arm64; E=tar.xz; B=bin/node; W=0;;
    win-x64)     N=node-$NV-win-x64;     E=zip;    B=node.exe; W=1;;
    darwin-arm64) N=node-$NV-darwin-arm64; E=tar.gz; B=bin/node; W=0;;
    darwin-x64)   N=node-$NV-darwin-x64;   E=tar.gz; B=bin/node; W=0;;
  esac
  fetch_node "$N" "$E"
  O="pk/dist/$T"; mkdir -p "$O"; rm -rf "$O/app"; cp -R app "$O/app"
  local t; t="$(mktemp -d)"
  case "$E" in tar.xz) tar xJf "nc/$N.$E" -C "$t";; tar.gz) tar xzf "nc/$N.$E" -C "$t";; zip) (cd "$t" && unzip -q "/tmp/kwbuild/nc/$N.$E");; esac
  if [ "$W" = 1 ]; then cp "$t/$N/$B" "$O/node.exe"; printf '@echo off\r\n"%%~dp0node.exe" "%%~dp0app\\keyone-wa-bridge.js" %%*\r\n' > "$O/run.cmd";
  else
    cp "$t/$N/$B" "$O/node"; chmod +x "$O/node"
    cat > "$O/run" <<'RUN'
#!/bin/sh
# Resolve symlinks (e.g. /usr/local/bin/keyone-bridge) to find the real bundle dir.
SELF="$0"
while [ -h "$SELF" ]; do L="$(readlink "$SELF")"; case "$L" in /*) SELF="$L";; *) SELF="$(dirname "$SELF")/$L";; esac; done
DIR="$(cd "$(dirname "$SELF")" && pwd)"
exec "$DIR/node" "$DIR/app/keyone-wa-bridge.js" "$@"
RUN
    chmod +x "$O/run"
  fi
  rm -rf "$t"; echo "  ✓ $T ($(du -sh "$O" | cut -f1))"
}
echo "▶ assemble bundles"
for T in linux-x64 linux-arm64 win-x64 darwin-arm64 darwin-x64; do assemble "$T"; done

echo "▶ Linux DEBs"
( cd pk/linux && bash build-deb.sh linux-x64 1.0.0 >/dev/null && bash build-deb.sh linux-arm64 1.0.0 >/dev/null )
DEB_AMD=$(ls pk/dist/keyone-wa-bridge_*_amd64.deb | head -1)
DEB_ARM=$(ls pk/dist/keyone-wa-bridge_*_arm64.deb | head -1)
echo "  amd64=$(du -h "$DEB_AMD"|cut -f1) arm64=$(du -h "$DEB_ARM"|cut -f1)"

echo "▶ Windows zip"
( cd pk/dist/win-x64 && cp /tmp/kwbuild/win/install.ps1 /tmp/kwbuild/win/uninstall.ps1 . && zip -qr /tmp/kwbuild/keyone-wa-bridge-win-x64.zip node.exe app run.cmd install.ps1 uninstall.ps1 )
echo "  win zip: $(du -h keyone-wa-bridge-win-x64.zip|cut -f1)"

echo "▶ darwin bundle tarballs (Mac wraps these into .pkg)"
tar czf darwin-arm64-bundle.tar.gz -C pk/dist/darwin-arm64 .
tar czf darwin-x64-bundle.tar.gz   -C pk/dist/darwin-x64 .
echo "  arm64=$(du -h darwin-arm64-bundle.tar.gz|cut -f1) x64=$(du -h darwin-x64-bundle.tar.gz|cut -f1)"

echo "▶ stage store swap: REMOVE Go artifacts, install linux/windows/app"
sudo mkdir -p "$STORE/windows" "$STORE/macos" "$STORE/linux"
sudo rm -f "$STORE"/windows/keyone-bridge_windows_amd64.exe "$STORE"/windows/latest.exe
sudo rm -f "$STORE"/macos/keyone-bridge_darwin_arm64 "$STORE"/macos/keyone-bridge_darwin_amd64
sudo rm -f "$STORE"/linux/keyone-bridge_linux_amd64 "$STORE"/linux/keyone-bridge_linux_arm64
sudo cp "$DEB_AMD" "$STORE/linux/latest.deb"
sudo cp "$DEB_ARM" "$STORE/linux/keyone-wa-bridge_arm64.deb"
sudo cp keyone-wa-bridge-win-x64.zip "$STORE/windows/keyone-wa-bridge-win-x64.zip"
sudo cp app.tar.gz "$STORE/app.tar.gz"
echo "✓ box build done — macOS .pkg pending (Mac), then run box-finalize.sh"
