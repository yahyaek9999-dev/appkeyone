# FINAL_ASSET_VERIFICATION — KEYONE Pre-Retirement

**Date:** 2026-06-12 · **Mode:** verification only — nothing modified, on the VPS or locally.
**Re-verification of the 2026-06-12 P0 extraction** at `~/Desktop/KEYONE_EOL_EXTRACTION/` (122 MB) + AI-engine source on Mac.

Method: recomputed SHA-256 vs the recorded `MANIFEST.sha256`, re-ran DB `integrity_check`, confirmed file presence/sizes.

---

## Verification matrix

| Asset | Path | Size | SHA-256 (or note) | Status | Recovery confidence |
|---|---|---|---|---|---|
| **Production DB (main)** | `…/db/prod.db` | 1,622,016 B | `c5b00a90…b5f7fb18` | ✅ checksum re-MATCH · `integrity_check=ok` | **HIGH** |
| **DB WAL** | `…/db/prod.db-wal` | 4,140,632 B | `e3ab4b50…2f7bf8ec` | ✅ re-MATCH (holds the true current state) | **HIGH** |
| **DB SHM** | `…/db/prod.db-shm` | 32,768 B | `baa3c7ca…00b2f171` | ✅ re-MATCH | **HIGH** |
| **DB (current data, WAL applied)** | — | — | User 3 · Bot 3 · Customer 35 · Conversation 34 · Message 212 · Order 32 · Subscription 2 | ✅ verified | **HIGH** |
| **Daily backup (03:30)** | `…/db/prod-2026-06-12_033004.db.gz` | 178,615 B | `6990fc50…b9321fbf` | ✅ re-MATCH · gz ok · decompressed `integrity_check=ok` | **HIGH** (note: 7-user transient state) |
| **Env: saas** | `…/env/saas.env` | 353 B | `98d92d1c…ae3ff9ca` | ✅ re-MATCH · `AUTH_SECRET` present | **HIGH** |
| **Env: whatsapp-service** | `…/env/whatsapp-service.env` | 182 B | `743da6b5…21c2e70f6c` | ✅ re-MATCH | **HIGH** |
| **Env: old backup** | `…/env/OLD-saas-env-20260522.bak` | 345 B | `0247bcc3…2560e73e` | ✅ present (same AUTH_SECRET as live) | reference |
| **AUTH_SECRET** | inside `saas.env` | 63 chars (non-hex) | *value not stored in this doc* | ✅ preserved (live + 4 redundant copies) · ⚠️ **orphaned-ciphertext caveat** | **HIGH** for sessions/new data · **N/A** for 2 legacy columns |
| **WhatsApp session** | `…/wa-sessions/sessions/session-cmpbui2w70000bsbkee75htjf/` | 91 MB / 250 files | auth set in `wa-sessions/SESSION_AUTH.sha256` (16 files) | ✅ auth leveldb present (`web.whatsapp.com` IndexedDB, 55 MB) | **MEDIUM-HIGH** (QR re-scan fallback guarantees) |
| **Server backups** | `…/backups/` | 5.6 MB | 14 daily gz + 6 `.db` snapshots + `backup.log` + `latest.txt` | ✅ present · newest gz `integrity_check=ok` | **HIGH** |
| **Consolidated artifact** | `…/keyone-critical-2026-06-12.tar.gz` | 18 MB | `1283e845…fbd9bb43` | ✅ re-MATCH | **HIGH** |
| **AI engine `main.py`** | `~/Desktop/mse_ai_api-main/main.py` | 28 KB / 635 lines | `55e93c00048d8f0334e2bfd5c3c6238ee5d65a0d2c6b546b96c6616e4222b082` | ✅ present | **HIGH** presence · ⚠️ **not in Git** |
| **AI engine requirements** | `…/mse_ai_api-main/requirements.txt` | — | `6c43215e6c9fde06fc40ff3ce2d6c927ea8a726b56b548fb68fc99269af3fad2` | ✅ present (⚠️ omits `cloakbrowser`) | HIGH |
| **CloakBrowser pkg** | `~/Desktop/CloakBrowser-main/cloakbrowser/` (v0.3.26) | 540 KB / 15 `.py` | `.py` tree hash `f583f3a749c90bd52b5b58d810528acde19a35dac3c330f4afb2b9d3c72d5e14` | ✅ present | **HIGH** presence · ⚠️ **not in Git, not on PyPI** |
| **Application code** | GitHub `yahyaek9999-dev/appkeyone` @ `cbb7eda` | — | `origin/main` fully pushed | ✅ in Git | **HIGH** |

---

## Durability flags (where each copy lives)

| Asset | On VPS | On Mac | On GitHub | Off-site/SSD |
|---|---|---|---|---|
| App code | ✓ | ✓ | ✅ | — |
| Production DB | ✓ (live) | ✅ (extracted, verified) | ✗ (never) | ❌ **none** |
| Env / AUTH_SECRET | ✓ (live) | ✅ (extracted) | ✗ | ❌ **none** |
| WhatsApp sessions | ✓ (live) | ✅ (auth) | ✗ | ❌ **none** |
| Backups | ✓ | ✅ | ✗ | ❌ **none** |
| AI engine + CloakBrowser | ✓ (running) | ✅ (source) | ❌ **not committed** | ❌ none |
| UI branch `claude/hopeful-kowalevski-90a1e7` (3 commits) | — | ✅ (local git) | ❌ **not pushed** | — |
| DR documentation package | — | ✅ (working tree) | ❌ **uncommitted** | — |

---

## Findings carried into the retirement decision

1. ✅ **Every extracted asset re-verifies byte-for-byte** and the DB integrity is `ok`. Extraction quality is sound.
2. ❌ **Single-location risk:** all critical data exists in exactly **two** places — the live VPS and the Mac. **Retiring the VPS drops this to one (Mac).** No SSD, no off-site, no encrypted copy.
3. ❌ **AI engine + CloakBrowser are not version-controlled** and exist only as loose Mac folders.
4. ❌ **Local-only Git assets** (3 UI commits, DR docs) are not on GitHub.
5. ⚠️ **AUTH_SECRET caveat:** 2 legacy encrypted columns (`Bot.aiApiKeyEnc`, `Bot.metaAccessTokenEnc`) do not decrypt with the current secret (older secret, not found). Dormant — negligible impact.
6. ⚠️ **DB drift:** the extraction is a 10:19 snapshot; the live VPS keeps writing. A final re-extraction is required at shutdown to avoid losing post-snapshot data.

➡️ See [RECOVERY_SIMULATION](RECOVERY_SIMULATION.md), [SERVER_RETIREMENT_CHECKLIST](SERVER_RETIREMENT_CHECKLIST.md), and [FINAL_RECOVERY_STATUS](FINAL_RECOVERY_STATUS.md).
