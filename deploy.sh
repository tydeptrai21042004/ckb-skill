#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

blue(){ printf '\033[1;34m[SkillPass]\033[0m %s\n' "$*"; }
yellow(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
red(){ printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

usage(){ cat <<'HELP'
SkillPass deployment helper

  ./deploy.sh demo
      One-command deterministic demo. Only Docker is required.

  ./deploy.sh init-testnet
      Create .env.testnet, generate a facilitator secret, and import deployment
      metadata automatically when deployments/testnet.json exists.

  ./deploy.sh testnet
      Deploy real CKB-testnet verification + facilitator. FIBER_BACKEND may be
      mock for staging or fnn for an external Fiber node.

  ./deploy.sh fiber-init /path/to/ckb-private-key
      Initialize an official nervos/fiber Docker data directory. The key is
      copied locally to .runtime/fiber-node/ckb/key and never sent elsewhere.

  ./deploy.sh testnet-fiber
      Deploy SkillPass + facilitator + official Fiber v0.9.0 container.
      Run fiber-init first and fund/open channels explicitly yourself.

  ./deploy.sh status [demo|testnet|testnet-fiber]
  ./deploy.sh logs   [demo|testnet|testnet-fiber] [service]
  ./deploy.sh stop   [demo|testnet|testnet-fiber]
  ./deploy.sh doctor

No command creates wallet keys, transfers CKB, opens channels, or spends funds.
HELP
}

have(){ command -v "$1" >/dev/null 2>&1; }
require_docker(){
  have docker || red "Docker is not installed. Install Docker Desktop (macOS/Windows/WSL) or Docker Engine + Compose v2 (Linux), then rerun. Native development remains available through ./run_all.sh."
  docker info >/dev/null 2>&1 || red "Docker is installed but the daemon is not reachable. Start Docker and rerun."
  docker compose version >/dev/null 2>&1 || red "Docker Compose v2 is required (the 'docker compose' command)."
}

env_value(){
  local key="$1" file="${2:-.env.testnet}"
  [[ -f "$file" ]] || return 0
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' "$file"
}

random_secret(){
  if have openssl; then openssl rand -hex 32
  elif have python3; then python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
  elif [[ -r /dev/urandom ]] && have od; then od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  else red "Need openssl, python3, or /dev/urandom+od to generate a secret"; fi
}

replace_env(){
  local key="$1" value="$2" file="${3:-.env.testnet}" tmp
  tmp="${file}.tmp.$$"
  awk -v k="$key" -v v="$value" 'BEGIN{done=0} $0 ~ "^" k "=" {print k "=" v; done=1; next} {print} END{if(!done) print k "=" v}' "$file" > "$tmp"
  mv "$tmp" "$file"
}

init_testnet(){
  if [[ ! -f .env.testnet ]]; then
    cp .env.testnet.example .env.testnet
    chmod 600 .env.testnet 2>/dev/null || true
    blue "Created .env.testnet"
  else
    blue ".env.testnet already exists; preserving it"
  fi
  local token
  token="$(env_value FACILITATOR_AUTH_TOKEN)"
  if [[ -z "$token" || "$token" == REPLACE* ]]; then
    replace_env FACILITATOR_AUTH_TOKEN "$(random_secret)"
    blue "Generated FACILITATOR_AUTH_TOKEN in .env.testnet"
  fi

  if [[ -f deployments/testnet.json ]] && have python3; then
    python3 - <<'PY'
import json, re
from pathlib import Path
d=Path('deployments/testnet.json')
e=Path('.env.testnet')
try: obj=json.loads(d.read_text())
except Exception as ex:
    print(f'[WARN] deployments/testnet.json could not be parsed: {ex}')
    raise SystemExit(0)
vals={
  'CAPABILITY_CODE_HASH': obj.get('codeHash',''),
  'CAPABILITY_HASH_TYPE': obj.get('hashType','data1'),
  'CAPABILITY_DEP_TX_HASH': obj.get('depTxHash',''),
  'CAPABILITY_DEP_INDEX': str(obj.get('depIndex',0)),
}
text=e.read_text()
for k,v in vals.items():
    if not v: continue
    text=re.sub(rf'(?m)^{re.escape(k)}=.*$', f'{k}={v}', text)
e.write_text(text)
print('[SkillPass] Imported deployments/testnet.json into .env.testnet')
PY
  fi
  blue "Edit only the remaining REPLACE_* fields, then run: ./deploy.sh doctor"
}

doctor(){
  [[ -f .env.testnet ]] || red ".env.testnet is missing. Run ./deploy.sh init-testnet"
  local fail=0 key value
  for key in CAPABILITY_CODE_HASH CAPABILITY_DEP_TX_HASH; do
    value="$(env_value "$key")"
    if [[ "$value" =~ ^0x[0-9a-fA-F]{64}$ ]]; then printf '[OK]   %s\n' "$key"; else printf '[FAIL] %s\n' "$key"; fail=1; fi
  done
  value="$(env_value CAPABILITY_HASH_TYPE)"
  [[ "$value" =~ ^(data|data1|data2|type)$ ]] && printf '[OK]   CAPABILITY_HASH_TYPE\n' || { printf '[FAIL] CAPABILITY_HASH_TYPE\n'; fail=1; }
  value="$(env_value CAPABILITY_DEP_INDEX)"
  [[ "$value" =~ ^[0-9]+$ ]] && printf '[OK]   CAPABILITY_DEP_INDEX\n' || { printf '[FAIL] CAPABILITY_DEP_INDEX\n'; fail=1; }
  value="$(env_value FACILITATOR_AUTH_TOKEN)"
  [[ ${#value} -ge 32 && "$value" != REPLACE* ]] && printf '[OK]   FACILITATOR_AUTH_TOKEN\n' || { printf '[FAIL] FACILITATOR_AUTH_TOKEN\n'; fail=1; }
  value="$(env_value PAYMENT_AMOUNT)"
  [[ "$value" =~ ^[1-9][0-9]*$ ]] && printf '[OK]   PAYMENT_AMOUNT\n' || { printf '[FAIL] PAYMENT_AMOUNT\n'; fail=1; }
  value="$(env_value FIBER_BACKEND)"
  if [[ "$value" == mock ]]; then yellow "FIBER_BACKEND=mock: deployable staging, but NOT real Fiber payment evidence."; fi
  if [[ "$value" == fnn ]]; then
    printf '[OK]   FIBER_BACKEND=fnn\n'
    [[ -n "$(env_value FIBER_RPC_URL)" ]] || { printf '[FAIL] FIBER_RPC_URL\n'; fail=1; }
  elif [[ "$value" != mock ]]; then printf '[FAIL] FIBER_BACKEND must be mock or fnn\n'; fail=1; fi
  [[ "$fail" == 0 ]] || red "Deployment configuration is incomplete"
  blue "Static deployment configuration looks valid"
}

compose_set_args(){
  local mode="${1:-demo}"
  case "$mode" in
    demo) COMPOSE_ARGS=(-f deploy/compose.demo.yaml) ;;
    testnet) COMPOSE_ARGS=(--env-file .env.testnet -f deploy/compose.testnet.yaml) ;;
    testnet-fiber) COMPOSE_ARGS=(--env-file .env.testnet -f deploy/compose.testnet.yaml -f deploy/compose.fiber.yaml) ;;
    *) red "unknown deployment mode: $mode" ;;
  esac
}

wait_health(){
  local mode="$1" service="$2" timeout="${3:-180}" start now cid status
  compose_set_args "$mode"
  start="$(date +%s)"
  while true; do
    cid="$(docker compose "${COMPOSE_ARGS[@]}" ps -q "$service" 2>/dev/null || true)"
    if [[ -n "$cid" ]]; then
      status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
      [[ "$status" == healthy || "$status" == running ]] && { blue "$service is $status"; return 0; }
      [[ "$status" == unhealthy || "$status" == exited || "$status" == dead ]] && {
        docker compose "${COMPOSE_ARGS[@]}" logs --tail=120 "$service" || true
        red "$service became $status"
      }
    fi
    now="$(date +%s)"; (( now - start < timeout )) || { docker compose "${COMPOSE_ARGS[@]}" logs --tail=120 "$service" || true; red "Timed out waiting for $service"; }
    sleep 2
  done
}

up_demo(){
  require_docker
  compose_set_args demo
  docker compose "${COMPOSE_ARGS[@]}" up -d --build
  wait_health demo demo 120
  blue "Demo ready: http://127.0.0.1:${SKILLPASS_PORT:-8787}"
  blue "Mock facilitator (localhost only): http://127.0.0.1:${FACILITATOR_PORT_PUBLIC:-8790}"
}

up_testnet(){
  local mode="$1"
  require_docker
  doctor
  compose_set_args "$mode"
  docker compose "${COMPOSE_ARGS[@]}" up -d --build
  [[ "$mode" == testnet-fiber ]] && wait_health "$mode" fiber 240
  wait_health "$mode" facilitator 180
  wait_health "$mode" skillpass 240
  local port; port="$(env_value SKILLPASS_PORT)"; [[ -n "$port" ]] || port=8787
  blue "SkillPass ready: http://127.0.0.1:${port}"
  [[ "$mode" == testnet-fiber ]] && blue "Admin Fiber with: docker compose --env-file .env.testnet -f deploy/compose.testnet.yaml -f deploy/compose.fiber.yaml exec fiber fnn-cli info"
}

fiber_init(){
  require_docker
  [[ -f .env.testnet ]] || init_testnet
  local key_file="${1:-}"; [[ -n "$key_file" && -f "$key_file" ]] || red "Usage: ./deploy.sh fiber-init /path/to/ckb-private-key"
  local dir="$ROOT/.runtime/fiber-node" version password
  version="$(env_value FIBER_VERSION)"; [[ -n "$version" ]] || version=0.9.0
  mkdir -p "$dir/ckb"
  if [[ -f "$dir/ckb/key" ]]; then red "$dir/ckb/key already exists; refusing to overwrite an existing Fiber wallet key"; fi
  install -m 600 "$key_file" "$dir/ckb/key" 2>/dev/null || { cp "$key_file" "$dir/ckb/key"; chmod 600 "$dir/ckb/key"; }
  blue "Copied Fiber wallet key to .runtime/fiber-node/ckb/key"
  docker pull "nervos/fiber:${version}"
  docker run --rm --entrypoint sh -v "$dir:/fiber" "nervos/fiber:${version}" -c '
    set -eu
    if [ ! -f /fiber/config.yml ]; then cp /usr/local/share/fiber/config/testnet/config.yml /fiber/config.yml; fi
    sed -i "s/127.0.0.1:8227/0.0.0.0:8227/g" /fiber/config.yml
  '
  password="$(env_value FIBER_SECRET_KEY_PASSWORD)"
  if [[ -z "$password" ]]; then
    replace_env FIBER_SECRET_KEY_PASSWORD "$(random_secret)"
    blue "Generated FIBER_SECRET_KEY_PASSWORD in .env.testnet"
  fi
  replace_env FIBER_BACKEND fnn
  blue "Fiber container state initialized. Funding and channel opening remain explicit operator actions."
}

status(){
  local mode="${1:-demo}"; require_docker; compose_set_args "$mode"; docker compose "${COMPOSE_ARGS[@]}" ps
}
logs(){
  local mode="${1:-demo}" service="${2:-}"; require_docker; compose_set_args "$mode"
  if [[ -n "$service" ]]; then docker compose "${COMPOSE_ARGS[@]}" logs -f --tail=200 "$service"; else docker compose "${COMPOSE_ARGS[@]}" logs -f --tail=200; fi
}
stop(){
  local mode="${1:-demo}"; require_docker; compose_set_args "$mode"; docker compose "${COMPOSE_ARGS[@]}" down
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  demo) up_demo ;;
  init-testnet) init_testnet ;;
  doctor) doctor ;;
  testnet) up_testnet testnet ;;
  fiber-init) fiber_init "${1:-}" ;;
  testnet-fiber) [[ -f .runtime/fiber-node/config.yml && -f .runtime/fiber-node/ckb/key ]] || red "Run ./deploy.sh fiber-init /path/to/key first"; up_testnet testnet-fiber ;;
  status) status "${1:-demo}" ;;
  logs) logs "${1:-demo}" "${2:-}" ;;
  stop) stop "${1:-demo}" ;;
  help|-h|--help) usage ;;
  *) usage; red "unknown command: $cmd" ;;
esac
