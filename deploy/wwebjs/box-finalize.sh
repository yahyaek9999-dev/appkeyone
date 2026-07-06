#!/usr/bin/env bash
set -euo pipefail
# Runs ON THE BOX after the Mac uploads the two macOS .pkgs to /tmp/kwbuild/.
# Installs the .pkgs, generates version.json + checksums over the FINAL store,
# removes any remaining Go artifact, and verifies.
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
STORE=/var/www/keyone-downloads/keyone-bridge
cd /tmp/kwbuild

echo "▶ install macOS .pkgs"
sudo cp macos-arm64.pkg "$STORE/macos/latest.pkg"
sudo cp macos-x64.pkg   "$STORE/macos/keyone-wa-bridge-darwin-x64.pkg"

echo "▶ remove ANY remaining Go artifact"
sudo find "$STORE" -type f \( -name 'keyone-bridge_*' -o -name 'latest.exe' \) -print -delete | sed 's/^/  removed: /' || true

sudo find "$STORE" -type d -exec chmod 755 {} \;
sudo find "$STORE" -type f -exec chmod 644 {} \;

echo "▶ version.json + checksums (final store)"
STORE="$STORE" VERSION=1.0.0 node -e '
const fs=require("fs"),cp=require("child_process"),p=require("path");
const store=process.env.STORE, version=process.env.VERSION;
const sha=f=>cp.execSync("sha256sum "+JSON.stringify(p.join(store,f))).toString().split(" ")[0];
const size=f=>fs.statSync(p.join(store,f)).size;
const meta=f=>({file:f,sha256:sha(f),size:size(f)});
const m={ version, engine:"whatsapp-web.js", released:new Date().toISOString(),
  app: meta("app.tar.gz"),
  installers:{ macos:"macos/latest.pkg", macos_intel:"macos/keyone-wa-bridge-darwin-x64.pkg",
    linux:"linux/latest.deb", linux_arm64:"linux/keyone-wa-bridge_arm64.deb",
    windows:"windows/keyone-wa-bridge-win-x64.zip" },
  platforms:{
    darwin_arm64: meta("macos/latest.pkg"),
    darwin_x64: meta("macos/keyone-wa-bridge-darwin-x64.pkg"),
    linux_amd64: meta("linux/latest.deb"),
    linux_arm64: meta("linux/keyone-wa-bridge_arm64.deb"),
    windows_amd64: meta("windows/keyone-wa-bridge-win-x64.zip") } };
fs.writeFileSync("/tmp/version.json", JSON.stringify(m,null,2));
let sums=""; for(const f of cp.execSync("cd "+JSON.stringify(store)+" && find . -type f ! -name checksums.txt ! -name version.json | sort").toString().trim().split("\n")){ const rel=f.replace(/^\.\//,""); sums+=sha(rel)+"  "+rel+"\n"; }
fs.writeFileSync("/tmp/checksums.txt", sums);
'
sudo cp /tmp/version.json "$STORE/version.json"
sudo cp /tmp/checksums.txt "$STORE/checksums.txt"
sudo chmod 644 "$STORE/version.json" "$STORE/checksums.txt"

echo "▶ FINAL store contents"
ls -R "$STORE" | grep -vE '^$'
echo "▶ any Go artifact still present? (should be EMPTY)"
find "$STORE" -name 'keyone-bridge_*' -o -name 'latest.exe' | sed 's/^/  LEFTOVER: /' || true
echo "✓ finalize done — version $(node -e 'console.log(require("'"$STORE"'/version.json").version)')"
