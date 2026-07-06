package protocol

import "testing"

func TestNewFrameAndDecode(t *testing.T) {
	f, err := NewFrame(TypeInbound, InboundPayload{Text: "hi", From: FromRef{Phone: "201"}})
	if err != nil {
		t.Fatal(err)
	}
	if f.V != Version || f.Type != TypeInbound || f.ID == "" || f.TS == 0 {
		t.Fatalf("bad frame: %+v", f)
	}
	var p InboundPayload
	if err := f.Decode(&p); err != nil {
		t.Fatal(err)
	}
	if p.Text != "hi" || p.From.Phone != "201" {
		t.Fatalf("decode mismatch: %+v", p)
	}
}

func TestReplyCorrelation(t *testing.T) {
	req, _ := NewFrame(TypeHeartbeat, nil)
	ack, err := Reply(req, TypeHeartbeatAck, map[string]bool{"ok": true})
	if err != nil {
		t.Fatal(err)
	}
	if ack.Corr != req.ID {
		t.Fatalf("corr = %q, want %q", ack.Corr, req.ID)
	}
}

func TestUniqueIDs(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		f, _ := NewFrame(TypeHello, nil)
		if seen[f.ID] {
			t.Fatalf("duplicate id %s", f.ID)
		}
		seen[f.ID] = true
	}
}
