package cloud

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// ProbeResult is the outcome of a connectivity probe.
type ProbeResult struct {
	APIReachable bool
	WSReachable  bool
	WSAuthorized bool
	Detail       string
}

// Probe checks Cloud API + WebSocket reachability + token acceptance without
// starting a full session. Used by `keyone-bridge doctor`.
func Probe(ctx context.Context, apiBase, wsURL, token string) ProbeResult {
	r := ProbeResult{}

	// API: GET /api/health (public, always 200 when up).
	hctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(hctx, http.MethodGet, strings.TrimRight(apiBase, "/")+"/api/health", nil)
	if resp, err := (&http.Client{}).Do(req); err == nil {
		resp.Body.Close()
		r.APIReachable = resp.StatusCode == 200
	} else {
		r.Detail = err.Error()
	}

	// WS: dial the gateway. Success ⇒ reachable + authorized. A bad-handshake
	// (typically HTTP 401 at upgrade) ⇒ reachable but token rejected.
	dctx, dcancel := context.WithTimeout(ctx, 10*time.Second)
	defer dcancel()
	hdr := http.Header{}
	if token != "" {
		hdr.Set("Authorization", "Bearer "+token)
	}
	conn, resp, err := (&websocket.Dialer{HandshakeTimeout: 10 * time.Second}).DialContext(dctx, wsURL, hdr)
	if err == nil {
		r.WSReachable = true
		r.WSAuthorized = true
		_ = conn.Close()
		return r
	}
	if errors.Is(err, websocket.ErrBadHandshake) || (resp != nil && resp.StatusCode == http.StatusUnauthorized) {
		r.WSReachable = true // the server answered, it just rejected the token
		r.WSAuthorized = false
		return r
	}
	if r.Detail == "" {
		r.Detail = err.Error()
	}
	return r
}
