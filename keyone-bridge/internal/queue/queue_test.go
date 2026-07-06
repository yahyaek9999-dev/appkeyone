package queue

import (
	"path/filepath"
	"testing"
)

func TestFIFOAndPersistence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "q.jsonl")
	q, err := Open(path, 100)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 3; i++ {
		if _, err := q.Enqueue(Item{ID: string(rune('a' + i)), To: "x", Text: "m"}); err != nil {
			t.Fatal(err)
		}
	}
	if q.Len() != 3 {
		t.Fatalf("len=%d", q.Len())
	}
	// reopen — must survive restart
	q2, err := Open(path, 100)
	if err != nil {
		t.Fatal(err)
	}
	if q2.Len() != 3 {
		t.Fatalf("persisted len=%d", q2.Len())
	}
	head, ok := q2.Peek()
	if !ok || head.ID != "a" {
		t.Fatalf("head=%v ok=%v", head, ok)
	}
	if err := q2.Ack(); err != nil {
		t.Fatal(err)
	}
	head, _ = q2.Peek()
	if head.ID != "b" {
		t.Fatalf("after ack head=%s", head.ID)
	}
}

func TestRequeueBumpsAttempts(t *testing.T) {
	q, _ := Open(filepath.Join(t.TempDir(), "q.jsonl"), 100)
	q.Enqueue(Item{ID: "a"})
	q.Enqueue(Item{ID: "b"})
	if err := q.Requeue(); err != nil {
		t.Fatal(err)
	}
	head, _ := q.Peek()
	if head.ID != "b" {
		t.Fatalf("head=%s want b", head.ID)
	}
}

func TestBoundedDropsOldest(t *testing.T) {
	q, _ := Open(filepath.Join(t.TempDir(), "q.jsonl"), 2)
	q.Enqueue(Item{ID: "a"})
	q.Enqueue(Item{ID: "b"})
	dropped, _ := q.Enqueue(Item{ID: "c"})
	if !dropped {
		t.Fatal("expected drop")
	}
	if q.Len() != 2 {
		t.Fatalf("len=%d", q.Len())
	}
	head, _ := q.Peek()
	if head.ID != "b" {
		t.Fatalf("head=%s want b (a dropped)", head.ID)
	}
}
