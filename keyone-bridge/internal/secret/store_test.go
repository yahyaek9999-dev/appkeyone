package secret

import (
	"bytes"
	"os"
	"testing"
)

// Force the encrypted-file backend so the test never touches the real OS
// keychain (and so it works on a headless CI runner).
func TestFileBackendRoundTrip(t *testing.T) {
	t.Setenv("KEYONE_BRIDGE_SECRET_FILE", "1")
	dir := t.TempDir()
	s := New(dir)

	if _, err := s.Get("bridge_token"); err != ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
	if err := s.Set("bridge_token", "sekret-value-123"); err != nil {
		t.Fatal(err)
	}
	got, err := s.Get("bridge_token")
	if err != nil {
		t.Fatal(err)
	}
	if got != "sekret-value-123" {
		t.Fatalf("got %q", got)
	}

	// A second store instance (fresh process) must decrypt the same vault.
	s2 := New(dir)
	if got, _ := s2.Get("bridge_token"); got != "sekret-value-123" {
		t.Fatalf("reopen got %q", got)
	}

	if err := s.Delete("bridge_token"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get("bridge_token"); err != ErrNotFound {
		t.Fatalf("after delete expected ErrNotFound, got %v", err)
	}
}

func TestEncryptedAtRest(t *testing.T) {
	t.Setenv("KEYONE_BRIDGE_SECRET_FILE", "1")
	dir := t.TempDir()
	s := New(dir)
	if err := s.Set("k", "PLAINTEXT-NEEDLE"); err != nil {
		t.Fatal(err)
	}
	// The on-disk vault must not contain the plaintext.
	m, err := s.readVault()
	if err != nil {
		t.Fatal(err)
	}
	if m["k"] != "PLAINTEXT-NEEDLE" {
		t.Fatalf("vault decrypt mismatch")
	}
	// Raw file bytes must be ciphertext, not the needle.
	raw, _ := os.ReadFile(s.vaultPath())
	if bytes.Contains(raw, []byte("PLAINTEXT-NEEDLE")) {
		t.Fatal("plaintext found in vault file — not encrypted at rest")
	}
}
