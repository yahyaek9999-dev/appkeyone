// Package logging is a tiny leveled logger that writes to both stderr and a
// size-capped rotating file in the Bridge data dir. It implements
// transport.Logger so providers can log through the same sink.
package logging

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Level controls verbosity.
type Level int

const (
	LevelDebug Level = iota
	LevelInfo
	LevelWarn
	LevelError
)

func (l Level) String() string {
	switch l {
	case LevelDebug:
		return "DEBUG"
	case LevelInfo:
		return "INFO"
	case LevelWarn:
		return "WARN"
	default:
		return "ERROR"
	}
}

// Record is one buffered log line (for streaming to the Cloud Dashboard).
type Record struct {
	At      time.Time
	Level   string
	Message string
}

// Logger is a leveled, concurrency-safe logger.
type Logger struct {
	mu    sync.Mutex
	level Level
	out   io.Writer
	file  *os.File
	path  string
	size  int64
	max   int64
	ring  []Record // pending lines to ship to the Cloud (drained by the supervisor)
}

// New returns a logger writing to stderr and to <dir>/logs/bridge.log (rotated
// at ~5MB, keeping one .1 backup). If dir is empty, only stderr is used.
func New(dir string, level Level) *Logger {
	l := &Logger{level: level, out: os.Stderr, max: 5 << 20}
	if dir != "" {
		logDir := filepath.Join(dir, "logs")
		_ = os.MkdirAll(logDir, 0o700)
		l.path = filepath.Join(logDir, "bridge.log")
		if f, err := os.OpenFile(l.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
			l.file = f
			if st, e := f.Stat(); e == nil {
				l.size = st.Size()
			}
		}
	}
	return l
}

// SetLevel adjusts verbosity at runtime.
func (l *Logger) SetLevel(level Level) {
	l.mu.Lock()
	l.level = level
	l.mu.Unlock()
}

func (l *Logger) logf(level Level, format string, args ...any) {
	if level < l.level {
		return
	}
	msg := fmt.Sprintf(format, args...)
	line := fmt.Sprintf("%s %-5s %s\n", time.Now().UTC().Format(time.RFC3339), level.String(), msg)
	l.mu.Lock()
	defer l.mu.Unlock()
	// Buffer for Cloud streaming (bounded — drop oldest past 500 pending).
	l.ring = append(l.ring, Record{At: time.Now().UTC(), Level: strings.ToLower(level.String()), Message: msg})
	if len(l.ring) > 500 {
		l.ring = l.ring[len(l.ring)-500:]
	}
	_, _ = io.WriteString(l.out, line)
	if l.file != nil {
		n, _ := io.WriteString(l.file, line)
		l.size += int64(n)
		if l.size >= l.max {
			l.rotate()
		}
	}
}

// rotate closes the current file, renames it to .1, and reopens. Caller holds mu.
func (l *Logger) rotate() {
	if l.file == nil {
		return
	}
	_ = l.file.Close()
	_ = os.Rename(l.path, l.path+".1")
	if f, err := os.OpenFile(l.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600); err == nil {
		l.file = f
		l.size = 0
	}
}

// Drain returns and clears the pending log records (for Cloud streaming).
func (l *Logger) Drain() []Record {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.ring) == 0 {
		return nil
	}
	out := l.ring
	l.ring = nil
	return out
}

// Close flushes and closes the log file.
func (l *Logger) Close() {
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.file != nil {
		_ = l.file.Close()
		l.file = nil
	}
}

func (l *Logger) Debugf(f string, a ...any) { l.logf(LevelDebug, f, a...) }
func (l *Logger) Infof(f string, a ...any)  { l.logf(LevelInfo, f, a...) }
func (l *Logger) Warnf(f string, a ...any)  { l.logf(LevelWarn, f, a...) }
func (l *Logger) Errorf(f string, a ...any) { l.logf(LevelError, f, a...) }

// StdLogger returns a *log.Logger writing INFO lines through this logger (for
// libraries that require the stdlib logger type).
func (l *Logger) StdLogger() *log.Logger {
	return log.New(writerFunc(func(p []byte) (int, error) {
		l.Infof("%s", string(p))
		return len(p), nil
	}), "", 0)
}

type writerFunc func([]byte) (int, error)

func (w writerFunc) Write(p []byte) (int, error) { return w(p) }
