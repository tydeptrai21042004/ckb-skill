#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

profile="${1:-testnet}"
force="${FORCE:-0}"

command -v python3 >/dev/null 2>&1 || { echo "python3 is required by this setup helper" >&2; exit 1; }

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  elif command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
  else
    echo "Need openssl or python3 to generate a secret" >&2
    exit 1
  fi
}

replace_line() {
  local file="$1" key="$2" value="$3"
  python3 - "$file" "$key" "$value" <<'PY'
import re, sys
from pathlib import Path
p=Path(sys.argv[1]); key=sys.argv[2]; value=sys.argv[3]
s=p.read_text()
line=f"{key}={value}"
if re.search(rf"(?m)^{re.escape(key)}=", s):
    s=re.sub(rf"(?m)^{re.escape(key)}=.*$", line, s)
else:
    s += ("" if s.endswith("\n") else "\n") + line + "\n"
p.write_text(s)
PY
}

case "$profile" in
  local)      src=.env.example;            dst=.env ;;
  testnet)    src=.env.testnet.example;    dst=.env.testnet ;;
  live)       src=.env.live.example;       dst=.env.live ;;
  production) src=.env.production.example; dst=.env.production ;;
  vercel)
    echo "For Vercel use ./generate-vercel-env-zero-input.sh or ./setup-vercel.sh." >&2
    echo "Those scripts also generate signing keys and keep DATABASE_URL under the Neon integration." >&2
    exit 0
    ;;
  *)
    echo "Usage: $0 {local|testnet|live|production|vercel}" >&2
    exit 2
    ;;
esac

[[ -f "$src" ]] || { echo "Missing $src" >&2; exit 1; }
if [[ -e "$dst" && "$force" != 1 ]]; then
  echo "$dst already exists; refusing to overwrite. Use FORCE=1 only if replacement is intentional." >&2
  exit 1
fi

cp "$src" "$dst"
chmod 600 "$dst" 2>/dev/null || true

if [[ "$profile" == testnet || "$profile" == live || "$profile" == local ]]; then
  replace_line "$dst" FACILITATOR_AUTH_TOKEN "$(random_hex)"
fi

if [[ "$profile" == production ]]; then
  echo "Created $dst. Now run ./deploy-production.sh init to create .secrets/ signing/auth/database material."
else
  echo "Created $dst with a fresh local FACILITATOR_AUTH_TOKEN."
fi

echo "You still must set the real CAPABILITY_CODE_HASH, CAPABILITY_DEP_TX_HASH, and CAPABILITY_TRUSTED_ISSUER_ID from your CKB Testnet deployment."
