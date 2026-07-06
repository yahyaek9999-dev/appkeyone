package supervisor

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	"github.com/keyone/keyone-bridge/internal/config"
	"github.com/keyone/keyone-bridge/internal/logging"
	"github.com/keyone/keyone-bridge/internal/protocol"
	"github.com/keyone/keyone-bridge/internal/queue"
	"github.com/keyone/keyone-bridge/internal/secret"
	"github.com/keyone/keyone-bridge/internal/transport"
	"github.com/keyone/keyone-bridge/internal/transport/fake"
)

// mockGateway records what the Bridge sends and lets the test push outbound.
type mockGateway struct {
	gotAck     chan protocol.OutboundAckPayload
	gotInbound chan protocol.InboundPayload
	gotHello   chan protocol.HelloPayload
	sendOut    chan protocol.OutboundPayload
}

func newMockGateway() *mockGateway {
	return &mockGateway{
		gotAck:     make(chan protocol.OutboundAckPayload, 4),
		gotInbound: make(chan protocol.InboundPayload, 4),
		gotHello:   make(chan protocol.HelloPayload, 1),
		sendOut:    make(chan protocol.OutboundPayload, 4),
	}
}

func (m *mockGateway) handler(w http.ResponseWriter, r *http.Request) {
	up := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	conn, err := up.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	// pump test-initiated outbound frames to the bridge
	go func() {
		for p := range m.sendOut {
			f, _ := protocol.NewFrame(protocol.TypeOutbound, p)
			_ = conn.WriteJSON(f)
		}
	}()

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var f protocol.Frame
		if json.Unmarshal(data, &f) != nil {
			continue
		}
		switch f.Type {
		case protocol.TypeHello:
			var h protocol.HelloPayload
			_ = f.Decode(&h)
			select {
			case m.gotHello <- h:
			default:
			}
			ack, _ := protocol.Reply(&f, protocol.TypeHelloAck, map[string]bool{"ok": true})
			_ = conn.WriteJSON(ack)
		case protocol.TypeHeartbeat:
			ack, _ := protocol.Reply(&f, protocol.TypeHeartbeatAck, map[string]bool{"ok": true})
			_ = conn.WriteJSON(ack)
		case protocol.TypeInbound:
			var p protocol.InboundPayload
			_ = f.Decode(&p)
			m.gotInbound <- p
			ack, _ := protocol.Reply(&f, protocol.TypeInboundAck, map[string]bool{"ok": true})
			_ = conn.WriteJSON(ack)
		case protocol.TypeOutboundAck:
			var p protocol.OutboundAckPayload
			_ = f.Decode(&p)
			p.OK = true
			m.gotAck <- p
		case protocol.TypeOutboundNack:
			var p protocol.OutboundAckPayload
			_ = f.Decode(&p)
			m.gotAck <- p
		}
	}
}

func TestSupervisorRelayEndToEnd(t *testing.T) {
	t.Setenv("KEYONE_BRIDGE_SECRET_FILE", "1")

	mg := newMockGateway()
	srv := httptest.NewServer(http.HandlerFunc(mg.handler))
	defer srv.Close()
	wsURL := "ws" + strings.TrimPrefix(srv.URL, "http")

	dir := t.TempDir()
	cfg := config.Default()
	cfg.BridgeID = "b1"
	cfg.WorkspaceID = "u1"
	cfg.CloudWSURL = wsURL
	cfg.Providers = []string{"fake"}

	log := logging.New("", logging.LevelError)
	store := secret.New(dir)
	if err := store.Set(TokenKey, "test-token"); err != nil {
		t.Fatal(err)
	}
	q, err := queue.Open(filepath.Join(dir, "q.jsonl"), 100)
	if err != nil {
		t.Fatal(err)
	}

	fp := &fake.Provider{}
	if err := fp.Init(context.Background(), transport.ProviderConfig{DataDir: dir, Log: log}); err != nil {
		t.Fatal(err)
	}
	providers := map[string]transport.Provider{"fake": fp}

	sup := New(cfg, log, store, q, providers)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = sup.Run(ctx) }()

	// 1. hello arrives with the provider list
	select {
	case h := <-mg.gotHello:
		if len(h.Providers) != 1 || h.Providers[0] != "fake" {
			t.Fatalf("hello providers = %v", h.Providers)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for hello")
	}

	// 2. Cloud -> outbound -> fake provider -> outbound_ack (ok)
	mg.sendOut <- protocol.OutboundPayload{Provider: "fake", To: "201111", Text: "hi from cloud"}
	select {
	case ack := <-mg.gotAck:
		if !ack.OK {
			t.Fatalf("outbound not ok: %+v", ack)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for outbound_ack")
	}

	// 3. provider inbound -> Cloud inbound frame
	fp.InjectInbound("201999", "hi from customer")
	select {
	case in := <-mg.gotInbound:
		if in.Text != "hi from customer" || in.From.Phone != "201999" || in.Provider != "fake" {
			t.Fatalf("unexpected inbound: %+v", in)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("timeout waiting for inbound")
	}
}

func TestOfflineQueueDrainsOnProviderRecovery(t *testing.T) {
	// An outbound accepted while the provider is disconnected is queued and then
	// delivered once the provider reconnects.
	t.Setenv("KEYONE_BRIDGE_SECRET_FILE", "1")
	dir := t.TempDir()
	log := logging.New("", logging.LevelError)
	q, _ := queue.Open(filepath.Join(dir, "q.jsonl"), 100)

	fp := &fake.Provider{}
	_ = fp.Init(context.Background(), transport.ProviderConfig{DataDir: dir, Log: log})
	// provider NOT started → StateInit (not connected)

	s := &Supervisor{cfg: config.Default(), log: log, store: secret.New(dir), q: q,
		providers: map[string]transport.Provider{"fake": fp}}

	ack := s.onOutbound(protocol.OutboundPayload{Provider: "fake", To: "x", Text: "queued"})
	if !ack.OK {
		t.Fatalf("expected accepted (queued) ack, got %+v", ack)
	}
	if q.Len() != 1 {
		t.Fatalf("expected 1 queued, got %d", q.Len())
	}

	// provider comes up; drain delivers it
	_ = fp.Start(context.Background())
	s.drainQueue(context.Background())
	if q.Len() != 0 {
		t.Fatalf("expected queue drained, got %d", q.Len())
	}
}
