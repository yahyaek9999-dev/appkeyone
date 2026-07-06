# KEYONE Bridge — build, test, and cross-platform release.
BINARY  := keyone-bridge
PKG     := ./cmd/keyone-bridge
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo 0.3.0-dev)
LDFLAGS := -s -w -X github.com/keyone/keyone-bridge/internal/supervisor.Version=$(VERSION)
PLATFORMS := darwin/amd64 darwin/arm64 linux/amd64 linux/arm64 windows/amd64
DIST := dist

# Fully static, cgo-free binaries (modernc sqlite) so every target cross-compiles.
export CGO_ENABLED=0

.PHONY: all build test vet tidy clean dist checksums

all: vet test build

build:
	go build -ldflags "$(LDFLAGS)" -o bin/$(BINARY) $(PKG)

test:
	go test ./...

vet:
	go vet ./...

tidy:
	go mod tidy

# Cross-compile every target into dist/ with the release asset naming the
# updater expects (keyone-bridge_<os>_<arch>[.exe]).
dist: clean
	@mkdir -p $(DIST)
	@$(foreach p,$(PLATFORMS), \
		os=$(word 1,$(subst /, ,$(p))); arch=$(word 2,$(subst /, ,$(p))); \
		out=$(DIST)/$(BINARY)_$${os}_$${arch}; \
		if [ "$${os}" = "windows" ]; then out=$${out}.exe; fi; \
		echo "  build $${os}/$${arch}"; \
		GOOS=$${os} GOARCH=$${arch} go build -ldflags "$(LDFLAGS)" -o $${out} $(PKG) || exit 1; \
	)
	@$(MAKE) checksums

# SHA-256 manifest consumed by the auto-updater's signature/integrity check.
checksums:
	@cd $(DIST) && { command -v sha256sum >/dev/null && sha256sum * || shasum -a 256 *; } > checksums.txt && \
		echo "  wrote $(DIST)/checksums.txt"

clean:
	@rm -rf $(DIST) bin
