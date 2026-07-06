// Package protocol defines the versioned wire format between a KEYONE Bridge and
// the Cloud bridge-gateway. It is transport-neutral: nothing here knows about
// WhatsApp or any provider. The Go types mirror the JSON envelope the Node
// gateway speaks (bridge-gateway/index.js) 1:1.
package protocol

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"time"
)

// Version is the protocol version carried in every frame ("v").
const Version = 1

// Frame types. Requests and their *_ack replies. Kept as plain strings so an
// older Bridge and a newer Cloud (or vice-versa) can ignore unknown types.
const (
	TypeHello           = "hello"
	TypeHelloAck        = "hello_ack"
	TypeHeartbeat       = "heartbeat"
	TypeHeartbeatAck    = "heartbeat_ack"
	TypeInbound         = "inbound"
	TypeInboundAck      = "inbound_ack"
	TypeOutbound        = "outbound"
	TypeOutboundAck     = "outbound_ack"
	TypeOutboundNack    = "outbound_nack"
	TypeState           = "state"
	TypeStateAck        = "state_ack"
	TypeLinkArtifact    = "link_artifact"
	TypeLinkArtifactAck = "link_artifact_ack"
	TypeStartLink       = "start_link" // Cloud -> Bridge control (Phase 3+)
	TypeError           = "error"
)

// Frame is the envelope: { v, id, type, ts, corr?, ack?, payload? }.
type Frame struct {
	V       int             `json:"v"`
	ID      string          `json:"id"`
	Type    string          `json:"type"`
	TS      int64           `json:"ts"`
	Corr    string          `json:"corr,omitempty"`
	Ack     bool            `json:"ack,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// NewFrame builds a frame with a fresh id and current timestamp. payload may be
// any JSON-serialisable value (or nil).
func NewFrame(typ string, payload any) (*Frame, error) {
	var raw json.RawMessage
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, err
		}
		raw = b
	}
	return &Frame{V: Version, ID: newID(), Type: typ, TS: nowMillis(), Payload: raw}, nil
}

// Reply builds an ack/response frame correlated to req.
func Reply(req *Frame, typ string, payload any) (*Frame, error) {
	f, err := NewFrame(typ, payload)
	if err != nil {
		return nil, err
	}
	f.Corr = req.ID
	return f, nil
}

// Decode unmarshals f.Payload into v.
func (f *Frame) Decode(v any) error {
	if len(f.Payload) == 0 {
		return nil
	}
	return json.Unmarshal(f.Payload, v)
}

// ---- payload shapes (transport-neutral) ------------------------------------

// HelloPayload announces the Bridge to the Cloud on connect.
type HelloPayload struct {
	ProtocolVersion int      `json:"protocolVersion"`
	Version         string   `json:"version"`
	OS              string   `json:"os"`
	Arch            string   `json:"arch"`
	Providers       []string `json:"providers"`
}

// InboundPayload is a received message forwarded to the Cloud. Field names match
// what the gateway maps onto /api/whatsapp/incoming (the wa-service contract).
type InboundPayload struct {
	Provider          string  `json:"provider"`
	From              FromRef `json:"from"`
	MediaType         string  `json:"mediaType"`
	Text              string  `json:"text"`
	MediaBase64       string  `json:"mediaBase64,omitempty"`
	Mimetype          string  `json:"mimetype,omitempty"`
	ProviderMessageID string  `json:"providerMessageId,omitempty"`
	ProviderTimestamp int64   `json:"providerTimestamp,omitempty"`
}

// FromRef identifies an inbound sender for display + reply routing.
type FromRef struct {
	Phone string `json:"phone"`
	Name  string `json:"name,omitempty"`
}

// OutboundPayload is a message the Cloud asks the Bridge to deliver.
type OutboundPayload struct {
	Provider string `json:"provider"`
	To       string `json:"to"`
	Text     string `json:"text"`
}

// OutboundAckPayload reports the delivery outcome for an outbound frame.
type OutboundAckPayload struct {
	OK                bool   `json:"ok"`
	ProviderMessageID string `json:"providerMessageId,omitempty"`
	Error             string `json:"error,omitempty"`
}

// StatePayload reports a provider connection-state change.
type StatePayload struct {
	Provider string `json:"provider"`
	State    string `json:"state"`
	Identity string `json:"identity,omitempty"`
}

// LinkArtifactPayload streams a link artifact (e.g. a QR string) to the Cloud.
type LinkArtifactPayload struct {
	Provider  string `json:"provider"`
	Kind      string `json:"kind"` // "qr" | "pairing_code"
	Data      string `json:"data"`
	ExpiresAt int64  `json:"expiresAt,omitempty"`
}

func newID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

func nowMillis() int64 { return time.Now().UnixMilli() }
