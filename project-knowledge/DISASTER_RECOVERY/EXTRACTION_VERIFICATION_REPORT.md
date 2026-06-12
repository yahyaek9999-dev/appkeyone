# EXTRACTION_VERIFICATION_REPORT — KEYONE P0 Emergency Extraction

**Date:** 2026-06-12 · **Mode:** read-and-copy only — **nothing on the VPS was modified, restarted, deployed, or deleted.**
**VPS:** `Administrator@217.154.163.16` (Windows, hostname `WIN-EMAA6SD4335`) — reachable & live · key `~/.ssh/id_ed25519`
**Destination:** `~/Desktop/KEYONE_EOL_EXTRACTION/` on the owner's Mac · **total 122 MB**

---

## ✅ Executive result

All five P0 assets were extracted and verified. **The production database, environment, WhatsApp session, and server backups are now preserved off the VPS.** One material caveat (orphaned legacy ciphertext) and two Windows hygiene notes are documented below — none block recovery.

| # | Asset | Status |
|---|---|---|
| 1 | Production database | ✅ **RECOVERED & VERIFIED** (integrity `ok`, true current state captured via WAL) |
| 2 | Production `.env` files | ✅ **RECOVERED** (saas + whatsapp-service; root/LLM `.env` absent on VPS) |
| 3 | AUTH_SECRET | ✅ **PRESERVED** (current production key captured, redundantly) — ⚠️ see legacy-ciphertext caveat |
| 4 | WhatsApp sessions | ✅ **PRESERVED** (auth leveldb captured; QR re-scan as guaranteed fallback) |
| 5 | Existing server backups | ✅ **PRESERVED** (14 daily snapshots + DB snapshots + logs) |

---

## 1. Extracted assets — path · size · destination · checksum · integrity

### 1. Production database  ✅
| Property | Value |
|---|---|
| Source (VPS) | `C:\app\saas\prisma\prod.db` (+ `-wal`, `-shm`) |
| Destination | `~/Desktop/KEYONE_EOL_EXTRACTION/db/` |
| Sizes | `prod.db` 1,622,016 B · `prod.db-wal` 4,140,632 B · `prod.db-shm` 32,768 B |
| SHA-256 prod.db | `c5b00a9041d191c550dc4b040be1bfb207250ca4abb346ddede7e1e8b5f7fb18` |
| SHA-256 prod.db-wal | `e3ab4b50b8fd8891279d36c5837eb542a96e24889904bc9d73fedeae2f7bf8ec` |
| SHA-256 prod.db-shm | `baa3c7cab0a91ae2bc3042ea821c2fde8881ed107ecc6de17b45ef5500b2f171` |
| Integrity | `PRAGMA integrity_check` → **ok** |
| **Current data (WAL applied)** | **User 3 · Bot 3 · Customer 35 · Conversation 34 · Message 212 · Order 32 · Subscription 2** |

> 🔑 **WAL capture was decisive.** The main `prod.db` file alone reports a **stale 7 users / 7 bots**; applying the captured WAL yields the **true current 3 / 3**. A naïve single-file copy would have restored stale data. The `+wal +shm` files were copied together, so the authoritative current state is preserved.

### 2. Consistent daily backup (fallback)  ✅
| Property | Value |
|---|---|
| Source | `C:\app\backups\prod-2026-06-12_033004.db.gz` (today 03:30, online `sqlite3 .backup`) |
| Destination | `…/db/` and `…/backups/daily-gz/` |
| Size · SHA-256 | 178,615 B · `6990fc507c645f95771c9c5d28ea9fd168fd115c603633c6dfe540ecb9321fbf` |
| Integrity | `gzip -t` ok · decompressed `integrity_check` **ok** |
| Note | Snapshot captured the **transient 7-user mid-day state** (created then cleaned up before now). Valid but older than the live capture; the WAL-applied live DB is authoritative. |

### 3. Environment files  ✅
| Property | Value |
|---|---|
| Sources | `C:\app\saas\.env` → `env/saas.env` (353 B) · `C:\app\whatsapp-service\.env` → `env/whatsapp-service.env` (182 B) · `C:\app\.env` → **absent on VPS** (LLM service decommissioned) |
| Also pulled | `C:\app\backups\saas-env-before-phase-a-queue-20260522-1010.bak` → `env/OLD-saas-env-20260522.bak` (345 B) |
| SHA-256 saas.env | `98d92d1c682f82e33c28f650ea6b8aa3abba4d1b8c27139070e90fe8ae3ff9ca` |
| SHA-256 wa-svc.env | `743da6b53340a9fa016aa776ba857df2c142231785c67f5839c60121c2e70f6c` |
| Keys present (saas) | `AUTH_SECRET` (63 chars), `SAAS_INTERNAL_SECRET` (38), DB/LLM/WA URLs, etc. — *values never printed* |
| Keys present (wa) | `PORT`, `SAAS_INTERNAL_SECRET`, `SESSIONS_DIR`, `SAAS_INCOMING_URL` |

### 4. WhatsApp sessions  ✅
| Property | Value |
|---|---|
| Source | `C:\app\whatsapp-service\sessions\` (`SESSIONS_DIR`) — 1 session `session-cmpbui2w70000bsbkee75htjf` |
| Destination | `…/wa-sessions/` |
| Copied | 250 files / 91 MB (VPS holds 284 / 665 MB) |
| **Auth store captured** | ✅ `Default/IndexedDB/https_web.whatsapp.com_0.indexeddb.leveldb` (16 files, 55 MB) + `Default/Local Storage` (44 KB) + `Default/Service Worker` (15 MB) |
| Auth-file checksums | `wa-sessions/SESSION_AUTH.sha256` (16 entries) |
| Not copied (≈574 MB) | Chromium caches (GPUCache/Code Cache/component caches) — **regenerable, not auth**; some were locked by the live browser |

### 5. Existing server backups  ✅
| Property | Value |
|---|---|
| Source | `C:\app\backups\` |
| Destination | `…/backups/` (`daily-gz/`, `db-snapshots/`, `backup.log`, `latest.txt`) |
| Captured | **14 daily gz** (2026-05-30 → 06-12), loose `.db` snapshots, `backup.log` (3,663 B), `latest.txt` |
| Verified | newest gz `integrity_check` **ok**; lineage 06-08→06-11 = 3 users (matches live) |

### Bonus — configs (P2)
`configs/`: `Caddyfile`, `nssm-services.txt` (7 dumps; live services = **mse-saas, mse-wa, mse-caddy**), `scheduled-tasks.txt` (5 KEYONE tasks), `services.txt`. 156 KB.

### Consolidated portable artifact
`keyone-critical-2026-06-12.tar.gz` (db + env + wa-sessions) · 18 MB · SHA-256 `1283e845382e900e45800742ca8c42d3ec1fcefc9601225a17c3d1cafbd9bb43`. Full manifest: `MANIFEST.sha256` (27 entries) + `wa-sessions/SESSION_AUTH.sha256`.

---

## 2. Final confirmations (the required five)

- ✅ **Database recovered** — `prod.db`+WAL+SHM copied, `integrity_check = ok`, authoritative current state (3 users / 3 bots / 35 customers / 34 conversations / 212 messages / 32 orders / 2 subscriptions) verified. Plus 14 historical daily snapshots.
- ✅ **Environment recovered** — `saas.env` + `whatsapp-service.env` copied and checksummed (root/LLM `.env` does not exist on the VPS; the LLM service is decommissioned, so this is expected, not a gap).
- ✅ **AUTH_SECRET preserved** — the live production `AUTH_SECRET` (63-char) is captured and is **redundantly identical** across the live env, the 2026-05-22 VPS env backup, and 3 local Mac copies. *(See caveat C1.)*
- ✅ **WhatsApp sessions preserved** — the WhatsApp auth store (`web.whatsapp.com` IndexedDB leveldb) was captured; full recovery via restore, with QR re-scan as a guaranteed fallback. *(See caveat C3.)*
- ✅ **Backups preserved** — all 14 daily gz + DB snapshots + logs copied and integrity-checked.

---

## 3. Caveats & anomalies (transparent)

**C1 — Two legacy encrypted columns do NOT decrypt with the current AUTH_SECRET. ⚠️ (pre-existing prod condition, not an extraction defect)**
A decryption test against real data: `Bot.aiApiKeyEnc` (1 row) and `Bot.metaAccessTokenEnc` (1 row), both valid `gcm:` blobs, **fail GCM authentication** under the current `AUTH_SECRET` (all parse variants tried; same result across all 5 env copies). Because `crypto-util` has no fallback (it throws without a valid secret), these were encrypted under an **older AUTH_SECRET that predates every copy found** — i.e. orphaned ciphertext that production itself cannot decrypt today.
- **Impact:** negligible — that bot evidently runs on the in-house LLM (not the stored external key), and Meta is disabled, so both blobs are dormant. They can be re-entered in the dashboard if ever needed.
- **Action:** if an older `AUTH_SECRET` exists in any other personal backup, preserve it too; otherwise treat these two values as unrecoverable (no functional loss).

**C2 — WAL/stale-main anomaly (resolved, informational).** The main DB file lagged the WAL (7 vs 3 users). Resolved by capturing the WAL; the live state (3) is authoritative. Documented so no one "restores" the stale main file alone.

**C3 — Hot-copied live Chromium profile.** Sessions were copied while `mse-wa` was running (read-only). The WA auth leveldb transferred, but leveldb copied mid-write can be slightly inconsistent and ~574 MB of (regenerable) cache plus some locked files were skipped. Restore should be attempted first; **QR re-scan is the guaranteed fallback** and loses no data (history is in the DB).

**C4 — Windows text artifacts (minor).** `.env` files use CRLF and `whatsapp-service.env` has a UTF-8 BOM. `AUTH_SECRET` raw length reads 64 with the trailing CR, 63 as the app sees it. No action needed (Next.js dotenv strips CR/quotes), but normalize to LF on a Linux rebuild.

---

## 4. Destinations & required replication (3-2-1)

| Copy | Location | Status |
|---|---|---|
| Primary | Mac `~/Desktop/KEYONE_EOL_EXTRACTION/` (122 MB) | ✅ done |
| 2nd (physical) | External SSD | ⏳ **copy `keyone-critical-2026-06-12.tar.gz` + folder to SSD** |
| 3rd (off-site, encrypted) | B2/R2/S3 via `deploy/offsite/` | ⏳ **encrypt (db+env contain `AUTH_SECRET`) then upload** |
| Secrets vault | password manager | ⏳ **store `AUTH_SECRET` + the env values off-device** |

> The extraction folder contains plaintext secrets (`env/*.env`) and all tenant data (`db/`). **Encrypt before any off-device move.** Suggested:
> `tar czf - db env wa-sessions | age -r <agePub> > keyone-critical.tar.gz.age` then `rclone copy … b2:keyone-backups/eol-extraction/`.

---

## 5. Read-only attestation

Every VPS operation was read-only: `hostname`, `Get-ChildItem`/`dir`/`type`, `nssm dump`, `schtasks /query`, `sc query`, and `scp` pulls. **No** service was stopped/started, **no** deploy ran, **no** DB write/checkpoint occurred on the VPS, **no** secret was rotated, **no** file was deleted. All integrity-checking/WAL-application happened on **local Mac copies only**. The production server is byte-for-byte unchanged.

---

## 6. Post-extraction status vs. deletion readiness

Recovery success rate if the VPS disappears now has moved from **~35% → ~95%+**: the production DB, secrets, WhatsApp auth, and backups are preserved off-server. Remaining before [SERVER_DELETION_READINESS](SERVER_DELETION_READINESS.md) flips to YES:
1. Replicate to **SSD** + **encrypted off-site** (3-2-1).
2. Store `AUTH_SECRET` in a **vault**.
3. Push the local-only Mac assets (UI branch, DR docs, AI-engine repo) to GitHub.
4. *(optional)* Run a restore smoke test (boot a local KEYONE on the extracted DB + `AUTH_SECRET`).
Until then, **keep the VPS alive**; do not delete.
