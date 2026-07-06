// Package updater checks GitHub Releases for a newer Bridge and (Phase 5) applies
// it via a signed, atomic swap with rollback. This file provides the check +
// the CLI entry point; apply.go performs the download/verify/swap.
package updater

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"
)

// Repo is the GitHub "owner/name" that publishes Bridge releases. Overridable via
// KEYONE_BRIDGE_REPO so a self-hosted fork can point elsewhere.
func Repo() string {
	if r := os.Getenv("KEYONE_BRIDGE_REPO"); r != "" {
		return r
	}
	return "yahyaek9999-dev/keyone-bridge"
}

// Release is the subset of the GitHub release API we consume.
type Release struct {
	TagName string  `json:"tag_name"`
	HTMLURL string  `json:"html_url"`
	Assets  []Asset `json:"assets"`
}

// Asset is a downloadable release artifact.
type Asset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// CheckLatest returns the latest published release, or (nil,nil) if the channel
// is unreachable/empty (never an error the CLI must treat as fatal).
func CheckLatest(ctx context.Context) (*Release, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/releases/latest", Repo())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, nil // no releases yet
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("release check status %d", resp.StatusCode)
	}
	var rel Release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return nil, err
	}
	return &rel, nil
}

// IsNewer reports whether tag is a newer version than current (naive semver-ish
// string compare after normalising a leading "v").
func IsNewer(current, tag string) bool {
	return norm(tag) != "" && norm(tag) != norm(current) && norm(tag) > norm(current)
}

func norm(v string) string { return strings.TrimPrefix(strings.TrimSpace(v), "v") }

// RunCLI implements `keyone-bridge update [--rollback]`: roll back to the prior
// binary, or check and (if newer) apply an update. Safe when no channel is set.
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
		fmt.Printf("No releases published yet for %s. Current: %s\n", Repo(), current)
		return nil
	}
	if !IsNewer(current, rel.TagName) {
		fmt.Printf("Up to date (%s). Latest published: %s\n", current, rel.TagName)
		return nil
	}
	fmt.Printf("Update available: %s → %s\n  %s\n", current, rel.TagName, rel.HTMLURL)
	if os.Getenv("KEYONE_BRIDGE_AUTO_APPLY") == "1" {
		return Apply(ctx, rel)
	}
	fmt.Println("Run with KEYONE_BRIDGE_AUTO_APPLY=1 to download + apply (atomic swap + rollback).")
	return nil
}
