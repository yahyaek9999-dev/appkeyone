// Package supervisor wires the transport-agnostic core together: it links each
// provider's Event stream to the Cloud, routes Cloud outbound to the right
// provider (buffering to a durable offline queue when a provider is down), and
// keeps the Cloud WebSocket alive. It knows nothing WhatsApp-specific.
package supervisor

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/keyone/keyone-bridge/internal/cloud"
	"github.com/keyone/keyone-bridge/internal/config"
	"github.com/keyone/keyone-bridge/internal/logging"
	"github.com/keyone/keyone-bridge/internal/protocol"
	"github.com/keyone/keyone-bridge/internal/queue"
	"github.com/keyone/keyone-bridge/internal/secret"
	"github.com/keyone/keyone-bridge/internal/transport"
)

// TokenKey is the secret-store key under which the BridgeToken lives.
const TokenKey = "bridge_token"

// Supervisor owns the running Bridge.
type Supervisor struct {
	cfg    *config.Config
	log    *logging.Logger
	store  *secret.Store
	q      *queue.Queue
	client *cloud.Client

	mu        sync.RWMutex
	providers map[string]transport.Provider
}

// New builds a Supervisor for the given config. Providers must already be
// constructed + Init'd and keyed by their Name().
func New(cfg *config.Config, log *logging.Logger, store *secret.Store, q *queue.Queue, providers map[string]transport.Provider) *Supervisor {
	return &Supervisor{cfg: cfg, log: log, store: store, q: q, providers: providers}
}

// Run starts every provider, connects to the Cloud, and blocks until ctx is done.
func (s *Supervisor) Run(ctx context.Context) error {
	if !s.cfg.Linked() {
		return fmt.Errorf("bridge is not linked — run `keyone-bridge login` first")
	}

	hello := protocol.HelloPayload{
		ProtocolVersion: protocol.Version,
		Version:         Version,
		OS:              config.OSName(),
		Arch:            config.Arch(),
		Providers:       providerNames(s.providers),
	}

	s.client = cloud.NewClient(s.cfg.CloudWSURL, s.tokenProvider, hello, s.log, cloud.Handlers{
		OnOutbound:  s.onOutbound,
		OnStartLink: s.onStartLink,
		OnControl:   s.onControl,
		OnConnected: func() { go s.drainQueue(ctx) },
	})

	// Start providers + pump their events to the Cloud.
	for name, p := range s.providers {
		if err := p.Start(ctx); err != nil {
			s.log.Errorf("provider %s start: %v", name, err)
		}
		go s.pumpEvents(ctx, name, p)
	}

	// Periodic queue drain (covers provider-reconnect without a Cloud reconnect).
	go s.drainLoop(ctx)
	// Periodic secure token rotation.
	go s.rotateLoop(ctx)
	// Stream logs to the Cloud for the Dashboard log viewer.
	go s.shipLogs(ctx)

	s.client.Run(ctx) // blocks until ctx cancelled
	return s.shutdown()
}

func (s *Supervisor) tokenProvider() (string, error) {
	return s.store.Get(TokenKey)
}

// pumpEvents forwards a provider's events to the Cloud.
func (s *Supervisor) pumpEvents(ctx context.Context, name string, p transport.Provider) {
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-p.Events():
			if !ok {
				return
			}
			s.handleEvent(name, ev)
		}
	}
}

func (s *Supervisor) handleEvent(provider string, ev transport.Event) {
	switch ev.Type {
	case transport.EventInbound:
		if ev.Inbound == nil {
			return
		}
		in := ev.Inbound
		err := s.client.SendInbound(protocol.InboundPayload{
			Provider:          provider,
			From:              protocol.FromRef{Phone: in.From, Name: in.FromName},
			MediaType:         orDefault(in.MediaType, "text"),
			Text:              in.Text,
			MediaBase64:       in.MediaBase64,
			Mimetype:          in.Mimetype,
			ProviderMessageID: in.ProviderMessageID,
			ProviderTimestamp: in.Timestamp,
		})
		if err != nil {
			s.log.Warnf("inbound not delivered to cloud (link down): %v", err)
		}
	case transport.EventStateChange:
		if ev.State == nil {
			return
		}
		_ = s.client.SendState(protocol.StatePayload{Provider: provider, State: string(*ev.State), Identity: ev.Identity})
	case transport.EventLinkArtifact:
		if ev.Link == nil {
			return
		}
		_ = s.client.SendLinkArtifact(protocol.LinkArtifactPayload{
			Provider: provider, Kind: ev.Link.Kind, Data: ev.Link.Data, ExpiresAt: ev.Link.ExpiresAt,
		})
		s.log.Infof("streamed %s link artifact for %s", ev.Link.Kind, provider)
	case transport.EventError:
		if ev.Err != nil {
			s.log.Warnf("provider %s error: %v", provider, ev.Err)
		}
	case transport.EventLog:
		s.log.Debugf("provider %s: %s", provider, ev.Log)
	}
}

// onOutbound is called by the Cloud client for each `outbound` frame.
func (s *Supervisor) onOutbound(p protocol.OutboundPayload) protocol.OutboundAckPayload {
	prov := s.provider(p.Provider)
	if prov == nil {
		return protocol.OutboundAckPayload{OK: false, Error: "unknown_provider"}
	}
	if prov.State() != transport.StateConnected {
		// Provider down — persist for guaranteed later delivery, ack accepted.
		s.enqueue(p)
		return protocol.OutboundAckPayload{OK: true}
	}
	ack, err := prov.Send(context.Background(), transport.OutboundMessage{To: p.To, Text: p.Text})
	if err != nil {
		s.log.Warnf("send via %s failed, queuing: %v", p.Provider, err)
		s.enqueue(p)
		return protocol.OutboundAckPayload{OK: true} // queued for retry
	}
	return protocol.OutboundAckPayload{OK: true, ProviderMessageID: ack.ProviderMessageID}
}

func (s *Supervisor) onStartLink(provider string) {
	prov := s.provider(provider)
	if prov == nil {
		s.log.Warnf("start_link for unknown provider %q", provider)
		return
	}
	if err := prov.StartLink(context.Background()); err != nil {
		s.log.Errorf("start_link %s: %v", provider, err)
	}
}

func (s *Supervisor) enqueue(p protocol.OutboundPayload) {
	dropped, err := s.q.Enqueue(queue.Item{
		ID: newID(), Provider: p.Provider, To: p.To, Text: p.Text, EnqueuedAt: time.Now().Unix(),
	})
	if err != nil {
		s.log.Errorf("enqueue outbound: %v", err)
	}
	if dropped {
		s.log.Warnf("offline queue full — oldest message dropped")
	}
}

func (s *Supervisor) drainLoop(ctx context.Context) {
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.drainQueue(ctx)
		}
	}
}

// drainQueue delivers buffered outbound while providers are connected.
func (s *Supervisor) drainQueue(ctx context.Context) {
	for s.q.Len() > 0 {
		if ctx.Err() != nil {
			return
		}
		it, ok := s.q.Peek()
		if !ok {
			return
		}
		prov := s.provider(it.Provider)
		if prov == nil {
			_ = s.q.Ack() // undeliverable provider — drop
			continue
		}
		if prov.State() != transport.StateConnected {
			return // wait for reconnection
		}
		if _, err := prov.Send(ctx, transport.OutboundMessage{To: it.To, Text: it.Text}); err != nil {
			if it.Attempts >= 5 {
				s.log.Warnf("dropping outbound after %d attempts: %v", it.Attempts, err)
				_ = s.q.Ack()
			} else {
				_ = s.q.Requeue()
			}
			return
		}
		_ = s.q.Ack()
	}
}

func (s *Supervisor) shutdown() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	for name, p := range s.providers {
		if err := p.Stop(ctx); err != nil {
			s.log.Warnf("stop provider %s: %v", name, err)
		}
	}
	return nil
}

func (s *Supervisor) provider(name string) transport.Provider {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if p, ok := s.providers[name]; ok {
		return p
	}
	// Single-provider convenience: route to the only provider if unnamed.
	if name == "" && len(s.providers) == 1 {
		for _, p := range s.providers {
			return p
		}
	}
	return nil
}

func providerNames(m map[string]transport.Provider) []string {
	out := make([]string, 0, len(m))
	for n := range m {
		out = append(out, n)
	}
	return out
}

func orDefault(v, d string) string {
	if v == "" {
		return d
	}
	return v
}
