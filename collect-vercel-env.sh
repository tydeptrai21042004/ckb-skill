#!/usr/bin/env bash
set -Eeuo pipefail

# SkillPass - collect/generate all manual Vercel GUI environment variables.
#
# This script DOES NOT use the Vercel CLI and DOES NOT modify your Vercel account.
# It only:
#   1) reuses an existing CKB Testnet contract deployment when available, OR
#   2) on first use, prepares/funds an OffCKB Testnet account, builds and deploys
#      contracts/capability-type, then extracts the real deployment metadata;
#   3) generates a random FACILITATOR_AUTH_TOKEN;
#   4) writes .env.vercel.gui for copy/paste into Vercel Dashboard.
#
# DATABASE_URL is intentionally NOT generated here. Create/connect Neon from the
# Vercel GUI; the Neon integration injects DATABASE_URL into the Vercel project.
# FACILITATOR_URL is also NOT generated; vercel.json creates the service binding.
#
# Windows: run in Git Bash or WSL from the repository root:
#   bash collect-vercel-env.sh
#
# Optional overrides:
#   SKILLPASS_FORCE_CONTRACT=1 bash collect-vercel-env.sh
#   SKILLPASS_SKIP_FAUCET=1 bash collect-vercel-env.sh
#   SKILLPASS_NO_GLOBAL_INSTALL=1 bash collect-vercel-env.sh
#
# TESTNET ONLY: OffCKB built-in development accounts/keys must never hold mainnet
# or valuable assets.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/capability-type"
CONTRACT_BIN="$CONTRACT_DIR/target/riscv64imac-unknown-none-elf/release/capability-type"
OFFCKB_OUT="$ROOT_DIR/deployments/offckb-testnet"
OFFCKB_SCRIPTS="$OFFCKB_OUT/scripts.json"
DEPLOYMENT_JSON="$ROOT_DIR/deployments/testnet.json"
GENERATED_ENV="$ROOT_DIR/.env.vercel.gui"
MIN_BALANCE_CKB="${SKILLPASS_MIN_DEPLOY_BALANCE_CKB:-2000}"

cyan='\033[1;36m'; green='\033[1;32m'; yellow='\033[1;33m'; red='\033[1;31m'; reset='\033[0m'
info() { printf '\n%b==> %s%b\n' "$cyan" "$*" "$reset"; }
ok() { printf '%b[OK] %s%b\n' "$green" "$*" "$reset"; }
warn() { printf '%b[WARN] %s%b\n' "$yellow" "$*" "$reset" >&2; }
die() { printf '\n%bERROR: %s%b\n' "$red" "$*" "$reset" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
cleanup() { rm -f "$ROOT_DIR/.offckb-accounts.log" "$ROOT_DIR/.offckb-balance.log"; }
trap cleanup EXIT

cd "$ROOT_DIR"

info "Checking local prerequisites"
have node || die "Node.js is required. Install Node.js 22 LTS, reopen Git Bash, then rerun."
have npm || die "npm is required."
NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
[ "$NODE_MAJOR" -ge 22 ] || die "SkillPass requires Node.js >= 22. Current: $(node --version)"
ok "Node $(node --version) and npm are available"

valid_deployment() {
  node - "$DEPLOYMENT_JSON" <<'NODE' >/dev/null 2>&1
const fs = require('fs');
const p = process.argv[2];
if (!fs.existsSync(p)) process.exit(1);
const d = JSON.parse(fs.readFileSync(p, 'utf8'));
const hex = /^0x[0-9a-fA-F]{64}$/;
if (d.network !== 'testnet') process.exit(1);
if (!hex.test(String(d.codeHash || ''))) process.exit(1);
if (!hex.test(String(d.depTxHash || ''))) process.exit(1);
if (!['data','data1','data2','type'].includes(String(d.hashType || ''))) process.exit(1);
const index = Number(d.depIndex);
if (!Number.isInteger(index) || index < 0 || index > 65535) process.exit(1);
NODE
}

if valid_deployment && [ "${SKILLPASS_FORCE_CONTRACT:-0}" != "1" ]; then
  info "Found an existing real CKB Testnet deployment"
  ok "Reusing deployments/testnet.json; no faucet, Rust build, or new on-chain transaction is needed"
  node scripts/extract-offckb-deployment.mjs \
    --from-deployment \
    --deployment "$DEPLOYMENT_JSON" \
    --env "$GENERATED_ENV"
else
  info "No reusable Testnet deployment found; first-time contract deployment is required"
  have cargo || die "Rust/Cargo is needed for the first contract deployment. Install rustup/Rust, reopen the terminal, then rerun."
  ok "Rust/Cargo is available"

  info "Preparing OffCKB"
  if ! have offckb; then
    [ "${SKILLPASS_NO_GLOBAL_INSTALL:-0}" != "1" ] || die "OffCKB is missing and automatic install is disabled."
    npm install -g @offckb/cli
  fi
  ok "Using $(offckb --version)"

  info "Reading the OffCKB Testnet deployer account"
  ACCOUNTS_JSON="$(offckb --json accounts 2>"$ROOT_DIR/.offckb-accounts.log")" || {
    cat "$ROOT_DIR/.offckb-accounts.log" >&2 || true
    die "Could not read OffCKB accounts."
  }
  DEPLOYER_ADDRESS="$(printf '%s' "$ACCOUNTS_JSON" | node -e '
let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{
  const j=JSON.parse(s); const a=Array.isArray(j)?j:(j.accounts||j.result?.accounts||[]);
  if(!Array.isArray(a)||!a.length) process.exit(2);
  const chosen=a.find(x=>/deployer/i.test(String(x.name||x.label||"")))||a[a.length-1];
  const address=String(chosen.address||chosen.ckbAddress||"");
  if(!/^ckt1[a-z0-9]+$/i.test(address)) process.exit(3);
  process.stdout.write(address);
});')" || die "Could not determine the Testnet deployer address from OffCKB JSON output."
  printf 'Testnet deployer address: %s\n' "$DEPLOYER_ADDRESS"

  info "Checking Testnet CKB balance"
  BALANCE_JSON="$(offckb --json balance "$DEPLOYER_ADDRESS" --network testnet --no-udt 2>"$ROOT_DIR/.offckb-balance.log")" || {
    cat "$ROOT_DIR/.offckb-balance.log" >&2 || true
    die "Could not query the Testnet balance."
  }
  BALANCE_CKB="$(printf '%s' "$BALANCE_JSON" | node -e '
let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{
  const j=JSON.parse(s); const v=Number(j.ckb ?? j.result?.ckb ?? 0);
  if(!Number.isFinite(v)) process.exit(2); process.stdout.write(String(v));
});')" || die "Could not parse OffCKB balance output."
  printf 'Current Testnet balance: %s CKB\n' "$BALANCE_CKB"

  NEED_FUNDS="$(node -e "process.stdout.write(Number(process.argv[1]) < Number(process.argv[2]) ? '1' : '0')" "$BALANCE_CKB" "$MIN_BALANCE_CKB")"
  if [ "$NEED_FUNDS" = "1" ]; then
    [ "${SKILLPASS_SKIP_FAUCET:-0}" != "1" ] || die "Balance is below ${MIN_BALANCE_CKB} CKB and automatic faucet use is disabled."
    info "Requesting Testnet CKB through OffCKB's faucet helper"
    if ! offckb deposit "$DEPLOYER_ADDRESS" 10000 --network testnet; then
      cat >&2 <<MSG

The public Testnet faucet request failed. This normally means the faucet is
empty, rate-limited, or temporarily unavailable. No Vercel setting was changed
and no secret was uploaded anywhere.

Fund this TESTNET-ONLY address and rerun the same script:
  $DEPLOYER_ADDRESS

Official faucet:
  https://faucet.nervos.org/
MSG
      exit 2
    fi
    ok "Testnet funding completed"
  else
    ok "Existing Testnet balance is sufficient; faucet skipped"
  fi

  info "Building contracts/capability-type for CKB-VM"
  (
    cd "$CONTRACT_DIR"
    export RUSTFLAGS="-C passes=lower-atomic"
    cargo build --release --target riscv64imac-unknown-none-elf
  )
  [ -f "$CONTRACT_BIN" ] || die "Contract build finished but binary is missing: $CONTRACT_BIN"
  BIN_BYTES="$(wc -c < "$CONTRACT_BIN" | tr -d ' ')"
  [ "$BIN_BYTES" -le 512000 ] || die "Contract binary is ${BIN_BYTES} bytes; refusing unusually large deployment."
  ok "Contract binary ready (${BIN_BYTES} bytes)"

  info "Deploying capability-type to CKB Testnet"
  rm -rf "$OFFCKB_OUT"
  mkdir -p "$OFFCKB_OUT"
  offckb deploy \
    --network testnet \
    --target "$CONTRACT_BIN" \
    --output "$OFFCKB_OUT" \
    --yes

  [ -f "$OFFCKB_SCRIPTS" ] || die "OffCKB finished but scripts.json was not found at: $OFFCKB_SCRIPTS"

  info "Extracting the real on-chain deployment metadata"
  node scripts/extract-offckb-deployment.mjs \
    --scripts "$OFFCKB_SCRIPTS" \
    --contract capability-type \
    --deployment "$DEPLOYMENT_JSON" \
    --env "$GENERATED_ENV"
fi

[ -f "$GENERATED_ENV" ] || die "Expected env output is missing: $GENERATED_ENV"
chmod 600 "$GENERATED_ENV" 2>/dev/null || true

info "Validating generated Vercel GUI environment values"
set -a
# This file is generated by our own extractor and contains only KEY=VALUE lines.
# shellcheck disable=SC1090
. "$GENERATED_ENV"
set +a
# Neon injects the real DATABASE_URL in Vercel. A non-secret placeholder is used
# only so the existing production checker can validate every other variable now.
DATABASE_URL='postgresql://vercel-gui-placeholder.invalid/skillpass' node scripts/check-vercel-env.mjs
ok "Generated manual environment values passed the hardened checker"

info "Your Vercel GUI environment file is ready"
printf '\n  %s\n\n' "$GENERATED_ENV"
printf '%s\n' 'DO NOT commit or upload this file to GitHub.'
printf '%s\n' 'In Vercel Dashboard, paste its KEY=VALUE lines into Project -> Settings -> Environment Variables.'
printf '%s\n' 'Use Production scope for the first public deployment.'
printf '%s\n' 'Mark FACILITATOR_AUTH_TOKEN as Sensitive.'
printf '%s\n' 'Do NOT create DATABASE_URL manually: connect Neon in the Vercel GUI.'
printf '%s\n' 'Do NOT create FACILITATOR_URL manually: vercel.json provides the private service binding.'
printf '\nDetailed GUI guide: HUONG_DAN_VERCEL_GUI_VI.md\n'
