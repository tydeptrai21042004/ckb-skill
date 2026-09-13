#!/usr/bin/env bash
set -Eeuo pipefail

# SkillPass: easiest Testnet + Vercel setup.
#
# Default flow:
#   1) Reuse deployments/testnet.json when it already contains real metadata.
#   2) Otherwise install OffCKB, fund the OffCKB Testnet deployer if needed,
#      build capability-type, deploy it to CKB Testnet, and extract metadata.
#   3) Generate .env.vercel.generated automatically.
#   4) Link/create a Vercel project, provision Neon when DATABASE_URL is absent,
#      upload SkillPass env variables, validate, and deploy to production.
#
# Windows: run this from Git Bash or WSL.
#
# Useful overrides:
#   SKILLPASS_SKIP_VERCEL=1 bash setup-vercel.sh   # only CKB + env generation
#   SKILLPASS_FORCE_CONTRACT=1 bash setup-vercel.sh # force a new Testnet deploy
#   SKILLPASS_SKIP_FAUCET=1 bash setup-vercel.sh    # never request faucet funds
#   SKILLPASS_NO_GLOBAL_INSTALL=1 bash setup-vercel.sh
#
# TESTNET ONLY: OffCKB's built-in deployer key is public development material.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACT_DIR="$ROOT_DIR/contracts/capability-type"
CONTRACT_BIN="$CONTRACT_DIR/target/riscv64imac-unknown-none-elf/release/capability-type"
OFFCKB_OUT="$ROOT_DIR/deployments/offckb-testnet"
OFFCKB_SCRIPTS="$OFFCKB_OUT/scripts.json"
DEPLOYMENT_JSON="$ROOT_DIR/deployments/testnet.json"
GENERATED_ENV="$ROOT_DIR/.env.vercel.generated"
MIN_BALANCE_CKB="${SKILLPASS_MIN_DEPLOY_BALANCE_CKB:-2000}"

cyan='\033[1;36m'; green='\033[1;32m'; yellow='\033[1;33m'; red='\033[1;31m'; reset='\033[0m'
info() { printf '\n%b==> %s%b\n' "$cyan" "$*" "$reset"; }
ok() { printf '%b[OK] %s%b\n' "$green" "$*" "$reset"; }
warn() { printf '%b[WARN] %s%b\n' "$yellow" "$*" "$reset" >&2; }
die() { printf '\n%bERROR: %s%b\n' "$red" "$*" "$reset" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

cd "$ROOT_DIR"

info "Checking local prerequisites"
have node || die "Node.js is required. Install Node.js 22 LTS, then rerun this script."
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
if (!hex.test(String(d.codeHash || ''))) process.exit(1);
if (!hex.test(String(d.depTxHash || ''))) process.exit(1);
if (!['data','data1','data2','type'].includes(String(d.hashType || ''))) process.exit(1);
if (!Number.isInteger(Number(d.depIndex)) || Number(d.depIndex) < 0) process.exit(1);
NODE
}

if valid_deployment && [ "${SKILLPASS_FORCE_CONTRACT:-0}" != "1" ]; then
  info "Existing real deployments/testnet.json found"
  ok "Reusing the existing on-chain contract; no faucet or redeployment needed"
  node scripts/extract-offckb-deployment.mjs --from-deployment
else
  info "A fresh contract deployment is required"
  have cargo || die "Rust/Cargo is required only for the first contract deployment. Install rustup/Rust, reopen the terminal, then rerun."
  ok "Rust/Cargo is available"

  info "Preparing OffCKB"
  if ! have offckb; then
    [ "${SKILLPASS_NO_GLOBAL_INSTALL:-0}" != "1" ] || die "OffCKB is missing and automatic global install is disabled."
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
});')" || die "Could not determine the OffCKB deployer address from JSON output."
  printf 'Testnet deployer: %s\n' "$DEPLOYER_ADDRESS"

  info "Checking Testnet CKB balance"
  BALANCE_JSON="$(offckb --json balance "$DEPLOYER_ADDRESS" --network testnet --no-udt 2>"$ROOT_DIR/.offckb-balance.log")" || {
    cat "$ROOT_DIR/.offckb-balance.log" >&2 || true
    die "Could not query Testnet balance."
  }
  BALANCE_CKB="$(printf '%s' "$BALANCE_JSON" | node -e '
let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>{const j=JSON.parse(s); const v=Number(j.ckb ?? j.result?.ckb ?? 0); if(!Number.isFinite(v)) process.exit(2); process.stdout.write(String(v));});')" || die "Could not parse OffCKB balance output."
  printf 'Current Testnet balance: %s CKB\n' "$BALANCE_CKB"

  NEED_FUNDS="$(node -e "process.stdout.write(Number(process.argv[1]) < Number(process.argv[2]) ? '1' : '0')" "$BALANCE_CKB" "$MIN_BALANCE_CKB")"
  if [ "$NEED_FUNDS" = "1" ]; then
    [ "${SKILLPASS_SKIP_FAUCET:-0}" != "1" ] || die "Balance is below ${MIN_BALANCE_CKB} CKB and faucet use is disabled."
    info "Requesting Testnet funds through OffCKB's Pudge faucet helper"
    if ! offckb deposit "$DEPLOYER_ADDRESS" 10000 --network testnet; then
      cat >&2 <<MSG

The public Pudge faucet request failed. This normally means the faucet is empty,
rate-limited, or temporarily unavailable. Nothing in SkillPass was damaged.

Check the official faucet and rerun this same script later:
  https://faucet.nervos.org/

Address to fund:
  $DEPLOYER_ADDRESS
MSG
      exit 2
    fi
    ok "Faucet funding completed"
  else
    ok "Existing Testnet balance is sufficient; faucet step skipped"
  fi

  info "Building contracts/capability-type for CKB-VM"
  (
    cd "$CONTRACT_DIR"
    export RUSTFLAGS="-C passes=lower-atomic"
    cargo build --release --target riscv64imac-unknown-none-elf
  )
  [ -f "$CONTRACT_BIN" ] || die "Contract build completed but binary is missing: $CONTRACT_BIN"
  BIN_BYTES="$(wc -c < "$CONTRACT_BIN" | tr -d ' ')"
  [ "$BIN_BYTES" -le 512000 ] || die "Contract binary is ${BIN_BYTES} bytes; OffCKB ignores binaries larger than 500 KiB."
  ok "Contract binary ready (${BIN_BYTES} bytes)"

  info "Deploying capability-type to CKB Testnet"
  mkdir -p "$OFFCKB_OUT"
  offckb deploy \
    --network testnet \
    --target "$CONTRACT_BIN" \
    --output "$OFFCKB_OUT" \
    --yes

  [ -f "$OFFCKB_SCRIPTS" ] || die "OffCKB completed without creating $OFFCKB_SCRIPTS"

  info "Extracting the exact CKB deployment metadata"
  node scripts/extract-offckb-deployment.mjs \
    --scripts "$OFFCKB_SCRIPTS" \
    --contract capability-type \
    --deployment "$DEPLOYMENT_JSON" \
    --env "$GENERATED_ENV"
  ok "CKB metadata and Vercel env generated automatically"
fi

printf '\nGenerated files:\n  %s\n  %s\n' "$DEPLOYMENT_JSON" "$GENERATED_ENV"

if [ "${SKILLPASS_SKIP_VERCEL:-0}" = "1" ]; then
  info "Vercel phase skipped by SKILLPASS_SKIP_VERCEL=1"
  cat <<MSG
Next: import the repository into Vercel, connect Neon, then copy values from:
  $GENERATED_ENV
MSG
  exit 0
fi

info "Preparing Vercel CLI"
if ! have vercel; then
  [ "${SKILLPASS_NO_GLOBAL_INSTALL:-0}" != "1" ] || die "Vercel CLI is missing and automatic global install is disabled."
  npm install -g vercel@latest
fi
ok "Using $(vercel --version)"

info "Linking this folder to Vercel"
# Interactive on first use: Vercel may ask you to log in and choose/create a project.
vercel link

info "Checking for a connected Neon DATABASE_URL"
if ! vercel env ls production 2>/dev/null | grep -q 'DATABASE_URL'; then
  warn "DATABASE_URL is not connected yet. Starting the official Neon integration installer."
  vercel integration add neon
fi
if ! vercel env ls production 2>/dev/null | grep -q 'DATABASE_URL'; then
  die "Neon did not expose DATABASE_URL to Production. Open Vercel -> Project -> Storage/Marketplace -> Neon, connect it, then rerun setup-vercel.sh."
fi
ok "Neon DATABASE_URL is connected; no local PostgreSQL setup is needed"

info "Uploading generated SkillPass environment variables to Vercel"
TMP_VALUE="$(mktemp)"
trap 'rm -f "$TMP_VALUE" "$ROOT_DIR/.offckb-accounts.log" "$ROOT_DIR/.offckb-balance.log"' EXIT
while IFS='=' read -r key value; do
  case "$key" in
    ''|'#'*) continue ;;
  esac
  printf '%s' "$value" > "$TMP_VALUE"
  case "$key" in
    FACILITATOR_AUTH_TOKEN|DEEP_HEALTH_TOKEN|FIBER_RPC_TOKEN|SKILLPASS_PROVIDER_MANIFEST_PRIVATE_KEY|SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY)
      vercel env add "$key" production --force --sensitive < "$TMP_VALUE" >/dev/null
      ;;
    *)
      vercel env add "$key" production --force < "$TMP_VALUE" >/dev/null
      ;;
  esac
  printf '  set %s\n' "$key"
done < "$GENERATED_ENV"
ok "SkillPass environment variables uploaded to Production only; secrets marked Sensitive"

info "Running local release preflight"
node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json: OK')"
node --check apps/live-service/server.mjs
node --check apps/fiber-facilitator/server.mjs
node --check packages/http-security/src/index.mjs
node --check packages/production-store/src/config.mjs
node --check packages/x402-fiber/src/backends.mjs
node --check scripts/check-vercel-env.mjs
ok "Static syntax/configuration checks passed"

info "Validating the actual Production environment without writing secrets to disk"
vercel env run -e production -- node scripts/check-vercel-env.mjs
ok "Production environment passed the hardened checker"

info "Deploying SkillPass to Vercel production"
DEPLOYMENT_URL="$(vercel --prod --yes)"
printf 'Production URL: %s\n' "$DEPLOYMENT_URL"

if have curl && [[ "$DEPLOYMENT_URL" =~ ^https:// ]]; then
  info "Running cheap post-deployment smoke checks"
  curl --fail --silent --show-error --max-time 12 "$DEPLOYMENT_URL/health" >/dev/null || die "Production /health check failed"
  curl --fail --silent --show-error --max-time 12 "$DEPLOYMENT_URL/api/config" >/dev/null || die "Production /api/config check failed"
  HEADERS="$(curl --fail --silent --show-error --max-time 12 -I "$DEPLOYMENT_URL/health" || true)"
  printf '%s\n' "$HEADERS" | grep -qi '^x-content-type-options: nosniff' || warn "Could not confirm X-Content-Type-Options from the smoke response; inspect Vercel response headers manually."
  ok "Production smoke checks completed"
else
  warn "curl is unavailable or the Vercel URL could not be parsed; run /health and /api/config checks manually."
fi

warn "Before sharing the public URL, configure the Vercel Firewall rate-limit rule. Run: bash setup-vercel-firewall.sh"

cat <<'MSG'

============================================================
SkillPass setup finished.

You can turn off this computer after deployment. Vercel + Neon + CKB Testnet
continue running independently. Your PC is only needed again when you update
code or deliberately deploy a new contract.

For the initial easy deployment:
  PAYMENTS_REQUIRED=false
  FIBER_BACKEND=mock

Real Fiber/FNN payment mode can be enabled later with a remotely reachable
FIBER_RPC_URL; do not point Vercel at localhost/127.0.0.1.
============================================================
MSG
