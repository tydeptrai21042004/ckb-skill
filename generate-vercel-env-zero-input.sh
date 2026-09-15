#!/usr/bin/env bash
set -euo pipefail

# SkillPass zero-input Vercel env generator
#
# Run with ONE command:
#   bash generate-vercel-env-zero-input.sh
#
# No arguments. No prompts.
#
# It resolves CAPABILITY_TRUSTED_ISSUER_ID in this order:
#   1) reuse a valid value from an existing local env file;
#   2) recover issuer_id from a live Capability Cell on CKB Testnet;
#   3) if no existing issuer can be found, generate a NEW CKB Testnet issuer
#      wallet locally and save its private key to .skillpass-issuer.local.env.
#
# It ALWAYS generates fresh:
#   - SKILLPASS_PROVIDER_MANIFEST_PRIVATE_KEY
#   - SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY
#   - FACILITATOR_AUTH_TOKEN
#
# Output:
#   .env.vercel.gui
#
# If a new issuer wallet is required:
#   .skillpass-issuer.local.env
#
# SECURITY:
#   - Never commit either generated secret file.
#   - .skillpass-issuer.local.env must NOT be uploaded to Vercel.
#   - DATABASE_URL is expected from the Vercel Neon integration.
#   - Re-running this script rotates provider/gateway/facilitator secrets.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

OUTPUT_FILE="${OUTPUT_FILE:-.env.vercel.gui}"
ISSUER_SECRET_FILE="${ISSUER_SECRET_FILE:-.skillpass-issuer.local.env}"

DEFAULT_CAPABILITY_CODE_HASH="0x3b635ad028a82e3ac5157ee7f011971271ec2eb2658882c91f8bd976b2aa91e2"
DEFAULT_CAPABILITY_HASH_TYPE="data2"
DEFAULT_CAPABILITY_DEP_TX_HASH="0x9d2e4e4c271824fafa01ca500bd3f610acb410092155ae2915041a176d7d5832"
DEFAULT_CAPABILITY_DEP_INDEX="0"

ENV_CANDIDATES=(
  ".env.vercel.gui"
  ".env.vercel.generated"
  ".env.production"
  ".env.testnet"
  ".env.local"
  ".env"
)

TESTNET_RPCS=(
  "https://testnet.ckb.dev/"
  "https://testnet.ckbapp.dev/"
)

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

note() {
  printf '[SkillPass] %s\n' "$*"
}

command -v node >/dev/null 2>&1 || die "Node.js is required."
command -v npm >/dev/null 2>&1 || die "npm is required."

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node.js 20+ is required. Node 24 is recommended."

is_hex32() {
  [[ "${1:-}" =~ ^0x[0-9a-fA-F]{64}$ ]]
}

is_hash_type() {
  case "${1:-}" in
    data|data1|data2|type) return 0 ;;
    *) return 1 ;;
  esac
}

read_env_value() {
  local key="$1"
  local file value

  for file in "${ENV_CANDIDATES[@]}"; do
    [ -f "$file" ] || continue

    value="$(
      awk -v k="$key" '
        index($0, k "=") == 1 {
          sub("^[^=]*=", "", $0)
          print
          exit
        }
      ' "$file"
    )"

    if [ -n "${value:-}" ]; then
      # Strip one layer of surrounding quotes if present.
      value="${value#\"}"
      value="${value%\"}"
      value="${value#\'}"
      value="${value%\'}"
      printf '%s' "$value"
      return 0
    fi
  done

  return 1
}

read_deployment_json_value() {
  local field="$1"
  [ -f "deployments/testnet.json" ] || return 1

  DEPLOYMENT_FIELD="$field" node --input-type=module <<'NODE' 2>/dev/null
import { readFileSync } from "node:fs";

const obj = JSON.parse(readFileSync("deployments/testnet.json", "utf8"));
const field = process.env.DEPLOYMENT_FIELD;

const aliases = {
  codeHash: ["codeHash", "code_hash"],
  hashType: ["hashType", "hash_type"],
  depTxHash: ["depTxHash", "dep_tx_hash", "txHash", "tx_hash"],
  depIndex: ["depIndex", "dep_index", "index"],
};

function deepFind(value, keys) {
  if (!value || typeof value !== "object") return undefined;

  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(value, k)) return value[k];
  }

  for (const child of Object.values(value)) {
    const found = deepFind(child, keys);
    if (found !== undefined) return found;
  }

  return undefined;
}

const found = deepFind(obj, aliases[field] || [field]);
if (found !== undefined && found !== null) {
  process.stdout.write(String(found));
}
NODE
}

choose_value() {
  local env_key="$1"
  local deployment_field="$2"
  local fallback="$3"
  local value=""

  value="$(read_env_value "$env_key" || true)"
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi

  value="$(read_deployment_json_value "$deployment_field" || true)"
  if [ -n "$value" ]; then
    printf '%s' "$value"
    return
  fi

  printf '%s' "$fallback"
}

CAPABILITY_CODE_HASH="$(choose_value CAPABILITY_CODE_HASH codeHash "$DEFAULT_CAPABILITY_CODE_HASH")"
CAPABILITY_HASH_TYPE="$(choose_value CAPABILITY_HASH_TYPE hashType "$DEFAULT_CAPABILITY_HASH_TYPE")"
CAPABILITY_DEP_TX_HASH="$(choose_value CAPABILITY_DEP_TX_HASH depTxHash "$DEFAULT_CAPABILITY_DEP_TX_HASH")"
CAPABILITY_DEP_INDEX="$(choose_value CAPABILITY_DEP_INDEX depIndex "$DEFAULT_CAPABILITY_DEP_INDEX")"

is_hex32 "$CAPABILITY_CODE_HASH" || die "Invalid CAPABILITY_CODE_HASH: $CAPABILITY_CODE_HASH"
is_hash_type "$CAPABILITY_HASH_TYPE" || die "Invalid CAPABILITY_HASH_TYPE: $CAPABILITY_HASH_TYPE"
is_hex32 "$CAPABILITY_DEP_TX_HASH" || die "Invalid CAPABILITY_DEP_TX_HASH: $CAPABILITY_DEP_TX_HASH"
[[ "$CAPABILITY_DEP_INDEX" =~ ^[0-9]+$ ]] || die "Invalid CAPABILITY_DEP_INDEX: $CAPABILITY_DEP_INDEX"

recover_existing_issuer_from_env() {
  local candidate
  candidate="$(read_env_value CAPABILITY_TRUSTED_ISSUER_ID || true)"
  if is_hex32 "$candidate"; then
    printf '%s' "${candidate,,}"
    return 0
  fi

  # If a rotation allowlist exists, reuse its first valid issuer.
  candidate="$(read_env_value CAPABILITY_TRUSTED_ISSUER_IDS || true)"
  if [ -n "$candidate" ]; then
    IFS=',' read -ra ids <<< "$candidate"
    local item
    for item in "${ids[@]}"; do
      item="${item//[[:space:]]/}"
      if is_hex32 "$item"; then
        printf '%s' "${item,,}"
        return 0
      fi
    done
  fi

  return 1
}

recover_issuer_from_chain() {
  local rpc="$1"

  RPC_URL="$rpc" \
  CODE_HASH="$CAPABILITY_CODE_HASH" \
  HASH_TYPE="$CAPABILITY_HASH_TYPE" \
  node --input-type=module <<'NODE'
const rpc = process.env.RPC_URL;
const codeHash = process.env.CODE_HASH;
const hashType = process.env.HASH_TYPE;

const body = {
  id: 1,
  jsonrpc: "2.0",
  method: "get_cells",
  params: [
    {
      script: {
        code_hash: codeHash,
        hash_type: hashType,
        args: "0x",
      },
      script_type: "type",
      script_search_mode: "prefix",
      with_data: true,
    },
    "desc",
    "0x64",
  ],
};

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 7000);

try {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: controller.signal,
  });

  if (!response.ok) process.exit(2);

  const json = await response.json();
  if (json.error) process.exit(3);

  const objects = Array.isArray(json?.result?.objects)
    ? json.result.objects
    : [];

  for (const cell of objects) {
    const data = String(cell?.output_data ?? "");
    if (!/^0x[0-9a-fA-F]+$/.test(data)) continue;

    // Capability V1/V2 keeps issuer_id at bytes [34, 66).
    // Hex string includes "0x", so byte 34 starts at character 2 + 34*2.
    const start = 2 + (34 * 2);
    const end = start + 64;
    if (data.length < end) continue;

    const issuer = `0x${data.slice(start, end)}`.toLowerCase();
    if (/^0x[0-9a-f]{64}$/.test(issuer) && issuer !== `0x${"0".repeat(64)}`) {
      process.stdout.write(issuer);
      process.exit(0);
    }
  }

  process.exit(4);
} catch {
  process.exit(5);
} finally {
  clearTimeout(timer);
}
NODE
}

ensure_ccc_available() {
  if node --input-type=module -e 'await import("@ckb-ccc/ccc")' >/dev/null 2>&1; then
    return 0
  fi

  note "@ckb-ccc/ccc is not installed; running npm install automatically..."
  npm install
  node --input-type=module -e 'await import("@ckb-ccc/ccc")' >/dev/null 2>&1 \
    || die "npm install completed, but @ckb-ccc/ccc still cannot be imported."
}

generate_new_issuer() {
  ensure_ccc_available

  local generated
  generated="$(
    node --input-type=module <<'NODE'
import { randomBytes } from "node:crypto";
import { ccc } from "@ckb-ccc/ccc";

const client = new ccc.ClientPublicTestnet();

let privateKey;
let signer;

for (;;) {
  privateKey = randomBytes(32).toString("hex");
  try {
    signer = new ccc.SignerCkbPrivateKey(client, privateKey);
    break;
  } catch {
    // Extremely unlikely invalid scalar; generate another one.
  }
}

const addressObj = await signer.getRecommendedAddressObj();
const address = await signer.getRecommendedAddress();
const lockHash = addressObj.script.hash().toLowerCase();

console.log(privateKey);
console.log(address);
console.log(lockHash);
NODE
  )"

  mapfile -t rows <<< "$generated"
  [ "${#rows[@]}" -ge 3 ] || die "Failed to generate a CKB issuer wallet."

  local private_key="${rows[0]}"
  local address="${rows[1]}"
  local lock_hash="${rows[2]}"

  is_hex32 "$lock_hash" || die "Generated issuer lock hash is invalid: $lock_hash"

  umask 077
  cat > "$ISSUER_SECRET_FILE" <<EOF
# GENERATED automatically by generate-vercel-env-zero-input.sh
# LOCAL SECRET ONLY. DO NOT COMMIT. DO NOT UPLOAD THIS PRIVATE KEY TO VERCEL.
#
# This wallet is the provider/issuer identity used when no existing SkillPass
# issuer could be recovered. Fund this address with TESTNET CKB before using it
# to issue real Capability Cells.

CKB_PRIVATE_KEY=$private_key
CKB_TESTNET_ADDRESS=$address
CAPABILITY_TRUSTED_ISSUER_ID=$lock_hash
EOF
  chmod 600 "$ISSUER_SECRET_FILE"

  printf '%s' "$lock_hash"
}

ISSUER_SOURCE=""
ISSUER_HASH="$(recover_existing_issuer_from_env || true)"

if is_hex32 "$ISSUER_HASH"; then
  ISSUER_SOURCE="existing local env"
else
  ISSUER_HASH=""
  note "No valid local issuer ID found. Checking live CKB Testnet Capability Cells..."

  for rpc in "${TESTNET_RPCS[@]}"; do
    candidate="$(recover_issuer_from_chain "$rpc" 2>/dev/null || true)"
    if is_hex32 "$candidate"; then
      ISSUER_HASH="${candidate,,}"
      ISSUER_SOURCE="live Capability Cell via $rpc"
      break
    fi
  done
fi

if ! is_hex32 "$ISSUER_HASH"; then
  note "No existing issuer could be recovered."
  note "Generating a NEW CKB Testnet issuer wallet automatically..."
  ISSUER_HASH="$(generate_new_issuer)"
  ISSUER_SOURCE="new local issuer wallet"
fi

is_hex32 "$ISSUER_HASH" || die "Could not resolve a valid trusted issuer."

# Generate fresh Ed25519 signing keys and facilitator token.
mapfile -t GENERATED < <(
  node --input-type=module <<'NODE'
import {
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
} from "node:crypto";

function ed25519PrivateKeyOneLine() {
  const { privateKey } = generateKeyPairSync("ed25519");

  const pem = privateKey.export({
    type: "pkcs8",
    format: "pem",
  }).toString().trim();

  const parsed = createPrivateKey(pem);
  if (parsed.asymmetricKeyType !== "ed25519") {
    throw new Error(`Expected Ed25519, got ${parsed.asymmetricKeyType}`);
  }

  return pem.replace(/\r?\n/g, "\\n");
}

console.log(ed25519PrivateKeyOneLine());
console.log(ed25519PrivateKeyOneLine());
console.log(randomBytes(32).toString("hex"));
NODE
)

[ "${#GENERATED[@]}" -eq 3 ] || die "Failed to generate Vercel signing secrets."

PROVIDER_MANIFEST_KEY="${GENERATED[0]}"
GATEWAY_SIGNING_KEY="${GENERATED[1]}"
FACILITATOR_TOKEN="${GENERATED[2]}"

umask 077
cat > "$OUTPUT_FILE" <<EOF
# GENERATED by generate-vercel-env-zero-input.sh
# ZERO-INPUT SkillPass Vercel/Testnet configuration.
#
# DO NOT COMMIT THIS FILE.
# It contains private signing keys and FACILITATOR_AUTH_TOKEN.
# DATABASE_URL is provided separately by the Vercel Neon integration.
#
# Trusted issuer source: $ISSUER_SOURCE

CAPABILITY_CODE_HASH=$CAPABILITY_CODE_HASH
CAPABILITY_HASH_TYPE=$CAPABILITY_HASH_TYPE
CAPABILITY_DEP_TX_HASH=$CAPABILITY_DEP_TX_HASH
CAPABILITY_DEP_INDEX=$CAPABILITY_DEP_INDEX
CAPABILITY_TRUSTED_ISSUER_ID=$ISSUER_HASH

SERVICE_POLICY_ID=service-bundle-v1
SERVICE_POLICY_URL=
SERVICE_TERMS_HASH=

STATE_BACKEND=postgres
POSTGRES_POOL_MAX=2
TRUST_PROXY=true
SKILLPASS_PUBLIC_PRODUCTION=true
ENABLE_PUBLIC_ISSUE=false

CHALLENGE_TTL_MS=60000
SERVICE_RECEIPT_TTL_SECONDS=86400
MAX_REQUEST_BODY_BYTES=36864
PAYMENT_HEADER_MAX_BYTES=12288
UPSTREAM_TIMEOUT_MS=8000

CHALLENGE_RATE_LIMIT_PER_MINUTE=12
ANALYZE_RATE_LIMIT_PER_MINUTE=8
GLOBAL_CHALLENGE_RATE_LIMIT_PER_MINUTE=240
GLOBAL_ANALYZE_RATE_LIMIT_PER_MINUTE=120

ENABLE_DEEP_HEALTH=false

SKILLPASS_REQUIRE_SIGNED_MANIFEST=true
SKILLPASS_PROVIDER_MANIFEST_KEY_ID=provider-manifest-vercel-v1
SKILLPASS_PROVIDER_MANIFEST_PRIVATE_KEY=$PROVIDER_MANIFEST_KEY

SKILLPASS_REQUIRE_UPSTREAM_ASSERTION=true
SKILLPASS_GATEWAY_SIGNING_KEY_ID=gateway-vercel-v1
SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY=$GATEWAY_SIGNING_KEY

SKILLPASS_GATEWAY_ALLOWED_HOSTS=
SKILLPASS_UPSTREAM_SERVICES_JSON=[]
SKILLPASS_SUBJECT_RESOLVERS_JSON={}
SKILLPASS_SUBJECT_RESOLVER_ALLOWED_HOSTS=

SKILLPASS_MIN_CAPABILITY_CONFIRMATIONS=0
INVOCATION_TTL_SECONDS=604800
AUTHORIZATION_EVIDENCE_TTL_SECONDS=2592000

PAYMENTS_REQUIRED=false
FIBER_NETWORK=testnet
FIBER_BACKEND=mock
FIBER_PAYMENT_PROOF=invoice-status
ALLOW_DEV_PAYMENT=false

FACILITATOR_MAX_REQUEST_BODY_BYTES=32768
FIBER_RPC_TIMEOUT_MS=8000
FACILITATOR_AUTH_TOKEN=$FACILITATOR_TOKEN
EOF

chmod 600 "$OUTPUT_FILE"

# Basic self-validation without printing secrets.
OUTPUT_ENV_FILE="$OUTPUT_FILE" node --input-type=module <<'NODE'
import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";

const file = process.env.OUTPUT_ENV_FILE;
const text = readFileSync(file, "utf8");

function get(name) {
  const line = text.split(/\r?\n/).find((x) => x.startsWith(`${name}=`));
  if (!line) throw new Error(`Missing ${name}`);
  return line.slice(name.length + 1);
}

const hex32 = /^0x[0-9a-fA-F]{64}$/;

for (const name of [
  "CAPABILITY_CODE_HASH",
  "CAPABILITY_DEP_TX_HASH",
  "CAPABILITY_TRUSTED_ISSUER_ID",
]) {
  if (!hex32.test(get(name))) throw new Error(`${name} is invalid`);
}

for (const name of [
  "SKILLPASS_PROVIDER_MANIFEST_PRIVATE_KEY",
  "SKILLPASS_GATEWAY_SIGNING_PRIVATE_KEY",
]) {
  const pem = get(name).replace(/\\n/g, "\n");
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`${name} is not Ed25519`);
  }
}

if (!/^[0-9a-f]{64}$/i.test(get("FACILITATOR_AUTH_TOKEN"))) {
  throw new Error("FACILITATOR_AUTH_TOKEN is invalid");
}
NODE

note "Generated $OUTPUT_FILE successfully."
note "Trusted issuer source: $ISSUER_SOURCE"
note "Trusted issuer ID: $ISSUER_HASH"
note ""
note "No arguments or manual issuer input were required."
note ""
note "Next:"
note "  1. Add values from $OUTPUT_FILE to Vercel Production."
note "  2. Mark the two signing keys and FACILITATOR_AUTH_TOKEN as Sensitive."
note "  3. Keep DATABASE_URL from the Neon integration."
note "  4. Redeploy."
note "  5. Check /api/config returns HTTP 200."

if [ "$ISSUER_SOURCE" = "new local issuer wallet" ]; then
  note ""
  note "IMPORTANT: A new issuer wallet was created because no existing issuer"
  note "could be recovered."
  note "Local issuer secret: $ISSUER_SECRET_FILE"
  note "Do NOT upload its CKB private key to Vercel."
  note "Fund the printed Testnet address in that file before issuing capabilities."
fi
