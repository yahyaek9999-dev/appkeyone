// Package cloud implements the Bridge side of the Cloud contract: the RFC 8628
// device-code + PKCE linking flow (link.go) and the protocol-v1 WebSocket client
// (client.go). It never stores anything in the clear — the returned token is
// handed straight to the secret store by the caller.
package cloud

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// StartResponse is the device/start reply (RFC 8628).
type StartResponse struct {
	DeviceCode      string `json:"device_code"`
	UserCode        string `json:"user_code"`
	VerificationURI string `json:"verification_uri"`
	Interval        int    `json:"interval"`
	ExpiresIn       int    `json:"expires_in"`
}

// TokenResponse is the successful device/token reply.
type TokenResponse struct {
	BridgeID        string `json:"bridge_id"`
	BridgeToken     string `json:"bridge_token"`
	HeartbeatSecret string `json:"heartbeat_secret"`
	WorkspaceID     string `json:"workspace_id"`
}

// LinkResult carries everything the caller must persist after a successful link.
type LinkResult struct {
	Token           TokenResponse
	VerificationURL string // full URL the user approved at
	UserCode        string
}

// Linker runs the device-code flow against a Cloud API base.
type Linker struct {
	APIBase string
	HTTP    *http.Client
	// Prompt is called once with the URL + user code so the CLI can display them.
	Prompt func(url, userCode string, expiresIn int)
}

// NewLinker returns a Linker with a sane HTTP client.
func NewLinker(apiBase string) *Linker {
	return &Linker{APIBase: strings.TrimRight(apiBase, "/"), HTTP: &http.Client{Timeout: 20 * time.Second}}
}

// pkce generates an RFC 7636 verifier and its S256 challenge (BASE64URL(SHA256)).
func pkce() (verifier, challenge string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	verifier = base64.RawURLEncoding.EncodeToString(b)
	sum := sha256.Sum256([]byte(verifier))
	challenge = base64.RawURLEncoding.EncodeToString(sum[:])
	return verifier, challenge, nil
}

// Link performs the full device-code + PKCE exchange. It blocks (polling) until
// the workspace owner approves in the browser, the code expires, or ctx is done.
func (l *Linker) Link(ctx context.Context, providers []string, name string) (*LinkResult, error) {
	verifier, challenge, err := pkce()
	if err != nil {
		return nil, err
	}

	// 1. device/start
	var start StartResponse
	if err := l.postJSON(ctx, "/api/bridge/v1/device/start", map[string]any{
		"codeChallenge": challenge,
		"providers":     providers,
		"name":          name,
	}, &start); err != nil {
		return nil, fmt.Errorf("device/start: %w", err)
	}

	url := start.VerificationURI
	if strings.HasPrefix(url, "/") {
		url = l.APIBase + url
	}
	if l.Prompt != nil {
		l.Prompt(url, start.UserCode, start.ExpiresIn)
	}

	// 2. poll device/token
	interval := time.Duration(maxInt(start.Interval, 3)) * time.Second
	deadline := time.Now().Add(time.Duration(maxInt(start.ExpiresIn, 60)) * time.Second)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-ticker.C:
		}
		if time.Now().After(deadline) {
			return nil, fmt.Errorf("device link timed out; restart `keyone-bridge login`")
		}

		var tok TokenResponse
		status, apiErr, err := l.postToken(ctx, start.DeviceCode, verifier, &tok)
		if err != nil {
			return nil, err // network/transport error
		}
		switch {
		case status == 200 && tok.BridgeToken != "":
			return &LinkResult{Token: tok, VerificationURL: url, UserCode: start.UserCode}, nil
		case apiErr == "authorization_pending":
			continue // owner hasn't approved yet
		case apiErr == "slow_down":
			interval += 2 * time.Second
			ticker.Reset(interval)
		case apiErr == "expired_token":
			return nil, fmt.Errorf("device code expired; restart login")
		default:
			return nil, fmt.Errorf("device/token rejected: %s", apiErr)
		}
	}
}

// postToken posts one poll and returns (status, apiError, transportError).
func (l *Linker) postToken(ctx context.Context, deviceCode, verifier string, out *TokenResponse) (int, string, error) {
	body, _ := json.Marshal(map[string]string{"device_code": deviceCode, "code_verifier": verifier})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.APIBase+"/api/bridge/v1/device/token", bytes.NewReader(body))
	if err != nil {
		return 0, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := l.HTTP.Do(req)
	if err != nil {
		return 0, "", err
	}
	defer resp.Body.Close()
	var raw map[string]json.RawMessage
	_ = json.NewDecoder(resp.Body).Decode(&raw)
	if resp.StatusCode == 200 {
		full, _ := json.Marshal(raw)
		_ = json.Unmarshal(full, out)
		return 200, "", nil
	}
	apiErr := ""
	if e, ok := raw["error"]; ok {
		_ = json.Unmarshal(e, &apiErr)
	}
	return resp.StatusCode, apiErr, nil
}

func (l *Linker) postJSON(ctx context.Context, path string, in any, out any) error {
	body, _ := json.Marshal(in)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.APIBase+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := l.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return fmt.Errorf("Bridge is not enabled on the Cloud (BRIDGE_ENABLED off)")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
