#!/usr/bin/env bash
# ============================================================
#  KEYONE — validate-env.sh
#  Validates a saas .env file before deploying to the VPS.
#
#  Usage:
#    ./validate-env.sh [path/to/.env]
#
#  If no path is given, looks for saas/.env relative to the
#  repo root (one level above this script's directory).
#
#  Exit codes:
#    0   All required vars present and appear valid
#    1   One or more critical issues found
# ============================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Colour helpers
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GRN='\033[0;32m'
YLW='\033[0;33m'
CYN='\033[0;36m'
GRY='\033[0;37m'
RST='\033[0m'

ok()   { echo -e "${GRN}  [OK]   $*${RST}"; }
warn() { echo -e "${YLW}  [WARN] $*${RST}"; WARN_COUNT=$(( WARN_COUNT + 1 )); }
fail() { echo -e "${RED}  [FAIL] $*${RST}"; FAIL_COUNT=$(( FAIL_COUNT + 1 )); }
info() { echo -e "${GRY}  [..]   $*${RST}"; }

FAIL_COUNT=0
WARN_COUNT=0

# ---------------------------------------------------------------------------
# Locate .env file
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_ENV="${REPO_ROOT}/saas/.env"

ENV_FILE="${1:-${DEFAULT_ENV}}"

echo -e "${CYN}============================================${RST}"
echo -e "${CYN}  KEYONE — .env validator${RST}"
echo -e "${CYN}  File: ${ENV_FILE}${RST}"
echo -e "${CYN}============================================${RST}"
echo ""

if [[ ! -f "${ENV_FILE}" ]]; then
  echo -e "${RED}ERROR: .env file not found at: ${ENV_FILE}${RST}"
  echo ""
  echo "  Create it by copying the example:"
  echo "    cp saas/.env.example saas/.env"
  echo "  Then fill in real values."
  exit 1
fi

# ---------------------------------------------------------------------------
# Parser: load key=value pairs (handles quoted values, ignores comments)
# ---------------------------------------------------------------------------
declare -A ENV_VARS

while IFS= read -r line || [[ -n "${line}" ]]; do
  # Skip comments and blanks
  [[ "${line}" =~ ^[[:space:]]*# ]] && continue
  [[ -z "${line// }" ]] && continue

  # Split on first '='
  key="${line%%=*}"
  val="${line#*=}"

  # Strip surrounding quotes (single or double)
  val="${val#\"}"
  val="${val%\"}"
  val="${val#\'}"
  val="${val%\'}"

  # Trim whitespace from key
  key="${key// /}"

  [[ -n "${key}" ]] && ENV_VARS["${key}"]="${val}"
done < "${ENV_FILE}"

# ---------------------------------------------------------------------------
# Helper: get a value (returns empty string if key not present)
# ---------------------------------------------------------------------------
get() {
  echo "${ENV_VARS[$1]+${ENV_VARS[$1]}}"
}

has() {
  local v; v="$(get "$1")"
  [[ -n "${v}" ]]
}

# ---------------------------------------------------------------------------
# Known placeholder patterns
# ---------------------------------------------------------------------------
is_placeholder() {
  local v="$1"
  [[ "${v}" =~ ^(REPLACE_WITH|change[-_]?me|change[-_]?this|your[-_]|PASSWORD|xxx+|todo).*$ ]] && return 0 || return 1
}

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

echo "--- Required variables ---"

# AUTH_SECRET
v="$(get AUTH_SECRET)"
if [[ -z "${v}" ]]; then
  fail "AUTH_SECRET is missing or empty. Generate with: openssl rand -hex 32"
elif is_placeholder "${v}"; then
  fail "AUTH_SECRET looks like a placeholder: '${v}'. Replace it with a real secret."
elif [[ ${#v} -lt 32 ]]; then
  fail "AUTH_SECRET is too short (${#v} chars; need >= 32). Generate with: openssl rand -hex 32"
else
  ok "AUTH_SECRET — set (${#v} chars)"
fi

# DATABASE_URL
v="$(get DATABASE_URL)"
if [[ -z "${v}" ]]; then
  fail "DATABASE_URL is missing or empty."
elif is_placeholder "${v}"; then
  fail "DATABASE_URL looks like a placeholder: '${v}'"
else
  ok "DATABASE_URL — ${v}"
fi

# SAAS_INTERNAL_SECRET
v="$(get SAAS_INTERNAL_SECRET)"
if [[ -z "${v}" ]]; then
  fail "SAAS_INTERNAL_SECRET is missing or empty. Generate with: openssl rand -hex 24"
elif is_placeholder "${v}"; then
  fail "SAAS_INTERNAL_SECRET looks like a placeholder: '${v}'. Replace it."
elif [[ ${#v} -lt 16 ]]; then
  fail "SAAS_INTERNAL_SECRET is too short (${#v} chars; need >= 16)."
else
  ok "SAAS_INTERNAL_SECRET — set (${#v} chars)"
fi

echo ""
echo "--- Core settings ---"

# NODE_ENV
v="$(get NODE_ENV)"
if [[ "${v}" != "production" ]]; then
  warn "NODE_ENV=${v:-<unset>} (expected 'production' for VPS deploy)"
else
  ok "NODE_ENV=production"
fi

# PORT
v="$(get PORT)"
if [[ -z "${v}" ]]; then
  warn "PORT not set; will default to 3000"
else
  ok "PORT=${v}"
fi

# NEXT_PUBLIC_SITE_URL
v="$(get NEXT_PUBLIC_SITE_URL)"
if [[ -z "${v}" ]]; then
  warn "NEXT_PUBLIC_SITE_URL is not set; sitemap/SEO will use fallback"
elif [[ "${v}" != https://* ]]; then
  warn "NEXT_PUBLIC_SITE_URL does not start with https:// — is this intentional? (${v})"
else
  ok "NEXT_PUBLIC_SITE_URL=${v}"
fi

echo ""
echo "--- LLM ---"

v="$(get LLM_API_URL)"
if [[ -z "${v}" ]]; then
  warn "LLM_API_URL not set; will default to http://127.0.0.1:7788"
else
  ok "LLM_API_URL=${v}"
fi

v="$(get LLM_API_KEY)"
if [[ -z "${v}" ]]; then
  warn "LLM_API_KEY not set"
elif is_placeholder "${v}"; then
  warn "LLM_API_KEY looks like a placeholder ('${v}')"
else
  ok "LLM_API_KEY — set"
fi

ok "LLM_MODEL=$(get LLM_MODEL || echo gpt-4o-mini)"

echo ""
echo "--- WhatsApp service ---"

v="$(get WHATSAPP_SERVICE_URL)"
if [[ -z "${v}" ]]; then
  warn "WHATSAPP_SERVICE_URL not set; will default to http://127.0.0.1:3001"
else
  ok "WHATSAPP_SERVICE_URL=${v}"
fi

v="$(get WHATSAPP_SHARED_SECRET)"
if [[ -z "${v}" ]]; then
  warn "WHATSAPP_SHARED_SECRET not set"
elif is_placeholder "${v}"; then
  warn "WHATSAPP_SHARED_SECRET looks like a placeholder — update it"
else
  ok "WHATSAPP_SHARED_SECRET — set (${#v} chars)"
fi

echo ""
echo "--- Feature flags ---"

meta="$(get META_CLOUD_ENABLED)"
if [[ "${meta}" == "1" ]]; then
  ok "META_CLOUD_ENABLED=1 (active)"
  v="$(get META_APP_SECRET)"
  if [[ -z "${v}" ]]; then
    fail "META_CLOUD_ENABLED=1 but META_APP_SECRET is missing — webhook signatures will fail"
  else
    ok "META_APP_SECRET — set"
  fi
else
  ok "META_CLOUD_ENABLED=${meta:-0} (disabled)"
fi

bullmq="$(get ENABLE_BULLMQ)"
if [[ "${bullmq}" == "1" ]]; then
  ok "ENABLE_BULLMQ=1 (active)"
  v="$(get UPSTASH_REDIS_URL)"
  if [[ -z "${v}" ]]; then
    fail "ENABLE_BULLMQ=1 but UPSTASH_REDIS_URL is missing — BullMQ workers will fail"
  else
    ok "UPSTASH_REDIS_URL — set"
  fi
else
  ok "ENABLE_BULLMQ=${bullmq:-0} (disabled)"
fi

echo ""
echo "--- Optional / Observability ---"

v="$(get NEXT_PUBLIC_SENTRY_DSN)"
if [[ -z "${v}" ]]; then
  warn "NEXT_PUBLIC_SENTRY_DSN not set — Sentry error tracking disabled"
else
  ok "NEXT_PUBLIC_SENTRY_DSN — set"
fi

v="$(get SENTRY_AUTH_TOKEN)"
if [[ -z "${v}" ]]; then
  info "SENTRY_AUTH_TOKEN not set (only needed for source map uploads during build)"
else
  ok "SENTRY_AUTH_TOKEN — set"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${CYN}============================================${RST}"

if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  echo -e "${RED}  RESULT: ${FAIL_COUNT} FAILURE(S), ${WARN_COUNT} WARNING(S)${RST}"
  echo -e "${CYN}============================================${RST}"
  echo ""
  echo "  Fix the failures above before deploying."
  echo "  Refer to saas/.env.example for documentation on each variable."
  echo ""
  exit 1
elif [[ "${WARN_COUNT}" -gt 0 ]]; then
  echo -e "${YLW}  RESULT: PASSED with ${WARN_COUNT} WARNING(S)${RST}"
  echo -e "${CYN}============================================${RST}"
  echo ""
  echo "  Warnings are non-blocking but review them before going live."
  echo ""
  exit 0
else
  echo -e "${GRN}  RESULT: ALL CHECKS PASSED${RST}"
  echo -e "${CYN}============================================${RST}"
  echo ""
  exit 0
fi
