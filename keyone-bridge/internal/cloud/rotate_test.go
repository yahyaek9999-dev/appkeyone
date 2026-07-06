package cloud

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRotateToken(t *testing.T) {
	cases := []struct {
		name    string
		status  int
		body    map[string]string
		wantTok string
		wantErr error
	}{
		{"success", 200, map[string]string{"bridge_token": "new-tok"}, "new-tok", nil},
		{"conflict", 409, map[string]string{"error": "conflict_retry"}, "", ErrRotateConflict},
		{"reuse", 401, map[string]string{"error": "token_reuse_detected"}, "", ErrRotateUnauthorized},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Header.Get("Authorization") != "Bearer cur-tok" {
					w.WriteHeader(401)
					return
				}
				w.WriteHeader(c.status)
				_ = json.NewEncoder(w).Encode(c.body)
			}))
			defer srv.Close()
			tok, err := RotateToken(context.Background(), srv.URL, "cur-tok")
			if c.wantErr != nil {
				if !errors.Is(err, c.wantErr) {
					t.Fatalf("err = %v, want %v", err, c.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected err %v", err)
			}
			if tok != c.wantTok {
				t.Fatalf("token = %q, want %q", tok, c.wantTok)
			}
		})
	}
}
