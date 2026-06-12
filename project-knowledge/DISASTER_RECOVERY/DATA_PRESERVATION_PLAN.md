# DATA_PRESERVATION_PLAN — KEYONE EOL Extraction

**Date:** 2026-06-12 · **Window:** ~6 hours · Goal: preserve 100% of recoverable assets before the VPS expires.
Priority: **P0** = extract first, irreplaceable · **P1** = extract, important · **P2** = extract if time · **P3** = already safe, optional.

Destinations: **Mac** (`~/Desktop/KEYONE_EOL_EXTRACTION/`) · **SSD** (external, 2nd copy) · **Enc** (age/gpg encrypted archive) · **Git** (private repo).

---

## 1. Extraction order (do P0 → P1 → P2)

| # | Asset | Exact path (VPS unless noted) | Est. size | Priority | Destination(s) |
|---|---|---|---|---|---|
| 1 | **Production DB (live)** | `C:\KEYONE\data\saas.db` + `saas.db-wal` + `saas.db-shm` | ~10–200 MB | **P0** | Mac + SSD + **Enc** |
| 2 | **Production DB (alt path)** | `C:\app\saas\prisma\prod.db` (+ wal/shm) | ~10–200 MB | **P0** | Mac + SSD + Enc |
| 3 | **Newest DB backup (consistent)** | `C:\app\backups\prod-*.db.gz` (latest) | ~5–60 MB | **P0** | Mac + SSD + Enc |
| 4 | **Prod env: saas** | `C:\app\saas\.env` (**AUTH_SECRET**) | < 4 KB | **P0** | **Enc** + password vault |
| 5 | **Prod env: whatsapp-service** | `C:\app\whatsapp-service\.env` | < 2 KB | **P0** | Enc + vault |
| 6 | **Prod env: root/LLM** | `C:\app\.env` | < 2 KB | **P0** | Enc + vault |
| 7 | **WhatsApp sessions** | `C:\KEYONE\data\wa-sessions\` (`.wwebjs_auth\session-*`) | ~50 MB–1 GB+ | **P1** | Mac + SSD |
| 8 | **All local backups** | `C:\app\backups\` (whole dir: db gz + pre-deploy snapshots) | ~0.1–5 GB | **P1** | Mac + SSD |
| 9 | **Caddy config + certs** | `C:\Caddy\Caddyfile` + Caddy data dir (certificates) | < 50 MB | **P2** | Mac |
| 10 | **NSSM service defs** | `nssm dump` of each service (→ text) | < 50 KB | **P2** | Mac + Git |
| 11 | **Scheduled-task XML** | `schtasks /query /xml` (→ text) | < 100 KB | **P2** | Mac + Git |
| 12 | **CloakBrowser ChatGPT profile** | `CHROME_PROFILE_DIR` on VPS (mse-llm) | ~100–400 MB | **P2** | Mac (or re-login later) |
| 13 | **Service logs** | `C:\app\logs\`, `C:\KEYONE\logs\` | ~10 MB–1 GB | **P2** | Mac (forensics) |

**Total realistic P0+P1 footprint:** typically **< 2 GB** — copies in minutes over scp. P0 alone (DB + env) is **< 250 MB** and is the part that actually saves the business.

---

## 2. Already-safe assets (no VPS extraction; preserve in Git/Mac)

| Asset | Where it is now | Priority | Action |
|---|---|---|---|
| App source, deploy scripts, schemas, CI, Caddyfile, Docker | **GitHub** (`origin/main` @ `cbb7eda`) | P3 | none — safe |
| AI engine source (`mse_ai_api/main.py`, May 16) | Mac `~/Desktop/mse_ai_api-main` | **P1** (preserve) | **commit to private Git repo** (28 KB main.py) |
| CloakBrowser (`cloakbrowser` v0.3.26, 540 KB) | Mac `~/Desktop/CloakBrowser-main/cloakbrowser` | **P1** | vendor + commit (not on PyPI) |
| Local-only UI branch `claude/hopeful-kowalevski-90a1e7` (3 commits) | Mac only | **P1** | `git push origin claude/hopeful-kowalevski-90a1e7` |
| This DR package + `deploy/offsite/` + `UIUX_POLISH_PASS` | Mac working tree (uncommitted) | **P1** | commit + push the branch |

> These don't depend on the VPS, but they are **not in GitHub**. Preserve them so a *Mac* failure can't lose them either.

---

## 3. Destination strategy (3-2-1 in 6 hours)

| Destination | Holds | Why |
|---|---|---|
| **Mac** `~/Desktop/KEYONE_EOL_EXTRACTION/{db,env,wa-sessions,backups,configs}/` | all P0–P2 | fast primary landing zone |
| **External SSD** | full copy of the Mac extraction folder | survives Mac failure; physical 2nd copy |
| **Encrypted archive** (`age`/`gpg`) of `db/` + `env/` | DB + secrets | the env files hold `AUTH_SECRET`; never store them unencrypted off-device. Upload the encrypted archive to the off-site bucket (`deploy/offsite/`) or a private repo |
| **Private GitHub repo** | AI engine + CloakBrowser + the local UI branch + DR docs | version-controlled, off-machine. **Never** the DB or plaintext env. |

**Rule:** the DB and env files get **3 copies** (Mac + SSD + encrypted off-site). Code/engine get Git. Nothing secret goes to Git in plaintext.

---

## 4. Verification targets (after copying — see EXPORT_COMMANDS Phase "verify")
- DB: `sqlite3 <copy> "PRAGMA integrity_check;"` → `ok`, and `SELECT COUNT(*) FROM User;` non-zero.
- Env: `AUTH_SECRET` present and ≥ 32 chars; confirm it decrypts a known `Bot.aiApiKeyEnc`.
- Sessions: `.wwebjs_auth/session-*` folders present and non-empty per tenant.
- Sizes sane (not 0-byte / truncated transfers).

Proceed to [EXPORT_COMMANDS](EXPORT_COMMANDS.md) for the exact copy commands, then [SERVER_DELETION_READINESS](SERVER_DELETION_READINESS.md).
