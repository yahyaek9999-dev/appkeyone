// Package queue is a small durable FIFO for outbound messages the Bridge could
// not deliver immediately (provider disconnected, link down). It survives
// restarts by appending to a JSON-lines file and compacting on drain. Bounded so
// a long outage can't exhaust disk.
package queue

import (
	"bufio"
	"encoding/json"
	"os"
	"sync"
)

// Item is one queued unit of work (transport-neutral).
type Item struct {
	ID         string `json:"id"`
	Provider   string `json:"provider"`
	To         string `json:"to"`
	Text       string `json:"text"`
	Attempts   int    `json:"attempts"`
	EnqueuedAt int64  `json:"enqueuedAt"`
}

// Queue is a persistent, concurrency-safe FIFO.
type Queue struct {
	mu    sync.Mutex
	path  string
	items []Item
	max   int
}

// Open loads (or creates) a queue backed by path, bounded to max items.
func Open(path string, max int) (*Queue, error) {
	q := &Queue{path: path, max: max}
	if err := q.load(); err != nil {
		return nil, err
	}
	return q, nil
}

func (q *Queue) load() error {
	f, err := os.Open(q.path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var it Item
		if json.Unmarshal(line, &it) == nil {
			q.items = append(q.items, it)
		}
	}
	return sc.Err()
}

// persist rewrites the file from the in-memory slice (compaction). Caller holds mu.
func (q *Queue) persist() error {
	tmp := q.path + ".tmp"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	w := bufio.NewWriter(f)
	for _, it := range q.items {
		b, _ := json.Marshal(it)
		w.Write(b)
		w.WriteByte('\n')
	}
	if err := w.Flush(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	return os.Rename(tmp, q.path)
}

// Enqueue appends an item. If the queue is full, the OLDEST item is dropped
// (bounded outage semantics) and (dropped=true) is returned.
func (q *Queue) Enqueue(it Item) (dropped bool, err error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.items = append(q.items, it)
	if q.max > 0 && len(q.items) > q.max {
		q.items = q.items[len(q.items)-q.max:]
		dropped = true
	}
	return dropped, q.persist()
}

// Peek returns the head item without removing it (ok=false if empty).
func (q *Queue) Peek() (Item, bool) {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return Item{}, false
	}
	return q.items[0], true
}

// Ack removes the head item (call after successful delivery).
func (q *Queue) Ack() error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return nil
	}
	q.items = q.items[1:]
	return q.persist()
}

// Requeue moves the head to the tail and bumps its attempt count (call after a
// transient delivery failure so head-of-line doesn't block the rest forever).
func (q *Queue) Requeue() error {
	q.mu.Lock()
	defer q.mu.Unlock()
	if len(q.items) == 0 {
		return nil
	}
	head := q.items[0]
	head.Attempts++
	q.items = append(q.items[1:], head)
	return q.persist()
}

// Len returns the number of queued items.
func (q *Queue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}
