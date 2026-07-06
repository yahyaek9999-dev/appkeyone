// Package whatsapp is the WhatsApp transport Provider, backed by whatsmeow. It
// is a plugin: it self-registers under the name "whatsapp" and implements the
// transport.Provider contract, so the core supervises it without knowing
// anything WhatsApp-specific. The local encrypted session (whatsmeow's SQLite
// store) NEVER leaves the host; only the QR string and connection state transit
// to the Cloud.
//
// SQLite is provided by the cgo-free modernc.org/sqlite driver so the Bridge
// cross-compiles to every target without a C toolchain.
package whatsapp

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"
	"sync"
	"time"

	"github.com/keyone/keyone-bridge/internal/transport"

	_ "modernc.org/sqlite"

	"go.mau.fi/whatsmeow"
	waProto "go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

// Name is the provider name under which this registers.
const Name = transport.ProviderName("whatsapp")

func init() {
	transport.Register(Name, func() transport.Provider { return &Provider{} })
}

// Provider implements transport.Provider over whatsmeow.
type Provider struct {
	cfg    transport.ProviderConfig
	log    transport.Logger
	events chan transport.Event

	mu        sync.Mutex
	container *sqlstore.Container
	client    *whatsmeow.Client
	state     transport.ConnectionState
	ctx       context.Context
	cancel    context.CancelFunc
}

func (p *Provider) Name() transport.ProviderName { return Name }
func (p *Provider) Version() string              { return "whatsmeow" }

func (p *Provider) Capabilities() transport.Capabilities {
	return transport.Capabilities{SendText: true, SendMedia: false, Groups: true, Presence: true, LinkMethod: transport.LinkQR}
}

// Init opens the local encrypted store and constructs the client.
func (p *Provider) Init(ctx context.Context, cfg transport.ProviderConfig) error {
	p.cfg = cfg
	p.log = cfg.Log
	p.events = make(chan transport.Event, 128)
	p.setState(transport.StateInit, "")

	dbPath := filepath.Join(cfg.DataDir, "whatsmeow.db")
	dsn := "file:" + dbPath + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return fmt.Errorf("open store: %w", err)
	}

	dbLog := &waLogAdapter{p.log, "whatsmeow-db"}
	container := sqlstore.NewWithDB(db, "sqlite3", dbLog)
	if err := container.Upgrade(ctx); err != nil {
		return fmt.Errorf("store upgrade: %w", err)
	}
	device, err := container.GetFirstDevice(ctx)
	if err != nil {
		return fmt.Errorf("get device: %w", err)
	}
	p.container = container
	p.client = whatsmeow.NewClient(device, &waLogAdapter{p.log, "whatsmeow"})
	p.client.AddEventHandler(p.handleEvent)
	return nil
}

// Start resumes an existing session. If the host is not yet linked, it stays
// idle until the Cloud requests linking (StartLink), mirroring the locked flow
// "Dashboard → Start QR".
func (p *Provider) Start(ctx context.Context) error {
	p.mu.Lock()
	p.ctx, p.cancel = context.WithCancel(context.Background())
	client := p.client
	p.mu.Unlock()

	if client.Store.ID == nil {
		p.log.Infof("whatsapp: not linked yet — awaiting Start QR from the Dashboard")
		p.setState(transport.StateDisconnected, "")
		return nil
	}
	p.setState(transport.StateConnecting, "")
	if err := client.Connect(); err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	return nil
}

// StartLink begins QR linking: generate the QR locally, stream each code to the
// Cloud as a link artifact. The QR itself is rendered by the Dashboard.
func (p *Provider) StartLink(ctx context.Context) error {
	p.mu.Lock()
	client := p.client
	linkCtx := p.ctx
	p.mu.Unlock()

	if client.Store.ID != nil {
		p.log.Infof("whatsapp: already linked as %s", client.Store.ID.User)
		p.setState(transport.StateConnected, client.Store.ID.User)
		return nil
	}
	if linkCtx == nil {
		linkCtx = context.Background()
	}

	qrChan, err := client.GetQRChannel(linkCtx)
	if err != nil {
		return fmt.Errorf("qr channel: %w", err)
	}
	p.setState(transport.StateLinking, "")
	if err := client.Connect(); err != nil {
		return fmt.Errorf("connect for link: %w", err)
	}
	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				p.emit(transport.Event{Type: transport.EventLinkArtifact, Link: &transport.LinkArtifact{
					Kind: "qr", Data: evt.Code, ExpiresAt: time.Now().Add(evt.Timeout).UnixMilli(),
				}})
			case "success":
				p.log.Infof("whatsapp: QR scanned, link established")
			case "timeout":
				p.log.Warnf("whatsapp: QR link timed out")
				p.setState(transport.StateDisconnected, "")
			}
		}
	}()
	return nil
}

// Send delivers a text message to a phone number (digits, no +).
func (p *Provider) Send(ctx context.Context, msg transport.OutboundMessage) (transport.Ack, error) {
	p.mu.Lock()
	client := p.client
	p.mu.Unlock()
	if client == nil || client.Store.ID == nil {
		return transport.Ack{}, fmt.Errorf("whatsapp: not linked")
	}
	jid := types.NewJID(normalizeNumber(msg.To), types.DefaultUserServer)
	resp, err := client.SendMessage(ctx, jid, &waProto.Message{Conversation: proto.String(msg.Text)})
	if err != nil {
		return transport.Ack{}, err
	}
	return transport.Ack{ProviderMessageID: resp.ID}, nil
}

// Stop disconnects but keeps the local session (graceful pause).
func (p *Provider) Stop(_ context.Context) error {
	p.mu.Lock()
	client, cancel := p.client, p.cancel
	p.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	if client != nil {
		client.Disconnect()
	}
	p.setState(transport.StateDisconnected, "")
	return nil
}

// Logout wipes the local WhatsApp session (never leaves the host).
func (p *Provider) Logout(ctx context.Context) error {
	p.mu.Lock()
	client := p.client
	p.mu.Unlock()
	if client == nil {
		return nil
	}
	if client.Store.ID != nil {
		if err := client.Logout(ctx); err != nil {
			// Even if the server-side logout fails, drop the local session.
			p.log.Warnf("whatsapp: remote logout: %v", err)
		}
	}
	client.Disconnect()
	p.setState(transport.StateLoggedOut, "")
	return nil
}

func (p *Provider) Events() <-chan transport.Event { return p.events }

func (p *Provider) State() transport.ConnectionState {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.state
}

// handleEvent maps whatsmeow events onto transport-neutral Events.
func (p *Provider) handleEvent(evt any) {
	switch v := evt.(type) {
	case *events.Message:
		if v.Info.IsFromMe || v.Info.IsGroup {
			return
		}
		text := v.Message.GetConversation()
		if text == "" {
			if ext := v.Message.GetExtendedTextMessage(); ext != nil {
				text = ext.GetText()
			}
		}
		if text == "" {
			return // non-text (media handled in a later phase)
		}
		p.emit(transport.Event{Type: transport.EventInbound, Inbound: &transport.InboundMessage{
			From:              v.Info.Sender.User,
			FromName:          v.Info.PushName,
			Text:              text,
			MediaType:         "text",
			ProviderMessageID: v.Info.ID,
			Timestamp:         v.Info.Timestamp.Unix(),
		}})
	case *events.Connected:
		id := ""
		p.mu.Lock()
		if p.client != nil && p.client.Store.ID != nil {
			id = p.client.Store.ID.User
		}
		p.mu.Unlock()
		p.setState(transport.StateConnected, id)
	case *events.Disconnected:
		p.setState(transport.StateDisconnected, "")
	case *events.LoggedOut:
		p.setState(transport.StateLoggedOut, "")
	}
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
	default:
		p.log.Warnf("whatsapp: event buffer full, dropping %s", ev.Type)
	}
}

// normalizeNumber strips a leading + and spaces from a phone number.
func normalizeNumber(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		if r >= '0' && r <= '9' {
			out = append(out, r)
		}
	}
	return string(out)
}

// waLogAdapter bridges whatsmeow's logger onto transport.Logger.
type waLogAdapter struct {
	log    transport.Logger
	module string
}

func (w *waLogAdapter) Warnf(msg string, args ...any)  { w.log.Warnf("["+w.module+"] "+msg, args...) }
func (w *waLogAdapter) Errorf(msg string, args ...any) { w.log.Errorf("["+w.module+"] "+msg, args...) }
func (w *waLogAdapter) Infof(msg string, args ...any)  { w.log.Infof("["+w.module+"] "+msg, args...) }
func (w *waLogAdapter) Debugf(msg string, args ...any) { w.log.Debugf("["+w.module+"] "+msg, args...) }
func (w *waLogAdapter) Sub(module string) waLog.Logger {
	return &waLogAdapter{w.log, w.module + "/" + module}
}
