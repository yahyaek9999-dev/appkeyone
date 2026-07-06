package supervisor

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/keyone/keyone-bridge/internal/config"
	"github.com/keyone/keyone-bridge/internal/logging"
	"github.com/keyone/keyone-bridge/internal/queue"
	"github.com/keyone/keyone-bridge/internal/secret"
	"github.com/keyone/keyone-bridge/internal/transport"
	"github.com/keyone/keyone-bridge/internal/transport/fake"
)

// TestIdleFootprint boots a full supervisor (fake provider) against a mock
// gateway, lets it idle, and asserts the Go heap stays comfortably under the
// <150MB budget from the spec. It also logs the numbers for the perf report.
func TestIdleFootprint(t *testing.T) {
	if testing.Short() {
		t.Skip("footprint test skipped in -short")
	}
	t.Setenv("KEYONE_BRIDGE_SECRET_FILE", "1")
	t.Setenv("KEYONE_BRIDGE_ROTATE_HOURS", "0") // no rotation during the test

	mg := newMockGateway()
	srv := httptest.NewServer(http.HandlerFunc(mg.handler))
	defer srv.Close()

	dir := t.TempDir()
	cfg := config.Default()
	cfg.BridgeID, cfg.WorkspaceID = "b1", "u1"
	cfg.CloudWSURL = "ws" + strings.TrimPrefix(srv.URL, "http")
	cfg.Providers = []string{"fake"}
	log := logging.New("", logging.LevelError)
	store := secret.New(dir)
	_ = store.Set(TokenKey, "tok")
	q, _ := queue.Open(filepath.Join(dir, "q.jsonl"), 100)
	fp := &fake.Provider{}
	_ = fp.Init(context.Background(), transport.ProviderConfig{DataDir: dir, Log: log})

	sup := New(cfg, log, store, q, map[string]transport.Provider{"fake": fp})
	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = sup.Run(ctx) }()

	<-mg.gotHello                      // connected
	time.Sleep(500 * time.Millisecond) // settle idle

	runtime.GC()
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	cancel()

	heapMB := float64(m.HeapAlloc) / (1 << 20)
	sysMB := float64(m.Sys) / (1 << 20)
	t.Logf("idle footprint: HeapAlloc=%.1fMB HeapSys=%.1fMB Sys(total from OS)=%.1fMB goroutines=%d",
		heapMB, float64(m.HeapSys)/(1<<20), sysMB, runtime.NumGoroutine())

	if sysMB >= 150 {
		t.Fatalf("idle Sys memory %.1fMB exceeds 150MB budget", sysMB)
	}
}
