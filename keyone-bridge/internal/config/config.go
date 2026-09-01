// Package config holds the Bridge's non-secret configuration and resolves the
// per-OS data directory. Secrets (the BridgeToken) are NEVER stored here — they
// live in the OS keychain via internal/secret.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
)

// Config is the persisted, non-secret Bridge configuration.
type Config struct {
	// Identity assigned by the Cloud during device-code linking.
	WorkspaceID string `json:"workspaceId"`
	BridgeID    string `json:"bridgeId"`

	// Cloud endpoints.
	CloudAPIBase string `json:"cloudApiBase"` // e.g. https://w.keyone1.com
	CloudWSURL   string `json:"cloudWsUrl"`   // e.g. wss://w.keyone1.com/bridge

	// Which providers this Bridge should host.
	Providers []string `json:"providers"`

	// Cosmetic.
	Name string `json:"name,omitempty"`
}

// Default returns a config with sane defaults for a fresh install.
func Default() *Config {
	return &Config{
		CloudAPIBase: "https://wkeyone.app",
		CloudWSURL:   "wss://wkeyone.app/bridge",
		Providers:    []string{"whatsapp"},
	}
}

// DataDir returns (and creates) the per-OS data directory for the Bridge.
//
//	macOS:   ~/Library/Application Support/keyone-bridge
//	Linux:   $XDG_CONFIG_HOME/keyone-bridge (or ~/.config/keyone-bridge)
//	Windows: %AppData%\keyone-bridge
//
// KEYONE_BRIDGE_HOME overrides everything (useful for a service account/tests).
func DataDir() (string, error) {
	if h := os.Getenv("KEYONE_BRIDGE_HOME"); h != "" {
		return h, ensureDir(h)
	}
	base, err := os.UserConfigDir()
	if err != nil {
		home, herr := os.UserHomeDir()
		if herr != nil {
			return "", err
		}
		base = filepath.Join(home, ".keyone-bridge")
	}
	dir := filepath.Join(base, "keyone-bridge")
	return dir, ensureDir(dir)
}

// ProviderDataDir returns (and creates) a provider-private subdirectory for its
// encrypted local session/store.
func ProviderDataDir(provider string) (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	pdir := filepath.Join(dir, "providers", provider)
	return pdir, ensureDir(pdir)
}

func configPath() (string, error) {
	dir, err := DataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// Load reads config.json, or returns Default() if none exists yet.
func Load() (*Config, error) {
	p, err := configPath()
	if err != nil {
		return nil, err
	}
	b, err := os.ReadFile(p)
	if os.IsNotExist(err) {
		return Default(), nil
	}
	if err != nil {
		return nil, err
	}
	cfg := Default()
	if err := json.Unmarshal(b, cfg); err != nil {
		return nil, err
	}
	return cfg, nil
}

// Save writes config.json atomically (write temp + rename), 0600.
func (c *Config) Save() error {
	p, err := configPath()
	if err != nil {
		return err
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, p)
}

// Linked reports whether this Bridge has completed device linking.
func (c *Config) Linked() bool { return c.BridgeID != "" && c.WorkspaceID != "" }

// OSName / Arch expose the running platform for the hello frame.
func OSName() string { return runtime.GOOS }
func Arch() string   { return runtime.GOARCH }

func ensureDir(d string) error { return os.MkdirAll(d, 0o700) }
