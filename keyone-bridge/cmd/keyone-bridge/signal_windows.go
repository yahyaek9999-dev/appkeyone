//go:build windows

package main

import "os"

// terminate stops a process. Windows has no SIGTERM delivery, so we Kill.
func terminate(p *os.Process) error { return p.Kill() }

// processAlive best-effort probes a pid. On Windows FindProcess only fails for
// clearly invalid handles, so this is a coarse liveness signal.
func processAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	return err == nil && p != nil
}
