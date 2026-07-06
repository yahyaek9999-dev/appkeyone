package updater

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// assetName is the release asset for this platform, e.g.
// "keyone-bridge_linux_amd64" or "keyone-bridge_windows_amd64.exe".
func assetName() string {
	n := fmt.Sprintf("keyone-bridge_%s_%s", runtime.GOOS, runtime.GOARCH)
	if runtime.GOOS == "windows" {
		n += ".exe"
	}
	return n
}

// Apply downloads the platform asset for rel, verifies its SHA-256 against the
// release's checksums.txt, and atomically swaps the running executable. The
// previous binary is kept as <exe>.old for rollback.
func Apply(ctx context.Context, rel *Release) error {
	want := assetName()
	var bin *Asset
	var sums *Asset
	for i := range rel.Assets {
		switch rel.Assets[i].Name {
		case want:
			bin = &rel.Assets[i]
		case "checksums.txt", "SHA256SUMS":
			sums = &rel.Assets[i]
		}
	}
	if bin == nil {
		return fmt.Errorf("no asset %q in release %s", want, rel.TagName)
	}

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	dir := filepath.Dir(exe)

	// Download the new binary to a temp file next to the current one.
	tmp := filepath.Join(dir, ".keyone-bridge.new")
	if err := download(ctx, bin.BrowserDownloadURL, tmp); err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer os.Remove(tmp)

	// Verify checksum. Refuse the update if checksums are published but don't
	// match; warn (and require an override) if none are published.
	if sums != nil {
		expected, err := fetchChecksum(ctx, sums.BrowserDownloadURL, want)
		if err != nil {
			return fmt.Errorf("checksum lookup: %w", err)
		}
		got, err := sha256File(tmp)
		if err != nil {
			return err
		}
		if !strings.EqualFold(expected, got) {
			return fmt.Errorf("checksum mismatch: refusing update (want %s got %s)", expected, got)
		}
	} else if os.Getenv("KEYONE_BRIDGE_ALLOW_UNVERIFIED") != "1" {
		return fmt.Errorf("release has no checksums.txt — refusing (set KEYONE_BRIDGE_ALLOW_UNVERIFIED=1 to override)")
	}

	if err := os.Chmod(tmp, 0o755); err != nil {
		return err
	}

	// Atomic swap with rollback: current → .old, new → current.
	old := exe + ".old"
	_ = os.Remove(old)
	if err := os.Rename(exe, old); err != nil {
		return fmt.Errorf("stage old binary: %w", err)
	}
	if err := os.Rename(tmp, exe); err != nil {
		// rollback
		_ = os.Rename(old, exe)
		return fmt.Errorf("swap failed, rolled back: %w", err)
	}
	fmt.Printf("✓ Updated to %s. Previous binary kept at %s. Restart the service to run it.\n", rel.TagName, old)
	return nil
}

// Rollback restores the previous binary (<exe>.old) that Apply staged, in case a
// new build misbehaves. The bad binary is kept as <exe>.failed for inspection.
func Rollback() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	old := exe + ".old"
	if _, err := os.Stat(old); err != nil {
		return fmt.Errorf("no previous binary to roll back to (%s)", old)
	}
	failed := exe + ".failed"
	_ = os.Remove(failed)
	if err := os.Rename(exe, failed); err != nil {
		return err
	}
	if err := os.Rename(old, exe); err != nil {
		_ = os.Rename(failed, exe) // undo
		return err
	}
	_ = os.Remove(failed)
	fmt.Println("✓ Rolled back to the previous binary. Restart the service to run it.")
	return nil
}

func download(ctx context.Context, url, dst string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	client := &http.Client{Timeout: 5 * time.Minute}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("status %d", resp.StatusCode)
	}
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, resp.Body)
	return err
}

func fetchChecksum(ctx context.Context, url, name string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	sc := bufio.NewScanner(resp.Body)
	for sc.Scan() {
		// format: "<sha256>  <filename>"
		fields := strings.Fields(sc.Text())
		if len(fields) >= 2 && filepath.Base(fields[len(fields)-1]) == name {
			return fields[0], nil
		}
	}
	return "", fmt.Errorf("no checksum for %q", name)
}

func sha256File(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
