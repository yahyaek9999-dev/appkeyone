// Package fake is a transport-less Provider used for tests and for validating
// the Cloud protocol end-to-end without a real messaging account. It implements
// the exact same transport.Provider contract as the WhatsApp provider, proving
// the core is genuinely transport-agnostic.
package fake

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/keyone/keyone-bridge/internal/transport"
)

// Name is the provider name under which this registers.
const Name = transport.ProviderName("fake")

func init() {
	transport.Register(Name, func() transport.Provider { return &Provider{} })
}

// Provider is a fake transport that "connects" instantly and echoes sends.
type Provider struct {
	cfg    transport.ProviderConfig
	mu     sync.Mutex
	state  transport.ConnectionState
	events chan transport.Event
	seq    int
}

func (p *Provider) Name() transport.ProviderName { return Name }
func (p *Provider) Version() string              { return "fake-1" }

func (p *Provider) Capabilities() transport.Capabilities {
	return transport.Capabilities{SendText: true, LinkMethod: transport.LinkQR}
}

func (p *Provider) Init(_ context.Context, cfg transport.ProviderConfig) error {
	p.cfg = cfg
	p.events = make(chan transport.Event, 32)
	p.state = transport.StateInit
	return nil
}

func (p *Provider) Start(_ context.Context) error {
	p.setState(transport.StateConnected, "+10000000000")
	return nil
}

func (p *Provider) Stop(_ context.Context) error {
	p.setState(transport.StateDisconnected, "")
	return nil
}

func (p *Provider) Logout(_ context.Context) error {
	p.setState(transport.StateLoggedOut, "")
	return nil
}

// StartLink emits a fake QR artifact then "connects".
func (p *Provider) StartLink(_ context.Context) error {
	p.setState(transport.StateLinking, "")
	p.emit(transport.Event{Type: transport.EventLinkArtifact, Link: &transport.LinkArtifact{
		Kind: "qr", Data: "FAKE-QR-" + time.Now().Format("150405"), ExpiresAt: time.Now().Add(20 * time.Second).UnixMilli(),
	}})
	p.setState(transport.StateConnected, "+10000000000")
	return nil
}

func (p *Provider) Send(_ context.Context, msg transport.OutboundMessage) (transport.Ack, error) {
	if p.State() != transport.StateConnected {
		return transport.Ack{}, fmt.Errorf("fake: not connected")
	}
	p.mu.Lock()
	p.seq++
	id := fmt.Sprintf("fake-msg-%d", p.seq)
	p.mu.Unlock()
	return transport.Ack{ProviderMessageID: id}, nil
}

func (p *Provider) Events() <-chan transport.Event { return p.events }

func (p *Provider) State() transport.ConnectionState {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.state
}

// InjectInbound is a test helper that simulates a received message.
func (p *Provider) InjectInbound(from, text string) {
	p.emit(transport.Event{Type: transport.EventInbound, Inbound: &transport.InboundMessage{
		From: from, FromName: "Fake", Text: text, MediaType: "text", ProviderMessageID: "in-" + time.Now().Format("150405.000"), Timestamp: time.Now().Unix(),
	}})
}

func (p *Provider) setState(st transport.ConnectionState, identity string) {
	p.mu.Lock()
	p.state = st
	p.mu.Unlock()
	p.emit(transport.Event{Type: transport.EventStateChange, State: &st, Identity: identity})
}

func (p *Provider) emit(ev transport.Event) {
	if p.events == nil {
		return
	}
	select {
	case p.events <- ev:
	default: // drop if the consumer is slow — never block the provider
	}
}
