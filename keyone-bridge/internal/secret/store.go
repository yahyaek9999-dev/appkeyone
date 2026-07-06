// Package secret stores sensitive values (the BridgeToken, provider secrets) in
// the OS keychain — Keychain (macOS), Credential Manager/DPAPI (Windows),
// libsecret (Linux) via go-keyring. When no keychain is available (common on
// headless Linux servers without a DBus/secret service), it falls back to an
// AES-256-GCM encrypted file whose key is a 0600 keyfile in the data dir.
//
// Auth artifacts NEVER leave the host: this package only ever writes locally.
package secret

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/zalando/go-keyring"
)

const service = "keyone-bridge"

// ErrNotFound is returned when a key is absent from both keychain and file.
var ErrNotFound = errors.New("secret: not found")

// Store persists secrets. Zero value is not usable — call New.
type Store struct {
	mu        sync.Mutex
	dir       string
	forceFile bool // skip the keychain (tests / servers)
}

// New returns a Store rooted at dir. If KEYONE_BRIDGE_SECRET_FILE=1, the keychain
// is skipped and the encrypted-file backend is used unconditionally.
func New(dir string) *Store {
	return &Store{dir: dir, forceFile: os.Getenv("KEYONE_BRIDGE_SECRET_FILE") == "1"}
}

// Set stores value under key.
func (s *Store) Set(key, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.forceFile {
		if err := keyring.Set(service, key, value); err == nil {
			return nil
		}
	}
	return s.fileSet(key, value)
}

// Get retrieves the value for key. Returns ErrNotFound if absent.
func (s *Store) Get(key string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.forceFile {
		if v, err := keyring.Get(service, key); err == nil {
			return v, nil
		} else if !errors.Is(err, keyring.ErrNotFound) {
			// keychain present but errored for another reason → try file too.
		}
	}
	v, err := s.fileGet(key)
	if errors.Is(err, os.ErrNotExist) {
		return "", ErrNotFound
	}
	return v, err
}

// Delete removes key from both backends (best effort).
func (s *Store) Delete(key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.forceFile {
		_ = keyring.Delete(service, key)
	}
	m, err := s.readVault()
	if err != nil {
		return nil
	}
	delete(m, key)
	return s.writeVault(m)
}

// ---- encrypted-file backend ------------------------------------------------

func (s *Store) vaultPath() string { return filepath.Join(s.dir, "vault.enc") }
func (s *Store) keyPath() string   { return filepath.Join(s.dir, "vault.key") }

// loadKey returns the AES-256 key, creating a random one (0600) on first use.
func (s *Store) loadKey() ([]byte, error) {
	if b, err := os.ReadFile(s.keyPath()); err == nil {
		k, derr := base64.StdEncoding.DecodeString(string(b))
		if derr == nil && len(k) == 32 {
			return k, nil
		}
	}
	k := make([]byte, 32)
	if _, err := rand.Read(k); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return nil, err
	}
	if err := os.WriteFile(s.keyPath(), []byte(base64.StdEncoding.EncodeToString(k)), 0o600); err != nil {
		return nil, err
	}
	return k, nil
}

func (s *Store) aead() (cipher.AEAD, error) {
	key, err := s.loadKey()
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// readVault decrypts the vault into a map (empty if none yet).
func (s *Store) readVault() (map[string]string, error) {
	raw, err := os.ReadFile(s.vaultPath())
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, err
	}
	blob, err := base64.StdEncoding.DecodeString(string(raw))
	if err != nil {
		return nil, err
	}
	aead, err := s.aead()
	if err != nil {
		return nil, err
	}
	ns := aead.NonceSize()
	if len(blob) < ns {
		return nil, errors.New("secret: vault corrupt")
	}
	nonce, ct := blob[:ns], blob[ns:]
	pt, err := aead.Open(nil, nonce, ct, nil)
	if err != nil {
		return nil, err
	}
	m := map[string]string{}
	if err := json.Unmarshal(pt, &m); err != nil {
		return nil, err
	}
	return m, nil
}

func (s *Store) writeVault(m map[string]string) error {
	pt, err := json.Marshal(m)
	if err != nil {
		return err
	}
	aead, err := s.aead()
	if err != nil {
		return err
	}
	nonce := make([]byte, aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}
	ct := aead.Seal(nonce, nonce, pt, nil)
	out := base64.StdEncoding.EncodeToString(ct)
	tmp := s.vaultPath() + ".tmp"
	if err := os.WriteFile(tmp, []byte(out), 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.vaultPath())
}

func (s *Store) fileSet(key, value string) error {
	m, err := s.readVault()
	if err != nil {
		return err
	}
	m[key] = value
	return s.writeVault(m)
}

func (s *Store) fileGet(key string) (string, error) {
	m, err := s.readVault()
	if err != nil {
		return "", err
	}
	v, ok := m[key]
	if !ok {
		return "", os.ErrNotExist
	}
	return v, nil
}
