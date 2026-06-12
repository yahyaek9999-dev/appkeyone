# AI_ENGINE_REPO_PLAN — Private repository plan for the LLM engine

**Date:** 2026-06-12 · Closes retirement-checklist item #10 (AI engine version-controlled).
**Scope:** a precise, ready-to-run plan to put the in-house AI engine (`mse_ai_api` + `cloakbrowser`) into a **private** Git repo. Plan only — execute with the owner's confirmation. (`gh` is not installed on this Mac, so both a web-UI and a CLI path are given.)

> Source already located & verified ([AI_ENGINE_SOURCE_INVENTORY](AI_ENGINE_SOURCE_INVENTORY.md)): canonical engine `~/Desktop/mse_ai_api-main/main.py` (635 lines, sha `55e93c00…`), dependency `~/Desktop/CloakBrowser-main/cloakbrowser` v0.3.26 (15 `.py`, not on PyPI).

---

## 1. Repository design

| Decision | Choice | Why |
|---|---|---|
| Name | `keyone-llm-proxy` | matches the `mse-llm` service |
| Visibility | **private** | contains infra + a ChatGPT-web-automation engine (provider-ToS sensitive) |
| Owner | same GitHub account as `appkeyone` (`yahyaek9999-dev`) | one place to manage |
| `cloakbrowser` | **vendored** under `vendor/cloakbrowser/` | not on PyPI — must be carried with the engine or the build breaks |
| Excluded | `.venv/`, `saas/`, `__pycache__/`, `*.env`, `chrome-profile/`, `email_link_bot/` | runtime/secrets/unrelated bloat (the 1 GB folder → ~1 MB of real source) |

⚠️ **License note:** `~/Desktop/CloakBrowser-main/BINARY-LICENSE.md` indicates the stealth-browser binary is separately licensed. Vendor the **Python package source** + keep `BINARY-LICENSE.md`; the binary itself is fetched at runtime by `cloakbrowser/download.py`. Confirm the license permits storing the package source in a private repo (it almost always does for the wrapper code).

## 2. Files to commit (the real engine ≈ 1 MB)
```
keyone-llm-proxy/
├── main.py                       # canonical (May 16, sha 55e93c00…)
├── requirements.txt              # + the cloakbrowser line (step 4)
├── Dockerfile                    # from mse_ai_api-main
├── docker-compose.yml            # from mse_ai_api-main
├── deploy/env.llm.example        # from mse_ai_api-main
├── vendor/cloakbrowser/          # v0.3.26 package source (15 .py) + BINARY-LICENSE.md
├── .gitignore
└── README.md                     # build/run/ChatGPT-login bootstrap
```

## 3. Exact commands (DO NOT EXECUTE until approved)

```bash
# --- A. Stage a clean copy (don't pollute the 1GB working folder) ---
mkdir -p ~/Desktop/keyone-llm-proxy && cd ~/Desktop/keyone-llm-proxy
cp ~/Desktop/mse_ai_api-main/main.py ~/Desktop/mse_ai_api-main/requirements.txt \
   ~/Desktop/mse_ai_api-main/Dockerfile ~/Desktop/mse_ai_api-main/docker-compose.yml .
mkdir -p deploy && cp ~/Desktop/mse_ai_api-main/deploy/env.llm.example deploy/
mkdir -p vendor && cp -R ~/Desktop/CloakBrowser-main/cloakbrowser vendor/cloakbrowser
cp ~/Desktop/CloakBrowser-main/BINARY-LICENSE.md vendor/cloakbrowser/ 2>/dev/null || true

cat > .gitignore <<'EOF'
.venv/
__pycache__/
*.pyc
chrome-profile/
.cloakbrowser/
*.env
.env
.DS_Store
EOF

# --- B. Fix requirements so the build is reproducible (cloakbrowser is vendored) ---
printf '\n# vendored — not on PyPI:\n-e ./vendor/cloakbrowser\n' >> requirements.txt

# --- C. Minimal README ---
cat > README.md <<'EOF'
# keyone-llm-proxy
OpenAI-compatible FastAPI proxy that automates ChatGPT via the vendored `cloakbrowser`.
Build:  python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && playwright install chromium
Run:    API_SECRET_KEY=<== saas LLM_API_KEY>  CHROME_PROFILE_DIR=/var/keyone/data/cloak-profile  python main.py   # :7788
Bootstrap: launch once non-headless to log into chatgpt.com; the profile persists the session.
Endpoints: /v1/chat/completions, /v1/responses, /v1/models, /healthz
EOF

# --- D. Init + commit + tag ---
git init && git add -A && git commit -m "import: KEYONE LLM proxy (prod 2026-06-12) + vendored cloakbrowser v0.3.26"
git branch -M main && git tag v-prod-2026-06-12

# --- E. Create the PRIVATE remote and push ---
# Option 1 (gh, if installed):
gh repo create yahyaek9999-dev/keyone-llm-proxy --private --source=. --remote=origin --push
git push origin --tags
# Option 2 (no gh): create an EMPTY private repo at github.com/new named "keyone-llm-proxy", then:
git remote add origin git@github.com:yahyaek9999-dev/keyone-llm-proxy.git
git push -u origin main && git push origin --tags
```

## 4. Verify
```bash
git -C ~/Desktop/keyone-llm-proxy ls-files | wc -l          # ~30-40 files
# fresh-clone build test (catches the cloakbrowser dependency gap):
git clone git@github.com:yahyaek9999-dev/keyone-llm-proxy.git /tmp/llm-test
cd /tmp/llm-test && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
```

## 5. After it's pushed
- Add `keyone-llm-proxy` to the off-site backup set and to [DISASTER_RECOVERY](DISASTER_RECOVERY.md) Scenario A §10 (replace "non-Git source" with `git clone`).
- Retirement checklist #10 → **PASS**; Repository portability → **100**.

**Effort: ~30 minutes.** No production impact (capturing existing local source into a private repo).
