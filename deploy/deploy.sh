#!/usr/bin/env bash
# ============================================================
#  KEYONE — deploy.sh
#  Unix/macOS CI equivalent of deploy.ps1
#
#  Handles the git push side of deployment from a Mac/Linux
#  CI machine. The actual build + service restart on the VPS
#  is still handled by deploy.ps1 (Windows Server).
#
#  Usage:
#    ./deploy.sh [--push-only] [--vps-only] [--full] [--message "..."]
#
#  Modes:
#    --push-only   git add + commit + push  (default)
#    --vps-only    SSH into VPS and trigger deploy.ps1 only
#    --full        push AND trigger VPS deploy (end-to-end)
#
#  Prerequisites (set in environment or edit defaults below):
#    GITHUB_PAT        GitHub personal access token
#    VPS_HOST          VPS IP or hostname
#    VPS_SSH_USER      SSH username for VPS (default: Administrator)
#    VPS_SSH_KEY       Path to SSH private key (default: ~/.ssh/id_rsa)
#    VPS_INSTALL_DIR   Install dir on VPS (default: C:\app)
#
# ============================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
CYN='\033[0;36m'
MAG='\033[0;35m'
GRY='\033[0;37m'
RST='\033[0m'

info()  { echo -e "${GRY}  [..]   $*${RST}"; }
pass()  { echo -e "${GRN}  [OK]   $*${RST}"; }
warn()  { echo -e "${YLW}  [WARN] $*${RST}"; }
step()  { echo -e "\n${MAG}============================================${RST}"; \
          echo -e "${MAG}  STEP $*${RST}"; \
          echo -e "${MAG}============================================${RST}"; }
abort() { echo -e "\n${RED}============================================${RST}"; \
          echo -e "${RED}  DEPLOY ABORTED: $*${RST}"; \
          echo -e "${RED}============================================${RST}"; exit 1; }

# ---------------------------------------------------------------------------
# Defaults (override via environment variables)
# ---------------------------------------------------------------------------
# GITHUB_PAT must be set as an environment variable — never hardcode it here.
# Export it in your shell before calling this script:
#   export GITHUB_PAT="ghp_..."
# Or store it in ~/.keyone-secrets (chmod 600) and source it:
#   source ~/.keyone-secrets
if [[ -z "${GITHUB_PAT:-}" ]]; then
  abort "GITHUB_PAT env var is required. Set it before running this script."
fi
GITHUB_REPO="https://github.com/yahyaek9999-dev/appkeyone.git"
GITHUB_REPO_WITH_PAT="https://${GITHUB_PAT}@github.com/yahyaek9999-dev/appkeyone.git"

VPS_HOST="${VPS_HOST:-217.154.163.16}"
VPS_SSH_USER="${VPS_SSH_USER:-Administrator}"
VPS_SSH_KEY="${VPS_SSH_KEY:-${HOME}/.ssh/id_rsa}"
VPS_INSTALL_DIR="${VPS_INSTALL_DIR:-C:\\app}"
VPS_DEPLOY_SCRIPT="${VPS_INSTALL_DIR}\\deploy\\deploy.ps1"

# Git settings
GIT_BRANCH="${GIT_BRANCH:-main}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-}"

# Script directory (repo root is one level up)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------
MODE="push-only"   # default
EXTRA_ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --push-only)   MODE="push-only";  shift ;;
    --vps-only)    MODE="vps-only";   shift ;;
    --full)        MODE="full";       shift ;;
    --message|-m)  COMMIT_MESSAGE="$2"; shift 2 ;;
    --branch|-b)   GIT_BRANCH="$2";     shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--push-only|--vps-only|--full] [-m \"commit message\"] [-b branch]"
      echo ""
      echo "  --push-only   (default) git add + commit + push to GitHub"
      echo "  --vps-only    SSH into VPS and run deploy.ps1 (no git push)"
      echo "  --full        push to GitHub AND trigger VPS deploy"
      exit 0
      ;;
    *) EXTRA_ARGS+=("$1"); shift ;;
  esac
done

T0=$(date +%s)

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
echo -e "${CYN}============================================${RST}"
echo -e "${CYN}  KEYONE deploy.sh${RST}"
echo -e "${CYN}  Mode       : ${MODE}${RST}"
echo -e "${CYN}  Branch     : ${GIT_BRANCH}${RST}"
echo -e "${CYN}  Repo root  : ${REPO_ROOT}${RST}"
echo -e "${CYN}  VPS        : ${VPS_HOST}${RST}"
echo -e "${CYN}============================================${RST}"

# ---------------------------------------------------------------------------
# STEP 0 — Pre-flight
# ---------------------------------------------------------------------------
step "0 :: Pre-flight"

if [[ ! -d "${REPO_ROOT}/.git" ]]; then
  abort "Not a git repository: ${REPO_ROOT}. Run: git init && git remote add origin ..."
fi

if ! command -v git &>/dev/null; then
  abort "'git' not found in PATH"
fi

pass "git found: $(git --version)"
pass "repo root: ${REPO_ROOT}"

# ---------------------------------------------------------------------------
# STEP 1 — Configure remote (inject PAT for CI)
# ---------------------------------------------------------------------------
if [[ "${MODE}" != "vps-only" ]]; then
  step "1 :: Configure git remote"

  cd "${REPO_ROOT}"

  # Always (re)set the remote URL with the embedded PAT so CI can push
  if git remote get-url origin &>/dev/null; then
    git remote set-url origin "${GITHUB_REPO_WITH_PAT}"
    pass "remote 'origin' URL updated (PAT injected)"
  else
    git remote add origin "${GITHUB_REPO_WITH_PAT}"
    pass "remote 'origin' added"
  fi
fi

# ---------------------------------------------------------------------------
# STEP 2 — Git add + commit + push
# ---------------------------------------------------------------------------
if [[ "${MODE}" == "push-only" || "${MODE}" == "full" ]]; then
  step "2 :: git add + commit + push"

  cd "${REPO_ROOT}"

  # Check for changes
  if git status --porcelain | grep -q .; then
    info "Staging all changes..."
    git add -A

    # Build commit message
    if [[ -z "${COMMIT_MESSAGE}" ]]; then
      TIMESTAMP="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
      CHANGED_COUNT=$(git diff --cached --name-only | wc -l | tr -d ' ')
      COMMIT_MESSAGE="deploy: ${CHANGED_COUNT} file(s) updated @ ${TIMESTAMP}"
    fi

    info "Committing: ${COMMIT_MESSAGE}"
    git commit -m "${COMMIT_MESSAGE}"
    pass "commit created: $(git rev-parse HEAD)"
  else
    warn "Working tree is clean — nothing to commit."
  fi

  # Push
  info "Pushing to origin/${GIT_BRANCH}..."
  git push origin "${GIT_BRANCH}" 2>&1 | while IFS= read -r line; do
    info "  git: ${line}"
  done

  if [[ "${PIPESTATUS[0]}" -ne 0 ]]; then
    abort "git push failed. Check PAT permissions and branch protections."
  fi

  pass "pushed to origin/${GIT_BRANCH}: $(git rev-parse HEAD)"
fi

# ---------------------------------------------------------------------------
# STEP 3 — Trigger VPS deploy via SSH
# ---------------------------------------------------------------------------
if [[ "${MODE}" == "vps-only" || "${MODE}" == "full" ]]; then
  step "3 :: Trigger VPS deploy (SSH)"

  if [[ ! -f "${VPS_SSH_KEY}" ]]; then
    warn "SSH key not found at ${VPS_SSH_KEY}"
    warn "Set VPS_SSH_KEY env var or add the key before running --vps-only / --full"
    abort "Cannot SSH into VPS without a valid key"
  fi

  info "SSH → ${VPS_SSH_USER}@${VPS_HOST}"
  info "Running: powershell.exe -File ${VPS_DEPLOY_SCRIPT} -GitPull"

  ssh -i "${VPS_SSH_KEY}" \
      -o StrictHostKeyChecking=accept-new \
      -o ConnectTimeout=30 \
      "${VPS_SSH_USER}@${VPS_HOST}" \
      "powershell.exe -NonInteractive -ExecutionPolicy Bypass \
         -File \"${VPS_DEPLOY_SCRIPT}\" -GitPull -InstallDir \"${VPS_INSTALL_DIR}\"" \
  || abort "VPS deploy.ps1 failed (SSH exit code $?)"

  pass "VPS deploy completed"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
T1=$(date +%s)
ELAPSED=$(( T1 - T0 ))

echo ""
echo -e "${GRN}============================================${RST}"
echo -e "${GRN}  DEPLOY SUCCEEDED in ${ELAPSED}s${RST}"
if command -v git &>/dev/null && [[ -d "${REPO_ROOT}/.git" ]]; then
  echo -e "${GRN}  HEAD: $(git -C "${REPO_ROOT}" rev-parse HEAD 2>/dev/null || echo 'n/a')${RST}"
fi
echo -e "${GRN}============================================${RST}"
echo ""
echo -e "${CYN}Next: smoke test https://app.keyone1.com/login and /admin/metrics${RST}"
