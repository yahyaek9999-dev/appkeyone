package updater

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Apply downloads this platform's binary named in rel from the KEYONE download
// server, verifies its SHA-256 against version.json, and atomically swaps the
// running executable. The previous binary is kept as <exe>.old for rollback.
func Apply(ctx context.Context, rel *Release) error {
	key := platformKey()
	asset, ok := rel.Platforms[key]
	if !ok {
		return fmt.Errorf("no KEYONE build for %s in release %s", key, rel.Version)
	}
	url := DownloadBase() + "/" + strings.TrimLeft(asset.File, "/")

	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, _ = filepath.EvalSymlinks(exe)
	dir := filepath.Dir(exe)

	tmp := filepath.Join(dir, ".keyone-bridge.new")
	if err := download(ctx, url, tmp); err != nil {
		return fmt.Errorf("download: %w", err)
	}
	defer os.Remove(tmp)

	// Integrity: SHA-256 must match version.json. Refuse otherwise (this is the
	// customer's protection now that installers are KEYONE-hosted, not signed).
	if asset.SHA256 != "" {
		got, err := sha256File(tmp)
		if err != nil {
			return err
		}
		if !strings.EqualFold(asset.SHA256, got) {
			return fmt.Errorf("checksum mismatch: refusing update (want %s got %s)", asset.SHA256, got)
		}
	} else if os.Getenv("KEYONE_BRIDGE_ALLOW_UNVERIFIED") != "1" {
		return fmt.Errorf("version.json has no sha256 for %s — refusing (set KEYONE_BRIDGE_ALLOW_UNVERIFIED=1 to override)", key)
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
		_ = os.Rename(old, exe) // undo
		return fmt.Errorf("swap failed, rolled back: %w", err)
	}
	fmt.Printf("✓ Updated to %s. Previous binary kept at %s. Restart the service to run it.\n", rel.Version, old)
	return nil
}

// Rollback restores the previous binary (<exe>.old) that Apply staged. The bad
// binary is kept as <exe>.failed for inspection.
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
		_ = os.Rename(failed, exe)
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
	resp, err := (&http.Client{Timeout: 5 * time.Minute}).Do(req)
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
