#!/usr/bin/env bash
set -euo pipefail
# Runs ON THE MAC (disk-light). For each darwin arch: pull the box-built bundle
# tarball, wrap it into a .pkg via build-pkg.sh, upload the .pkg to the box, then
# delete the bundle+pkg before the next arch (peak ~470MB, fits the tight disk).
export PATH="/opt/homebrew/bin:/usr/bin:/bin:$PATH"
K="$HOME/Downloads/keyone.pem"; HOST=ubuntu@13.63.79.43
BN=/Users/yahyaemad/Desktop/appkeyone/.claude/worktrees/angry-bassi-903683/bridge-node
PK="$BN/packaging"; TMP=/tmp
for A in arm64 x64; do
  T="darwin-$A"
  echo "▶ $T: fetch box bundle"
  scp -q -i "$K" "$HOST:/tmp/kwbuild/$T-bundle.tar.gz" "$TMP/$T.tgz"
  rm -rf "$PK/dist/$T"; mkdir -p "$PK/dist/$T"; tar xzf "$TMP/$T.tgz" -C "$PK/dist/$T"; rm -f "$TMP/$T.tgz"
  echo "▶ $T: build .pkg"
  bash "$PK/macos/build-pkg.sh" "$T" 1.0.0 | tail -1
  scp -q -i "$K" "$PK/dist/keyone-wa-bridge-1.0.0-$T.pkg" "$HOST:/tmp/kwbuild/macos-$A.pkg"
  echo "  ✓ uploaded macos-$A.pkg"
  find "$PK/dist/$T" -mindepth 1 -delete 2>/dev/null; rmdir "$PK/dist/$T" 2>/dev/null || true
  rm -f "$PK/dist/keyone-wa-bridge-1.0.0-$T.pkg"
  echo "  disk: $(df -h / | tail -1 | awk '{print $4}') free"
done
echo "✓ both macOS .pkgs built + uploaded to the box"
