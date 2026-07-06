package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// Rotation errors the caller must handle distinctly.
var (
	// ErrRotateConflict — a concurrent rotation won; re-read the stored token and
	// retry later (409).
	ErrRotateConflict = errors.New("cloud: rotate conflict, retry")
	// ErrRotateUnauthorized — the presented token is invalid/revoked (401). The
	// Bridge must be re-linked (`keyone-bridge login`).
	ErrRotateUnauthorized = errors.New("cloud: rotate unauthorized (re-link required)")
)

// RotateToken exchanges the current Bridge token for a fresh one. On success the
// OLD token is revoked server-side, so the caller MUST persist the returned token
// durably before it is used again. Presenting the old token afterwards trips the
// Cloud's reuse-detection and revokes the whole Bridge.
func RotateToken(ctx context.Context, apiBase, current string) (string, error) {
	url := strings.TrimRight(apiBase, "/") + "/api/bridge/v1/token/rotate"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+current)
	resp, err := (&http.Client{Timeout: 20 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		var body struct {
			BridgeToken string `json:"bridge_token"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
			return "", err
		}
		if body.BridgeToken == "" {
			return "", fmt.Errorf("cloud: rotate returned empty token")
		}
		return body.BridgeToken, nil
	case http.StatusConflict:
		return "", ErrRotateConflict
	case http.StatusUnauthorized:
		return "", ErrRotateUnauthorized
	case http.StatusNotFound:
		return "", fmt.Errorf("cloud: bridge disabled (BRIDGE_ENABLED off)")
	default:
		return "", fmt.Errorf("cloud: rotate status %d", resp.StatusCode)
	}
}
