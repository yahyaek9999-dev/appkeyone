package cloud

import (
	"encoding/json"
	"math/rand"
	"time"
)

func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

// jitter returns a random duration in [0, d/2] to de-synchronise reconnects.
func jitter(d time.Duration) time.Duration {
	if d <= 0 {
		return 0
	}
	return time.Duration(rand.Int63n(int64(d)/2 + 1))
}
