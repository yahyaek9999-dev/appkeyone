package supervisor

import (
	"crypto/rand"
	"encoding/hex"
)

// Version is the Bridge build version reported to the Cloud in the hello frame.
// Overridden at build time via -ldflags "-X ...supervisor.Version=vX.Y.Z".
var Version = "0.3.0-dev"

func newID() string {
	var b [12]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}
