// Command wmtest is the OFFICIAL whatsmeow QR-pairing example, verbatim in shape,
// with ZERO KEYONE code. It imports only whatsmeow + the cgo-free sqlite driver —
// no internal/* packages, no relay, no gateway, no supervisor. It lives in the
// keyone-bridge module ONLY so it compiles against the byte-identical whatsmeow
// version (go.sum-pinned) and the same modernc.org/sqlite driver as the Bridge.
//
// Purpose: isolate KEYONE code from the environment. Run it on the SAME box/IP,
// scan with the SAME phone. If THIS pairs, the bug is in KEYONE. If THIS also
// times out, the failure is external to our code.
//
// Full whatsmeow DEBUG logging; prints CODE <time> <raw code> for each QR and
// EVT <time> <type> <fields> for every event (PairSuccess/PairError/Connected/…).
package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "modernc.org/sqlite"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
)

func ts() string { return time.Now().UTC().Format("15:04:05") }

func main() {
	ctx := context.Background()
	dbLog := waLog.Stdout("Database", "DEBUG", true)
	clientLog := waLog.Stdout("Client", "DEBUG", true)

	// Same driver + DSN style as the Bridge (cgo-free). Fresh store each run.
	db, err := sql.Open("sqlite", "file:wmtest.db?_pragma=foreign_keys(1)&_pragma=busy_timeout(10000)")
	if err != nil {
		panic(err)
	}
	container := sqlstore.NewWithDB(db, "sqlite3", dbLog)
	if err := container.Upgrade(ctx); err != nil {
		panic(err)
	}
	deviceStore, err := container.GetFirstDevice(ctx)
	if err != nil {
		panic(err)
	}
	client := whatsmeow.NewClient(deviceStore, clientLog)

	// Log EVERY event with its concrete type + fields — this is where a scan's
	// PairSuccess / PairError / QRScannedWithoutMultidevice would appear.
	client.AddEventHandler(func(evt interface{}) {
		fmt.Printf("EVT %s %T %+v\n", ts(), evt, evt)
	})

	if client.Store.ID == nil {
		// Official pattern (GetQRChannel BEFORE Connect), repeated: if a QR
		// sequence times out unscanned, disconnect and offer a fresh one, so a
		// scannable code is always available until the phone pairs.
		go func() {
			for client.Store.ID == nil {
				// Per-iteration context so each QR sequence's emitter is fully
				// torn down before the next (no leaked goroutines / duplicate codes).
				qctx, cancel := context.WithCancel(ctx)
				qrChan, _ := client.GetQRChannel(qctx)
				if err := client.Connect(); err != nil {
					fmt.Printf("CONNECT-ERR %s %v\n", ts(), err)
					cancel()
					time.Sleep(2 * time.Second)
					continue
				}
				for evt := range qrChan {
					if evt.Event == "code" {
						fmt.Printf("CODE %s %s\n", ts(), evt.Code)
					} else {
						fmt.Printf("QREVENT %s %s\n", ts(), evt.Event)
					}
				}
				cancel()
				if client.Store.ID != nil {
					break
				}
				client.Disconnect()
				time.Sleep(2 * time.Second)
			}
			fmt.Printf("PAIRED %s %s\n", ts(), client.Store.ID.String())
		}()
	} else {
		if err := client.Connect(); err != nil {
			panic(err)
		}
		fmt.Printf("ALREADY-LOGGED-IN %s\n", client.Store.ID.String())
	}

	fmt.Printf("READY %s waiting for scan…\n", ts())
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	client.Disconnect()
}
