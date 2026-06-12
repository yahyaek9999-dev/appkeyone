# SERVER_RETIREMENT_CHECKLIST — KEYONE

**Date:** 2026-06-12 · PASS/FAIL gate for permanently retiring the VPS. Evidence-based; verification only.

---

## Category results

| # | Category | Result | Evidence |
|---|---|---|---|
| 1 | **Database preserved** | ✅ **PASS** | `prod.db`+WAL+SHM extracted, checksums re-MATCH, `integrity_check=ok`, current state verified (3 users/3 bots/35 customers/32 orders/212 msgs). 14 daily gz also held. |
| 2 | **Secrets preserved** | ✅ **PASS** (⚠️ single copy) | `saas.env` + `whatsapp-service.env` extracted + checksummed. *Caveat:* only on the Mac — not in a vault, not off-site. |
| 3 | **AUTH_SECRET preserved** | ✅ **PASS** (⚠️ caveat) | Current secret present + redundant across 5 copies. Caveat: 2 legacy columns predate it (orphaned, dormant). |
| 4 | **WhatsApp sessions preserved** | ✅ **PASS** | Auth leveldb (`web.whatsapp.com` IndexedDB, 55 MB) captured + checksummed; QR re-scan fallback guarantees recovery. |
| 5 | **Backups preserved** | ✅ **PASS** | 14 daily gz + 6 `.db` snapshots + logs extracted; newest verified `ok`. |
| 6 | **DNS documented** | ❌ **FAIL** | Domain + IP recorded (`app.keyone1.com`→`217.154.163.16`), but the **registrar account/access is NOT documented** — cannot re-point the domain without it. |
| 7 | **SSL documented** | ✅ **PASS** | Caddy auto-ACME documented; `Caddyfile` extracted; certs auto-reissue on the new host. |
| 8 | **Recovery documentation complete** | ✅ **PASS** (⚠️ not pushed) | Full DR package exists (inventory, runbook, migration, backup, secrets, extraction, simulation). *Caveat:* uncommitted/unpushed — lives only on the Mac. |

### Additional retirement-critical categories (implicit but decisive)

| # | Category | Result | Evidence |
|---|---|---|---|
| 9 | **Off-site / multi-copy replication** | ❌ **FAIL** | Extraction exists in exactly **one** location (Mac). No SSD, no encrypted off-site. Retiring drops 2 copies → 1. |
| 10 | **AI engine version-controlled** | ❌ **FAIL** | `main.py` + `cloakbrowser` present on Mac but **not in any Git repo**; `keyone-llm-proxy` does not exist on GitHub. |
| 11 | **Local-only Git assets pushed** | ❌ **FAIL** | UI branch `claude/hopeful-kowalevski-90a1e7` (3 commits) + DR docs **not on GitHub**. |
| 12 | **Final data delta captured** | ⏳ **PENDING** | Extraction is a 10:19 snapshot; a fresh re-extraction is required at shutdown to avoid losing newer writes. |

---

## Scorecard

- **PASS:** 6 of 8 named categories (DB, Secrets, AUTH_SECRET, WhatsApp, Backups, SSL, Recovery-docs) + presence of all assets.
- **FAIL:** DNS access (6), off-site replication (9), engine in Git (10), local Git assets pushed (11).
- **PENDING:** final delta re-extraction (12).

## Gate decision

> **NOT YET CLEARED FOR RETIREMENT.** The data is preserved and verified, but four categories fail — all tied to **single-copy fragility** and **un-pushed/un-documented items**, not to data loss. These are ~1–1.5 hours of work. Clear items 6, 9, 10, 11 (and perform 12 at shutdown), then the gate flips to PASS.

**Minimum actions to flip all to PASS:**
1. Copy `~/Desktop/KEYONE_EOL_EXTRACTION/` to an **external SSD**. *(→ #9)*
2. **Encrypt** `db/`+`env/` and upload **off-site** (`deploy/offsite/`). *(→ #9)*
3. `git init` + push the **AI engine** (vendoring `cloakbrowser`) to a private repo. *(→ #10)*
4. `git push origin claude/hopeful-kowalevski-90a1e7` + commit/push the **DR docs**. *(→ #11)*
5. Document **DNS registrar** access in the vault. *(→ #6)*
6. At shutdown: stop writes → **final fresh DB pull** → then retire. *(→ #12)*

See [SECURE_SERVER_RETIREMENT_PLAN](SECURE_SERVER_RETIREMENT_PLAN.md) and [FINAL_RECOVERY_STATUS](FINAL_RECOVERY_STATUS.md).
