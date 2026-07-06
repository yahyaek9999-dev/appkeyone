package supervisor

import (
	"context"
	"errors"
	"os"
	"strconv"
	"time"

	"github.com/keyone/keyone-bridge/internal/cloud"
)

// rotateLoop periodically rotates the Bridge token. Interval (hours) is set by
// KEYONE_BRIDGE_ROTATE_HOURS (default 24; 0 disables). Rotation is safe while
// connected: the live socket keeps its old auth, and the next reconnect picks up
// the new token from the secret store.
func (s *Supervisor) rotateLoop(ctx context.Context) {
	hours := envInt("KEYONE_BRIDGE_ROTATE_HOURS", 24)
	if hours <= 0 {
		return
	}
	t := time.NewTicker(time.Duration(hours) * time.Hour)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if err := s.RotateToken(ctx); err != nil {
				s.log.Warnf("token rotation: %v", err)
			}
		}
	}
}

// RotateToken performs one rotation and persists the new token BEFORE it is used
// again (the old token is revoked server-side on success).
func (s *Supervisor) RotateToken(ctx context.Context) error {
	cur, err := s.store.Get(TokenKey)
	if err != nil {
		return err
	}
	newTok, err := cloud.RotateToken(ctx, s.cfg.CloudAPIBase, cur)
	if errors.Is(err, cloud.ErrRotateConflict) {
		return nil // a concurrent rotation already advanced the chain — benign
	}
	if errors.Is(err, cloud.ErrRotateUnauthorized) {
		s.log.Errorf("token rejected on rotation — the Bridge must be re-linked (keyone-bridge login)")
		return err
	}
	if err != nil {
		return err
	}
	if err := s.store.Set(TokenKey, newTok); err != nil {
		return err
	}
	s.log.Infof("bridge token rotated")
	return nil
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
