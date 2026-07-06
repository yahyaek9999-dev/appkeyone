package supervisor

import (
	"context"
	"time"

	"github.com/keyone/keyone-bridge/internal/protocol"
	"github.com/keyone/keyone-bridge/internal/updater"
)

// onControl handles a Dashboard-issued command pushed from the Cloud. This is
// what lets a customer run the Bridge entirely from the Dashboard — they never
// open the Bridge app after install.
func (s *Supervisor) onControl(action, provider string) {
	s.log.Infof("dashboard control received: %s (%s)", action, provider)
	ctx := context.Background()
	prov := s.provider(provider)

	switch action {
	case "start_qr":
		if prov != nil {
			if err := prov.StartLink(ctx); err != nil {
				s.log.Errorf("start_qr failed: %v", err)
			}
		}
	case "disconnect":
		if prov != nil {
			_ = prov.Stop(ctx)
			s.log.Infof("provider %s disconnected from the Dashboard (session kept)", provider)
		}
	case "reconnect":
		if prov != nil {
			_ = prov.Stop(ctx)
			if err := prov.Start(ctx); err != nil {
				s.log.Errorf("reconnect failed: %v", err)
			} else {
				s.log.Infof("provider %s reconnected from the Dashboard", provider)
			}
		}
	case "restart":
		for name, p := range s.providers {
			_ = p.Stop(ctx)
			if err := p.Start(ctx); err != nil {
				s.log.Errorf("restart %s failed: %v", name, err)
			}
		}
		s.log.Infof("bridge transports restarted from the Dashboard")
	case "update":
		go s.runUpdate(ctx)
	default:
		s.log.Warnf("unknown control action: %s", action)
	}
}

// runUpdate checks for and applies a newer Bridge release (atomic swap + verify).
// The running process keeps the old binary until the service restarts it.
func (s *Supervisor) runUpdate(ctx context.Context) {
	s.log.Infof("checking for updates (current %s)…", Version)
	rel, err := updater.CheckLatest(ctx)
	if err != nil {
		s.log.Errorf("update check failed: %v", err)
		return
	}
	if rel == nil || !updater.IsNewer(Version, rel.TagName) {
		s.log.Infof("already up to date (%s)", Version)
		return
	}
	s.log.Infof("updating %s → %s…", Version, rel.TagName)
	if err := updater.Apply(ctx, rel); err != nil {
		s.log.Errorf("update failed: %v", err)
		return
	}
	s.log.Infof("update to %s applied — restart the service to run it", rel.TagName)
}

// shipLogs streams recent Bridge log lines to the Cloud so the customer reads
// them in the Dashboard without opening the Bridge app.
func (s *Supervisor) shipLogs(ctx context.Context) {
	t := time.NewTicker(3 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if s.client == nil || !s.client.Connected() {
				continue
			}
			for _, r := range s.log.Drain() {
				_ = s.client.SendLog(protocol.LogPayload{Level: r.Level, Message: r.Message})
			}
		}
	}
}
