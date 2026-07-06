// Command keyone-bridge is the headless KEYONE Bridge daemon + CLI.
//
//	keyone-bridge login    — device-code link this host to a KEYONE workspace
//	keyone-bridge start    — run the Bridge (foreground; the service runs this)
//	keyone-bridge stop     — signal a running Bridge to shut down
//	keyone-bridge status   — show link + connection status
//	keyone-bridge logs     — tail the Bridge log
//	keyone-bridge update   — check for + apply an update (see internal/updater)
//	keyone-bridge logout   — unlink this Bridge and wipe local auth
//	keyone-bridge version  — print version
package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/keyone/keyone-bridge/internal/cloud"
	"github.com/keyone/keyone-bridge/internal/config"
	"github.com/keyone/keyone-bridge/internal/logging"
	"github.com/keyone/keyone-bridge/internal/queue"
	"github.com/keyone/keyone-bridge/internal/secret"
	"github.com/keyone/keyone-bridge/internal/supervisor"
	"github.com/keyone/keyone-bridge/internal/transport"
	"github.com/keyone/keyone-bridge/internal/updater"

	// v1 registers ONLY WhatsApp. The production binary knows no other provider,
	// so no transport selection is possible. Adding one later is a single blank
	// import here — the supervisor stays transport-agnostic. (The `fake` provider
	// exists solely for tests, which import it directly; it is deliberately NOT
	// registered in the shipped binary.)
	_ "github.com/keyone/keyone-bridge/internal/transport/whatsapp"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]
	args := os.Args[2:]

	dir, err := config.DataDir()
	must(err)
	log := logging.New(dir, logging.LevelInfo)
	defer log.Close()

	switch cmd {
	case "login":
		must(cmdLogin(dir, log, args))
	case "start", "run":
		must(cmdStart(dir, log))
	case "stop":
		must(cmdStop(dir))
	case "status":
		must(cmdStatus(dir))
	case "logs":
		must(cmdLogs(dir, args))
	case "update":
		must(cmdUpdate(args))
	case "rotate":
		must(cmdRotate(dir))
	case "doctor":
		must(cmdDoctor(dir, log))
	case "logout":
		must(cmdLogout(dir, log))
	case "version", "-v", "--version":
		fmt.Println("keyone-bridge", supervisor.Version)
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: keyone-bridge <login|start|stop|status|logs|update|rotate|doctor|logout|version>")
	fmt.Fprintln(os.Stderr, "  update [--rollback]   check/apply an update, or roll back the last one")
	fmt.Fprintln(os.Stderr, "  rotate                rotate the Bridge token now")
	fmt.Fprintln(os.Stderr, "  doctor                run connectivity + config diagnostics")
}

// ---- commands --------------------------------------------------------------

func cmdLogin(dir string, log *logging.Logger, args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	name := ""
	if len(args) > 0 {
		name = strings.TrimSpace(strings.Join(args, " "))
	}
	linker := cloud.NewLinker(cfg.CloudAPIBase)
	linker.Prompt = func(url, code string, expiresIn int) {
		fmt.Println()
		fmt.Println("  To link this Bridge, open the KEYONE dashboard and approve the code:")
		fmt.Printf("    URL:  %s\n", url)
		fmt.Printf("    Code: %s\n", code)
		fmt.Printf("  (expires in %d minutes — waiting for approval…)\n\n", expiresIn/60)
	}

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	res, err := linker.Link(ctx, cfg.Providers, name)
	if err != nil {
		return err
	}

	store := secret.New(dir)
	if err := store.Set(supervisor.TokenKey, res.Token.BridgeToken); err != nil {
		return fmt.Errorf("store token: %w", err)
	}
	_ = store.Set("heartbeat_secret", res.Token.HeartbeatSecret)

	cfg.BridgeID = res.Token.BridgeID
	cfg.WorkspaceID = res.Token.WorkspaceID
	if name != "" {
		cfg.Name = name
	}
	if err := cfg.Save(); err != nil {
		return err
	}
	fmt.Printf("✓ Linked. bridge=%s workspace=%s\n", cfg.BridgeID, cfg.WorkspaceID)
	fmt.Println("  Start it with:  keyone-bridge start   (or install it as a service)")
	return nil
}

func cmdStart(dir string, log *logging.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if !cfg.Linked() {
		return fmt.Errorf("not linked — run `keyone-bridge login` first")
	}
	store := secret.New(dir)
	if _, err := store.Get(supervisor.TokenKey); err != nil {
		return fmt.Errorf("no bridge token in secret store — re-run login: %w", err)
	}

	q, err := queue.Open(filepath.Join(dir, "outbound-queue.jsonl"), 10000)
	if err != nil {
		return err
	}

	providers, err := buildProviders(cfg, log)
	if err != nil {
		return err
	}

	if err := writePID(dir); err != nil {
		return err
	}
	defer removePID(dir)

	sup := supervisor.New(cfg, log, store, q, providers)
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	log.Infof("keyone-bridge %s starting (bridge=%s, providers=%v)", supervisor.Version, cfg.BridgeID, cfg.Providers)
	return sup.Run(ctx)
}

func cmdStop(dir string) error {
	pid, err := readPID(dir)
	if err != nil {
		return fmt.Errorf("no running Bridge found (%v)", err)
	}
	proc, err := os.FindProcess(pid)
	if err != nil {
		return err
	}
	if err := terminate(proc); err != nil {
		return fmt.Errorf("signal pid %d: %w", pid, err)
	}
	fmt.Printf("✓ stop signal sent to pid %d\n", pid)
	return nil
}

func cmdStatus(dir string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	store := secret.New(dir)
	_, tokErr := store.Get(supervisor.TokenKey)
	running := "stopped"
	if pid, err := readPID(dir); err == nil && processAlive(pid) {
		running = fmt.Sprintf("running (pid %d)", pid)
	}
	fmt.Println("KEYONE Bridge status")
	fmt.Printf("  version:    %s\n", supervisor.Version)
	fmt.Printf("  linked:     %v\n", cfg.Linked())
	fmt.Printf("  bridge id:  %s\n", orDash(cfg.BridgeID))
	fmt.Printf("  workspace:  %s\n", orDash(cfg.WorkspaceID))
	fmt.Printf("  providers:  %v\n", cfg.Providers)
	fmt.Printf("  cloud:      %s\n", cfg.CloudWSURL)
	fmt.Printf("  token:      %v\n", tokErr == nil)
	fmt.Printf("  process:    %s\n", running)
	fmt.Printf("  data dir:   %s\n", dir)
	return nil
}

func cmdLogs(dir string, args []string) error {
	n := 100
	if len(args) > 0 {
		if v, err := strconv.Atoi(args[0]); err == nil {
			n = v
		}
	}
	return tailFile(filepath.Join(dir, "logs", "bridge.log"), n)
}

func cmdUpdate(args []string) error {
	return updater.RunCLI(supervisor.Version, args)
}

func cmdRotate(dir string) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	if !cfg.Linked() {
		return fmt.Errorf("not linked — nothing to rotate")
	}
	store := secret.New(dir)
	cur, err := store.Get(supervisor.TokenKey)
	if err != nil {
		return fmt.Errorf("no bridge token: %w", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	newTok, err := cloud.RotateToken(ctx, cfg.CloudAPIBase, cur)
	if err != nil {
		return err
	}
	if err := store.Set(supervisor.TokenKey, newTok); err != nil {
		return fmt.Errorf("persist rotated token: %w", err)
	}
	fmt.Println("✓ Bridge token rotated.")
	return nil
}

func cmdDoctor(dir string, log *logging.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	store := secret.New(dir)
	ok := true
	check := func(name string, pass bool, detail string) {
		mark := "✓"
		if !pass {
			mark = "✗"
			ok = false
		}
		fmt.Printf("  %s %-26s %s\n", mark, name, detail)
	}
	info := func(name, detail string) { fmt.Printf("  • %-26s %s\n", name, detail) }

	fmt.Println("KEYONE Bridge doctor")
	check("config loads", true, cfg.CloudAPIBase)
	check("linked", cfg.Linked(), "bridge="+orDash(cfg.BridgeID))
	tok, terr := store.Get(supervisor.TokenKey)
	check("token in secret store", terr == nil, "")

	probePath := filepath.Join(dir, ".doctor-write-probe")
	werr := os.WriteFile(probePath, []byte("x"), 0o600)
	_ = os.Remove(probePath)
	check("data dir writable", werr == nil, dir)

	_, perr := buildProviders(cfg, log)
	check("providers constructable", perr == nil, fmt.Sprintf("%v", cfg.Providers))

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	p := cloud.Probe(ctx, cfg.CloudAPIBase, cfg.CloudWSURL, tok)
	check("cloud API reachable", p.APIReachable, cfg.CloudAPIBase)
	switch {
	case p.WSReachable && p.WSAuthorized:
		info("cloud WS", "reachable + authorized")
	case p.WSReachable:
		info("cloud WS", "reachable, token rejected (Bridge disabled/off, or re-link needed)")
	default:
		info("cloud WS", "unreachable ("+p.Detail+") — normal if the gateway isn't public yet")
	}
	if rel, _ := updater.CheckLatest(ctx); rel != nil {
		info("update", "latest "+rel.TagName+" (running "+supervisor.Version+")")
	} else {
		info("update channel", "no releases published yet")
	}

	if !ok {
		return fmt.Errorf("doctor found problems (see ✗ above)")
	}
	fmt.Println("All critical checks passed.")
	return nil
}

func cmdLogout(dir string, log *logging.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}
	// Best-effort provider logout (wipes local session).
	if providers, err := buildProviders(cfg, log); err == nil {
		for _, p := range providers {
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
			_ = p.Logout(ctx)
			cancel()
		}
	}
	store := secret.New(dir)
	_ = store.Delete(supervisor.TokenKey)
	_ = store.Delete("heartbeat_secret")
	cfg.BridgeID = ""
	cfg.WorkspaceID = ""
	if err := cfg.Save(); err != nil {
		return err
	}
	fmt.Println("✓ Logged out. Local auth wiped. Re-run `keyone-bridge login` to re-link.")
	return nil
}

// ---- helpers ---------------------------------------------------------------

func buildProviders(cfg *config.Config, log *logging.Logger) (map[string]transport.Provider, error) {
	m := map[string]transport.Provider{}
	for _, name := range cfg.Providers {
		pdir, err := config.ProviderDataDir(name)
		if err != nil {
			return nil, err
		}
		pcfg := transport.ProviderConfig{DataDir: pdir, Log: log}
		p, err := transport.Load(transport.ProviderName(name), pcfg, func(p transport.Provider, c transport.ProviderConfig) error {
			return p.Init(context.Background(), c)
		})
		if err != nil {
			return nil, err
		}
		m[name] = p
	}
	if len(m) == 0 {
		return nil, fmt.Errorf("no providers configured")
	}
	return m, nil
}

func pidPath(dir string) string { return filepath.Join(dir, "bridge.pid") }

func writePID(dir string) error {
	return os.WriteFile(pidPath(dir), []byte(strconv.Itoa(os.Getpid())), 0o600)
}
func removePID(dir string) { _ = os.Remove(pidPath(dir)) }
func readPID(dir string) (int, error) {
	b, err := os.ReadFile(pidPath(dir))
	if err != nil {
		return 0, err
	}
	return strconv.Atoi(strings.TrimSpace(string(b)))
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func orDash(s string) string {
	if s == "" {
		return "—"
	}
	return s
}
