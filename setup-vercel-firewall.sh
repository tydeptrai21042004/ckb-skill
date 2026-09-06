#!/usr/bin/env bash
set -Eeuo pipefail

# SkillPass public-release edge guard.
# Creates ONE conservative Vercel Firewall rate-limit rule for /api/*.
# This complements (does not replace) the lower application-level limits.

cyan='\033[1;36m'; green='\033[1;32m'; yellow='\033[1;33m'; red='\033[1;31m'; reset='\033[0m'
info(){ printf '\n%b==> %s%b\n' "$cyan" "$*" "$reset"; }
ok(){ printf '%b[OK] %s%b\n' "$green" "$*" "$reset"; }
warn(){ printf '%b[WARN] %s%b\n' "$yellow" "$*" "$reset" >&2; }
die(){ printf '\n%bERROR: %s%b\n' "$red" "$*" "$reset" >&2; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

have vercel || die "Vercel CLI is required. Run bash setup-vercel.sh first."
[ -d .vercel ] || die "This folder is not linked to a Vercel project. Run: vercel link"

cat <<'MSG'
This creates an EDGE rate-limit rule before requests reach SkillPass Functions.
Recommended public prototype rule:
  path: /api/*
  key: client IP
  limit: 30 requests / 1 minute
  action after limit: HTTP 429

SkillPass itself is stricter on expensive routes:
  /api/challenge: 12/min/IP
  /api/analyze:    8/min/IP

If this project already has custom Firewall rules, inspect them first so you do
not create a duplicate/conflicting rule. Hobby projects may have a limited
number of rate-limit rules.
MSG

if [ "${SKILLPASS_FIREWALL_YES:-0}" != "1" ]; then
  printf '\nCreate this Vercel Firewall rule now? [y/N] '
  read -r answer
  case "$answer" in y|Y|yes|YES) ;; *) warn "No changes made."; exit 0;; esac
fi

info "Creating Vercel Firewall rate limit"
vercel firewall rules add --ai "Create one rate limit rule named SkillPass API cost guard. Match requests whose path starts with /api/. Count requests by client IP. Allow at most 30 requests per 1 minute per IP. When the limit is exceeded, return HTTP 429. Do not block /health, /livez, static assets, or other non-/api paths."
ok "Firewall command completed"

cat <<'MSG'

IMPORTANT FINAL CHECK IN VERCEL DASHBOARD
  Project -> Firewall -> Custom Rules

Confirm the generated rule really says:
  /api/* + per-IP + 30/minute + 429

Then test your normal wallet flow. If it is too strict for a legitimate flow,
adjust the EDGE rule gradually; do NOT raise the application-level /analyze
limit first.
MSG
