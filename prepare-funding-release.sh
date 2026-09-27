#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

fail(){ echo "[FAIL] $*" >&2; exit 1; }
info(){ echo "[funding-release] $*"; }

command -v node >/dev/null 2>&1 || fail "Node.js is required"
command -v npm >/dev/null 2>&1 || fail "npm is required"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$node_major" == 24 ]] || fail "Node 24.x is required; current: $(node --version)"

info "Generating/updating npm lockfile from the exact workspace dependency graph"
npm install --package-lock-only --ignore-scripts
[[ -f package-lock.json ]] || fail "package-lock.json was not generated"

info "Refreshing the repository dependency declaration lock"
node scripts/dependency-lock.mjs
node scripts/dependency-lock.mjs --check

if command -v cargo >/dev/null 2>&1; then
  info "Generating contract Cargo.lock"
  (cd contracts/capability-type && cargo generate-lockfile)
else
  fail "cargo/Rust 1.95.0 is required to generate contracts/capability-type/Cargo.lock"
fi

info "Installing exactly from package-lock.json"
npm ci --ignore-scripts

info "Running funding candidate checks"
npm run verify:funding-candidate
make -C contracts/capability-type test

info "Lockfiles and verification are ready. Real Testnet evidence is intentionally NOT fabricated by this script."
echo "Next: npm run evidence:testnet:require && npm run evidence:verify"
