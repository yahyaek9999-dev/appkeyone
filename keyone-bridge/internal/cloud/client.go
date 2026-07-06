package cloud

import (
	"context"
	"errors"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/keyone/keyone-bridge/internal/protocol"
	"github.com/keyone/keyone-bridge/internal/transport"
)

// ErrNotConnected is returned by send methods when the socket is down.
var ErrNotConnected = errors.New("cloud: not connected")

// Handlers are callbacks the client invokes on inbound control frames.
type Handlers struct {
	// OnOutbound is called for an `outbound` frame; its return value is sent back
	// as outbound_ack/outbound_nack.
	OnOutbound func(protocol.OutboundPayload) protocol.OutboundAckPayload
	// OnStartLink is called for a `start_link` control frame.
	OnStartLink func(provider string)
	// OnControl is called for a Dashboard `control` frame
	// (start_qr | reconnect | restart | update | disconnect).
	OnControl func(action, provider string)
	// OnConnected fires after a successful hello/hello_ack.
	OnConnected func()
	// OnDisconnected fires when the socket drops.
	OnDisconnected func()
}

// Client is a resilient protocol-v1 WebSocket client to the Cloud gateway.
type Client struct {
	wsURL string
	token func() (string, error)
	hello protocol.HelloPayload
	log   transport.Logger
	h     Handlers

	heartbeat time.Duration

	mu      sync.Mutex
	conn    *websocket.Conn
	writeMu sync.Mutex
}

// NewClient builds a client. token() is called on every (re)connect so a rotated
// token is picked up automatically.
func NewClient(wsURL string, token func() (string, error), hello protocol.HelloPayload, log transport.Logger, h Handlers) *Client {
	return &Client{wsURL: wsURL, token: token, hello: hello, log: log, h: h, heartbeat: 25 * time.Second}
}

// Connected reports whether a socket is currently up.
func (c *Client) Connected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// Run maintains the connection until ctx is cancelled, reconnecting with capped
// exponential backoff + jitter.
func (c *Client) Run(ctx context.Context) {
	backoff := time.Second
	const maxBackoff = 30 * time.Second
	for {
		if ctx.Err() != nil {
			return
		}
		err := c.connectOnce(ctx)
		if ctx.Err() != nil {
			return
		}
		if err != nil {
			c.log.Warnf("cloud link down: %v (retry in %s)", err, backoff)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff + jitter(backoff)):
		}
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
}

func (c *Client) connectOnce(ctx context.Context) error {
	tok, err := c.token()
	if err != nil {
		return err
	}
	hdr := http.Header{}
	hdr.Set("Authorization", "Bearer "+tok)

	dialer := websocket.Dialer{HandshakeTimeout: 20 * time.Second}
	conn, _, err := dialer.DialContext(ctx, c.wsURL, hdr)
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.conn = conn
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.conn = nil
		c.mu.Unlock()
		_ = conn.Close()
		if c.h.OnDisconnected != nil {
			c.h.OnDisconnected()
		}
	}()

	// hello
	if err := c.sendFrame(protocol.TypeHello, c.hello); err != nil {
		return err
	}
	if c.h.OnConnected != nil {
		c.h.OnConnected()
	}
	c.log.Infof("cloud link up")

	// heartbeat loop (separate goroutine, stopped when read loop returns)
	hbCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	go c.heartbeatLoop(hbCtx)

	// read loop
	for {
		conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		_, data, err := conn.ReadMessage()
		if err != nil {
			return err
		}
		var f protocol.Frame
		if err := jsonUnmarshal(data, &f); err != nil {
			continue
		}
		c.dispatch(&f)
	}
}

func (c *Client) heartbeatLoop(ctx context.Context) {
	t := time.NewTicker(c.heartbeat)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := c.sendFrame(protocol.TypeHeartbeat, map[string]any{}); err != nil {
				return
			}
		}
	}
}

func (c *Client) dispatch(f *protocol.Frame) {
	switch f.Type {
	case protocol.TypeHelloAck, protocol.TypeHeartbeatAck, protocol.TypeInboundAck,
		protocol.TypeStateAck, protocol.TypeLinkArtifactAck:
		// acks — nothing to do
	case protocol.TypeOutbound:
		var p protocol.OutboundPayload
		_ = f.Decode(&p)
		ack := protocol.OutboundAckPayload{OK: false, Error: "no_handler"}
		if c.h.OnOutbound != nil {
			ack = c.h.OnOutbound(p)
		}
		typ := protocol.TypeOutboundAck
		if !ack.OK {
			typ = protocol.TypeOutboundNack
		}
		_ = c.reply(f, typ, ack)
	case protocol.TypeStartLink:
		var p struct {
			Provider string `json:"provider"`
		}
		_ = f.Decode(&p)
		if c.h.OnStartLink != nil {
			c.h.OnStartLink(p.Provider)
		}
	case protocol.TypeControl:
		var p protocol.ControlPayload
		_ = f.Decode(&p)
		if c.h.OnControl != nil {
			c.h.OnControl(p.Action, p.Provider)
		}
	case protocol.TypeError:
		c.log.Warnf("cloud error frame: %s", string(f.Payload))
	}
}

// ---- outgoing (used by the supervisor) -------------------------------------

// SendInbound forwards a received message to the Cloud.
func (c *Client) SendInbound(p protocol.InboundPayload) error {
	return c.sendFrame(protocol.TypeInbound, p)
}

// SendState reports a provider connection-state change.
func (c *Client) SendState(p protocol.StatePayload) error {
	return c.sendFrame(protocol.TypeState, p)
}

// SendLinkArtifact streams a link artifact (e.g. QR) to the Cloud.
func (c *Client) SendLinkArtifact(p protocol.LinkArtifactPayload) error {
	return c.sendFrame(protocol.TypeLinkArtifact, p)
}

// SendLog streams one log line to the Cloud for the Dashboard log viewer.
func (c *Client) SendLog(p protocol.LogPayload) error {
	return c.sendFrame(protocol.TypeLog, p)
}

func (c *Client) sendFrame(typ string, payload any) error {
	f, err := protocol.NewFrame(typ, payload)
	if err != nil {
		return err
	}
	return c.write(f)
}

func (c *Client) reply(req *protocol.Frame, typ string, payload any) error {
	f, err := protocol.Reply(req, typ, payload)
	if err != nil {
		return err
	}
	return c.write(f)
}

func (c *Client) write(f *protocol.Frame) error {
	c.mu.Lock()
	conn := c.conn
	c.mu.Unlock()
	if conn == nil {
		return ErrNotConnected
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	conn.SetWriteDeadline(time.Now().Add(15 * time.Second))
	return conn.WriteJSON(f)
}
