// Package transport is the ONLY contract the Bridge core knows about a messaging
// provider. A provider implements Provider and self-registers; the core
// supervises it purely through this interface, so a new provider can be added
// WITHOUT changing the core.
//
// SCOPE (v1): WhatsApp is the ONLY production provider. This abstraction is kept
// deliberately so additional transports can be added in a later version, but no
// other provider is built or shipped in v1.
package transport

import "context"

// ProviderName identifies a transport. v1 ships only "whatsapp".
type ProviderName string

// LinkMethod is how a provider links an account.
type LinkMethod string

const (
	LinkQR          LinkMethod = "qr"
	LinkPairingCode LinkMethod = "pairing_code"
	LinkOAuth       LinkMethod = "oauth"
)

// ConnectionState is the transport-neutral lifecycle state.
type ConnectionState string

const (
	StateInit         ConnectionState = "init"
	StateLinking      ConnectionState = "linking"
	StateConnecting   ConnectionState = "connecting"
	StateConnected    ConnectionState = "connected"
	StateDisconnected ConnectionState = "disconnected"
	StateLoggedOut    ConnectionState = "logged_out"
)

// Capabilities describes what a provider supports.
type Capabilities struct {
	SendText   bool
	SendMedia  bool
	Groups     bool
	Presence   bool
	LinkMethod LinkMethod
}

// EventType tags an Event emitted by a provider.
type EventType string

const (
	EventInbound      EventType = "inbound"
	EventStateChange  EventType = "state"
	EventLinkArtifact EventType = "link_artifact"
	EventReceipt      EventType = "receipt"
	EventError        EventType = "error"
	EventLog          EventType = "log"
)

// InboundMessage is a received message, transport-neutral. The core forwards
// these to the Cloud verbatim (mapped onto the wire protocol).
type InboundMessage struct {
	From              string // sender identity (e.g. phone/handle)
	FromName          string
	Text              string
	MediaType         string // "text" | "voice" | "image" | "video" | "document"
	MediaBase64       string
	Mimetype          string
	ProviderMessageID string
	Timestamp         int64 // provider timestamp, unix seconds
}

// OutboundMessage is a message to deliver via a provider.
type OutboundMessage struct {
	To   string
	Text string
}

// LinkArtifact is a linking credential the provider generates locally (e.g. a QR
// string). It is streamed to the Cloud so the Dashboard can render it. The raw
// auth/session it protects NEVER leaves the host.
type LinkArtifact struct {
	Kind      string // "qr" | "pairing_code"
	Data      string
	ExpiresAt int64
}

// Ack is the result of a successful Send.
type Ack struct {
	ProviderMessageID string
}

// Event is the transport-neutral event stream item.
type Event struct {
	Type     EventType
	Inbound  *InboundMessage
	State    *ConnectionState
	Identity string // display identity (phone/handle) on state=connected
	Link     *LinkArtifact
	Err      error
	Log      string
}

// Logger is the minimal logging surface a provider is handed.
type Logger interface {
	Infof(format string, args ...any)
	Warnf(format string, args ...any)
	Errorf(format string, args ...any)
	Debugf(format string, args ...any)
}

// ProviderConfig is handed to a provider on Init. DataDir is a provider-private
// directory for its encrypted local session/store (never leaves the host).
type ProviderConfig struct {
	DataDir string
	Log     Logger
}

// Provider is the plugin contract. The core calls these; the provider owns its
// local encrypted session and emits Events.
type Provider interface {
	// identity
	Name() ProviderName
	Version() string
	Capabilities() Capabilities

	// lifecycle
	Init(ctx context.Context, cfg ProviderConfig) error
	Start(ctx context.Context) error  // begin/resume; emit Events
	Stop(ctx context.Context) error   // graceful pause (keep session)
	Logout(ctx context.Context) error // wipe local auth/session

	// linking — provider decides the mechanism; artifact streamed via Events
	StartLink(ctx context.Context) error

	// messaging
	Send(ctx context.Context, msg OutboundMessage) (Ack, error)

	// event stream + current state
	Events() <-chan Event
	State() ConnectionState
}
