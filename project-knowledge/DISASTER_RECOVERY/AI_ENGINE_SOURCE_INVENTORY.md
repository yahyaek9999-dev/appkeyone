# AI_ENGINE_SOURCE_INVENTORY — CloakBrowser / mse_ai_api

**Date:** 2026-06-12
**Blocker addressed:** **B3** — "CloakBrowser LLM proxy `main.py` not in Git."
**Status:** ✅ **SOURCE LOCATED** on the owner's machine (not lost). Action required = version-control + back it up.

---

## 1. Headline

The AI engine is **found and recoverable**. It was never in the `appkeyone` repo because `appkeyone` was extracted *out of* an older monorepo (`mse_ai_api-main`) that still holds the engine. The engine is **two parts**, both present locally, **neither under version control**:

1. **`mse_ai_api` / `main.py`** — the FastAPI ChatGPT-automation proxy (the `mse-llm` service on :7788/:7777).
2. **`cloakbrowser`** — a custom stealth-Chromium Python package that `main.py` imports but which is **NOT in `requirements.txt`** and **NOT on PyPI**. This is the true critical dependency.

> ⚠️ **Rebuild trap:** `pip install -r requirements.txt` is **insufficient**. `requirements.txt` lists only fastapi/uvicorn/playwright/pydantic/python-multipart. `main.py` does `from cloakbrowser import launch_persistent_context_async` — without the `cloakbrowser` package the engine will not start.

---

## 2. Located copies (inventory)

### 2.1 `mse_ai_api` (the proxy)
| Copy | main.py sha1 | size | mtime | Verdict |
|---|---|---|---|---|
| `~/Desktop/mse_ai_api-main/` | `cbe95ea7…` | 25,075 B | **2026-05-16 00:04** | ✅ **CANONICAL (newest)** |
| `~/Desktop/KEY1/mse_ai_api-main/` | `3f1e4794…` | 21,862 B | 2026-05-13 22:38 | older |
| `~/Desktop/clone /mse_ai_api-main/` | `3f1e4794…` | 21,862 B | 2026-05-13 22:38 | older (dup) |

Use **`~/Desktop/mse_ai_api-main`** as the source of truth. (None is a Git repo — `git log` returns nothing in all three.)

The canonical folder is 1.0 GB because it also contains a stale `.venv`, an old copy of `saas/` (`.next`, `node_modules`), and an old `saas/.env` (see §6). The **actual engine source is tiny** — `main.py` + `requirements.txt` + `Dockerfile` + `docker-compose.yml` + `deploy/`.

### 2.2 `cloakbrowser` (the dependency)
| Copy | Path | Notes |
|---|---|---|
| Primary | `~/Desktop/CloakBrowser-main/` | package at `cloakbrowser/` — version **0.3.26** (`_version.py`) |
| Duplicate | `~/Desktop/vz/CloakBrowser-main/` | second copy |
| Runtime dir | `~/.cloakbrowser/` | downloaded browser binary / cache (regenerable) |

**Package contents:** `cloakbrowser/{__init__,__main__,_version,browser,config,download,geoip}.py` + `human/` + `bin/{cloakserve,cloaktest,docker-entrypoint.sh}` + its own `Dockerfile` + `BINARY-LICENSE.md`. `download.py` fetches a prebuilt stealth-Chromium binary at runtime (no large binary is vendored — confirmed no files > 5 MB). The repo also bundles an unrelated `email_link_bot/` (Lovable signup automation) — **not needed by KEYONE**, exclude it.

> 📌 `BINARY-LICENSE.md` indicates the stealth browser binary is **separately licensed**. Capture that license + the binary download source as part of the engine archive.

---

## 3. What the engine is (technical profile)

| Property | Value |
|---|---|
| Purpose | OpenAI-compatible API that automates ChatGPT's web UI via headless stealth Chromium |
| Framework | FastAPI + Uvicorn (Python 3.10) |
| Mechanism | Keeps one persistent ChatGPT tab open (`AsyncBrowserThread`); new chat every 20 requests to avoid context bloat |
| Endpoints | `POST /v1/chat/completions`, `POST /v1/responses`, `GET /v1/models`, `GET /`, `GET /healthz` |
| Auth | `API_SECRET_KEY` header (default `change-secret-key-2026`) — **must equal saas `LLM_API_KEY`** |
| Other env | `CHROME_PROFILE_DIR` (default `./chrome-profile`) — holds the logged-in ChatGPT session |
| Port | Dockerfile `EXPOSE 7777`; production runs it on **7788** (`LLM_API_URL`) |
| Origin | Based on the public `mse_ai_api` project ("free OpenAI-compatible API"), **locally modified** (canonical copy diverged from the two May-13 copies) |
| Known fragility | If the ChatGPT web session expires, requests hit `auth.openai.com`, time out at 30s, and uvicorn can exit (per archived `KNOWN_ISSUES.md`). NSSM watches `nssm.exe`, not the inner `python.exe`. |

**The KEYONE app already has provider fallbacks** (`lib/providers/*`, tenant vault, OpenAI media path), so a degraded-mode recovery can run **without** this engine by configuring an external AI provider per tenant — but the default in-house path needs it.

---

## 4. Exact actions to remove blocker B3

| # | Action | Command sketch | Effort |
|---|---|---|---|
| A1 | Create a **private** Git repo for the engine | `gh repo create <owner>/keyone-llm-proxy --private` | 5 min |
| A2 | Stage the **canonical** engine source (exclude `.venv`, `saas/`, `__pycache__`, old `.env`) | see `.gitignore` below | 15 min |
| A3 | **Vendor the `cloakbrowser` package** into the engine repo (or pin it as a git submodule) since it's not on PyPI | `cp -r ~/Desktop/CloakBrowser-main/cloakbrowser ./vendor/cloakbrowser` | 15 min |
| A4 | **Fix `requirements.txt`** to make the build reproducible — add the cloakbrowser install path + record the binary license/source | `echo "./vendor/cloakbrowser" >> requirements.txt` (editable/local install) | 10 min |
| A5 | Add a `README.md` documenting build/run (`pip install -r requirements.txt`, `playwright install chromium`, the ChatGPT login bootstrap, env vars) | — | 20 min |
| A6 | Commit + push; tag `v-prod-2026-06-12` | `git add -A && git commit && git push && git tag …` | 5 min |
| A7 | Add the engine repo to the **off-site backup** set + the **recovery runbook** (replace "non-Git source" steps in DISASTER_RECOVERY Scenario A step 10 with a `git clone`) | — | 10 min |

**Total effort: ~1.5 hours.** No production change, no deploy — this is purely capturing existing local source into version control + backups.

### Suggested `.gitignore` for the engine repo
```gitignore
.venv/
__pycache__/
*.pyc
chrome-profile/
.cloakbrowser/
saas/            # the old extracted app — belongs to appkeyone, not here
*.env
.env
.DS_Store
email_link_bot/  # unrelated bundled tool
```

### Minimum file set to commit (the real engine)
```
keyone-llm-proxy/
├── main.py                    # ~/Desktop/mse_ai_api-main/main.py  (CANONICAL, May 16)
├── requirements.txt           # + cloakbrowser install line (A4)
├── Dockerfile                 # from mse_ai_api-main
├── docker-compose.yml         # from mse_ai_api-main
├── deploy/env.llm.example     # from mse_ai_api-main
├── vendor/cloakbrowser/       # ~/Desktop/CloakBrowser-main/cloakbrowser  (v0.3.26)
│   └── BINARY-LICENSE.md      # keep the binary license
└── README.md                  # build/run/bootstrap (A5)
```

---

## 5. Build & run (for the recovery runbook)

```bash
# On a fresh Ubuntu box (replaces the "non-Git source" steps in DISASTER_RECOVERY Scenario A §10)
git clone https://github.com/<owner>/keyone-llm-proxy.git /home/keyone/llm
cd /home/keyone/llm
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # now includes cloakbrowser (A4)
playwright install chromium
# system libs for headless chromium:
sudo apt install -y libnss3 libatk-bridge2.0-0 libgbm1 libasound2 libxkbcommon0 libcups2 libpango-1.0-0
# create .env: API_SECRET_KEY (== saas LLM_API_KEY), CHROME_PROFILE_DIR=/var/keyone/data/cloak-profile, PORT=7788
# one-time bootstrap: launch non-headless once to log in to chatgpt.com, persist the profile
pm2 start ".venv/bin/python main.py" --name mse-llm
curl -s localhost:7788/healthz          # expect ok
```
> The ChatGPT **login session** (in `CHROME_PROFILE_DIR`) is state, not source. Re-login is required on a new box unless the profile dir is restored from backup. Treat it like a WhatsApp session: optional to back up, re-creatable by logging in.

---

## 6. Secret-hygiene note (handled in the secrets plan)

The canonical engine folder contains a stale **`~/Desktop/mse_ai_api-main/saas/.env`** (325 B, May 12) that may hold **old production secrets** (possibly an old `AUTH_SECRET`). Actions (see [SECRETS_INVENTORY_AND_MIGRATION](SECRETS_INVENTORY_AND_MIGRATION.md)):
- Do **not** commit it (the `.gitignore` above excludes `*.env`).
- Review whether it contains a still-valid `AUTH_SECRET`; if so, secure it in the vault and confirm it matches production.
- If it is a superseded secret, mark it rotated and delete the loose file.

---

## 7. Outcome

- **Repository portability** rises from 85 → **100** once A1–A6 are done (engine in version control).
- **Disaster recovery readiness** improves materially (recovery no longer depends on a loose local folder).
- The recovery runbook's only "non-Git" engine step is eliminated.

➡️ See [READINESS_UPGRADE_PLAN](READINESS_UPGRADE_PLAN.md) for how this folds into the 52→85+ path.
