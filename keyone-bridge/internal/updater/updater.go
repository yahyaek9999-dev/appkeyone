// Package updater checks the KEYONE download server for a newer Bridge and
// applies it via a verified, atomic swap with rollback. Updates come ONLY from
// KEYONE infrastructure — there is no GitHub dependency.
//
// Contract (served by KEYONE, default https://w.keyone1.com/downloads/keyone-bridge):
//
//	GET version.json  →  { "version": "0.5.0", "released": "...", "platforms": {
//	     "linux_amd64": { "file": "linux/keyone-bridge_linux_amd64", "sha256": "…", "size": N }, … } }
//	GET <base>/<file> →  the binary/installer for a platform (resumable, SHA-256 verified)
package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"runtime"
	"strings"
	"time"
)

// DownloadBase is the KEYONE download root. Overridable via
// KEYONE_BRIDGE_DOWNLOAD_BASE for a self-hosted/staging mirror (and for tests).
func DownloadBase() string {
	if b := os.Getenv("KEYONE_BRIDGE_DOWNLOAD_BASE"); b != "" {
		return strings.TrimRight(b, "/")
	}
	return "https://wkeyone.app/downloads/keyone-bridge"
}

// PlatformAsset is one platform's downloadable in version.json.
type PlatformAsset struct {
	File   string `json:"file"`   // path relative to the download base
	SHA256 string `json:"sha256"` // lower-case hex
	Size   int64  `json:"size"`
}

// Release is the KEYONE version manifest.
type Release struct {
	Version    string                   `json:"version"`
	ReleasedAt string                   `json:"released"`
	Platforms  map[string]PlatformAsset `json:"platforms"`
}

// platformKey is the current os_arch key, e.g. "linux_amd64", "windows_amd64".
func platformKey() string { return runtime.GOOS + "_" + runtime.GOARCH }

// CheckLatest fetches the KEYONE version manifest. Returns (nil,nil) if the
// channel is unreachable/absent — never an error the CLI must treat as fatal.
func CheckLatest(ctx context.Context) (*Release, error) {
	url := DownloadBase() + "/version.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("version check status %d", resp.StatusCode)
	}
	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	if rel.Version == "" {
		return nil, nil
	}
	return &rel, nil
}

// IsNewer reports whether tag is a newer version than current (naive semver-ish
// compare after normalising a leading "v").
func IsNewer(current, tag string) bool {
	return norm(tag) != "" && norm(tag) != norm(current) && norm(tag) > norm(current)
}

func norm(v string) string { return strings.TrimPrefix(strings.TrimSpace(v), "v") }

// RunCLI implements `keyone-bridge update [--rollback]`: roll back to the prior
// binary, or check KEYONE and (if newer) apply. Safe when no channel is set.
func RunCLI(current string, args []string) error {
	for _, a := range args {
		if a == "--rollback" || a == "rollback" {
			return Rollback()
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	rel, err := CheckLatest(ctx)
	if err != nil {
		return fmt.Errorf("update check failed: %w", err)
	}
	if rel == nil {
		fmt.Printf("No update available from KEYONE. Current: %s\n", current)
		return nil
	}
	if !IsNewer(current, rel.Version) {
		fmt.Printf("Up to date (%s). Latest on KEYONE: %s\n", current, rel.Version)
		return nil
	}
	fmt.Printf("Update available: %s → %s (from KEYONE)\n", current, rel.Version)
	if os.Getenv("KEYONE_BRIDGE_AUTO_APPLY") == "1" {
		return Apply(ctx, rel)
	}
	fmt.Println("Run with KEYONE_BRIDGE_AUTO_APPLY=1 to download + apply (SHA-256 verified, atomic swap + rollback).")
	return nil
}
