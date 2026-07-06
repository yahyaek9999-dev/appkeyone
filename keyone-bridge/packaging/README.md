# KEYONE Bridge — packaging & service install

Cross-platform binaries, OS service integration, and native installers.

## 1. Build binaries + checksums

```bash
cd keyone-bridge
make dist        # -> dist/keyone-bridge_<os>_<arch>[.exe] + dist/checksums.txt
```

Targets: `darwin/{amd64,arm64}`, `linux/{amd64,arm64}`, `windows/amd64` — all
**cgo-free** (no C toolchain needed). `checksums.txt` is what the auto-updater
verifies before an atomic swap.

## 2. Service integration (no installer needed)

| OS | Service model | Install |
|----|---------------|---------|
| **Linux/Ubuntu (server)** | systemd **system** unit, dedicated `keyone-bridge` user, file-encrypted vault | `sudo packaging/install-linux.sh dist/keyone-bridge_linux_amd64` |
| **Linux (desktop)** | systemd **user** unit, login keychain | copy `systemd/keyone-bridge.user.service` → `~/.config/systemd/user/`, `systemctl --user enable --now keyone-bridge` |
| **macOS** | LaunchAgent (per-user, login Keychain) | `packaging/install-macos.sh dist/keyone-bridge_darwin_arm64` |
| **Windows** | Windows Service (LocalSystem, file-encrypted vault) | elevated `packaging/windows/install.ps1 -Binary dist\keyone-bridge_windows_amd64.exe` |

Every path: **link first** (`keyone-bridge login`), then enable the service.
Uninstall scripts sit next to each installer (`uninstall-*`).

## 3. Native installers

| Package | Script | Requires | Testable here |
|---------|--------|----------|---------------|
| `.deb` (Debian/Ubuntu) | `deb/build-deb.sh <bin> <ver> <arch>` | `dpkg-deb` (Linux) | on Linux |
| `.AppImage` (portable Linux) | `appimage/build-appimage.sh <bin> <ver> <arch>` | `appimagetool` | on Linux |
| `.pkg` (macOS) | `macos-pkg/build-pkg.sh <bin> <ver>` | `pkgbuild` (macOS) | ✅ built + verified |
| `.msi` (Windows) | `windows-msi/build.ps1 -BinPath <exe> -Version <ver>` | WiX Toolset (Windows) | on Windows |

`build-all.sh` runs `make dist` then every packager whose tooling is present on
the current host, skipping the rest.

## 4. Code signing (required before public distribution — external blocker)

The build scripts produce **unsigned** artifacts. Signing needs credentials that
are not in this repo and must be supplied at release time:

- **macOS**: `codesign --sign "Developer ID Application: <Team>"` the binary, then
  `productsign --sign "Developer ID Installer: <Team>"` the `.pkg`, then
  `xcrun notarytool submit` for notarization. Needs an Apple Developer ID.
- **Windows**: `signtool sign /fd sha256 /a keyone-bridge.exe` and the `.msi`.
  Needs an Authenticode (ideally EV) code-signing certificate.
- **Linux**: `.deb`/AppImage can be GPG-signed; the auto-updater additionally
  verifies `checksums.txt` (SHA-256) regardless of OS signing.

Until certs are provisioned, users may see OS "unidentified developer"
warnings. The integrity chain (SHA-256 in `checksums.txt`, verified by the
updater) is enforced today; OS-level signatures are the remaining gate.

## 5. Releasing (KEYONE-hosted — no GitHub)

Publish binaries + installers to the **KEYONE download store**, served by Caddy at
`https://w.keyone1.com/downloads/keyone-bridge/`. Run `deploy/publish-downloads.sh`
from the repo root: it builds `dist/*`, builds the `.deb` on the server and the
`.pkg` on macOS, uploads them, arranges `windows/ macos/ linux/` + `latest.*`, and
writes `version.json` + `checksums.txt`. Customers download only from KEYONE, and
the Bridge's `update` command reads `version.json`, verifies SHA-256, and applies
the swap. **No GitHub Releases dependency.**
