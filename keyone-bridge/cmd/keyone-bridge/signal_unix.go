//go:build !windows

package main

import (
	"os"
	"syscall"
)

// terminate asks a process to shut down gracefully (SIGTERM).
func terminate(p *os.Process) error { return p.Signal(syscall.SIGTERM) }

// processAlive probes whether pid is running (signal 0).
func processAlive(pid int) bool {
	p, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	return p.Signal(syscall.Signal(0)) == nil
}
