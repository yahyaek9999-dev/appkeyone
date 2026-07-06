package transport

import (
	"fmt"
	"sort"
	"sync"
)

// Factory constructs a fresh Provider instance.
type Factory func() Provider

var (
	regMu    sync.RWMutex
	registry = map[ProviderName]Factory{}
)

// Register adds a provider factory. Called from each provider package's init(),
// so importing a provider package makes it available — the core never imports a
// concrete provider directly (transport-agnostic).
func Register(name ProviderName, f Factory) {
	regMu.Lock()
	defer regMu.Unlock()
	registry[name] = f
}

// Load constructs the named provider and calls Init. Returns an error if the
// provider is not registered.
func Load(name ProviderName, cfg ProviderConfig, initCtx InitFunc) (Provider, error) {
	regMu.RLock()
	f, ok := registry[name]
	regMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("transport: provider %q is not registered (import its package)", name)
	}
	p := f()
	if err := initCtx(p, cfg); err != nil {
		return nil, err
	}
	return p, nil
}

// InitFunc lets the caller supply the context for Init without this package
// importing context transitively into the registry (kept tiny + testable).
type InitFunc func(p Provider, cfg ProviderConfig) error

// Registered returns the sorted names of all registered providers.
func Registered() []ProviderName {
	regMu.RLock()
	defer regMu.RUnlock()
	names := make([]ProviderName, 0, len(registry))
	for n := range registry {
		names = append(names, n)
	}
	sort.Slice(names, func(i, j int) bool { return names[i] < names[j] })
	return names
}
