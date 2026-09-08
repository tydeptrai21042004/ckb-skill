#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

info(){ printf '\033[1;34m[SkillPass production]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
fail(){ printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

usage(){ cat <<'HELP'
SkillPass production deployment (multi-user + shared state)

  ./deploy-production.sh init
      Create .env.production and generate local secret files.

  ./deploy-production.sh doctor
      Fail-fast validation for DNS/app/payment/database configuration.

  ./deploy-production.sh up
      Start HTTPS, PostgreSQL, Redis, facilitator and SkillPass replicas.

  ./deploy-production.sh scale N
      Change the number of SkillPass replicas on this host (1..20).

  ./deploy-production.sh status
  ./deploy-production.sh health
  ./deploy-production.sh logs [caddy|skillpass|facilitator|postgres|redis]
  ./deploy-production.sh smoke
  ./deploy-production.sh backup
  ./deploy-production.sh restore backups/.../skillpass.sql.gz --yes
  ./deploy-production.sh upgrade
  ./deploy-production.sh down

Application containers never need user private keys. PostgreSQL stores durable
payment/receipt state; Redis stores short-lived one-time challenges/rate limits.
HELP
}

require_docker(){
  have docker || fail "Docker is not installed. Install Docker Engine + Compose v2."
  docker info >/dev/null 2>&1 || fail "Docker daemon is not reachable."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."
}

compose(){ docker compose --env-file .env.production -f deploy/compose.production.yaml "$@"; }

env_value(){
  local key="$1"
  [[ -f .env.production ]] || return 0
  awk -F= -v k="$key" '$1==k {sub(/^[^=]*=/, ""); print; exit}' .env.production
}

set_env_value(){
  local key="$1" value="$2"
  python3 - "$key" "$value" <<'PY'
import re, sys
from pathlib import Path
p=Path('.env.production'); key=sys.argv[1]; value=sys.argv[2]
s=p.read_text()
line=f'{key}={value}'
if re.search(rf'(?m)^{re.escape(key)}=', s): s=re.sub(rf'(?m)^{re.escape(key)}=.*$', line, s)
else: s += ('\n' if not s.endswith('\n') else '') + line + '\n'
p.write_text(s)
PY
}

random_secret(){
  if have openssl; then openssl rand -hex 32
  elif have python3; then python3 - <<'PY'
import secrets
print(secrets.token_hex(32))
PY
  else fail "Need openssl or python3 to generate secrets"; fi
}

generate_secret(){
  local name="$1"
  mkdir -p .secrets; chmod 700 .secrets 2>/dev/null || true
  if [[ ! -s ".secrets/$name" ]]; then
    random_secret > ".secrets/$name"
    chmod 600 ".secrets/$name" 2>/dev/null || true
    info "Generated .secrets/$name"
  fi
}

init(){
  [[ -f .env.production.example ]] || fail ".env.production.example is missing"
  if [[ ! -f .env.production ]]; then
    cp .env.production.example .env.production
    chmod 600 .env.production 2>/dev/null || true
    info "Created .env.production"
  else
    info ".env.production already exists; preserving it"
  fi

  generate_secret facilitator_auth_token.txt
  generate_secret postgres_password.txt
  generate_secret redis_password.txt
  mkdir -p .secrets
  if [[ ! -f .secrets/fiber_rpc_token.txt ]]; then
    : > .secrets/fiber_rpc_token.txt
    chmod 600 .secrets/fiber_rpc_token.txt 2>/dev/null || true
    info "Created empty .secrets/fiber_rpc_token.txt (optional)"
  fi

  if [[ -f deployments/testnet.json ]] && have python3; then
    python3 - <<'PY'
import json, re
from pathlib import Path
src=Path('deployments/testnet.json'); env=Path('.env.production')
try: obj=json.loads(src.read_text())
except Exception as exc: print(f'[WARN] deployments/testnet.json could not be imported: {exc}')
else:
    values={'CAPABILITY_CODE_HASH':obj.get('codeHash',''),'CAPABILITY_HASH_TYPE':obj.get('hashType','data1'),'CAPABILITY_DEP_TX_HASH':obj.get('depTxHash',''),'CAPABILITY_DEP_INDEX':str(obj.get('depIndex',0))}
    text=env.read_text(); changed=False
    for key,value in values.items():
        if not value or 'REPLACE' in str(value): continue
        text=re.sub(rf'(?m)^{re.escape(key)}=.*$', f'{key}={value}', text); changed=True
    if changed: env.write_text(text); print('[SkillPass production] Imported deployments/testnet.json')
PY
  fi
  info "Next: edit .env.production, configure DNS + CKB/Fiber, then run ./deploy-production.sh doctor"
}

is_hex32(){ [[ "$1" =~ ^0x[0-9a-fA-F]{64}$ ]]; }
secret_ok(){ local file="$1"; [[ -s "$file" ]] && [[ $(tr -d '\r\n' < "$file" | wc -c) -ge 32 ]]; }

is_public_ckb_rpc(){
  local url="${1,,}"
  [[ "$url" == *"testnet.ckb.dev"* || "$url" == *"testnet.ckbapp.dev"* || "$url" == *"mainnet.ckb.dev"* || "$url" == *"mainnet.ckbapp.dev"* ]]
}

doctor(){
  [[ -f .env.production ]] || fail ".env.production is missing; run ./deploy-production.sh init"
  local fail_count=0 value domain email replicas

  for f in facilitator_auth_token.txt postgres_password.txt redis_password.txt; do
    secret_ok ".secrets/$f" && echo "[OK]   secret $f" || { echo "[FAIL] secret $f is missing/too short"; fail_count=$((fail_count+1)); }
  done

  domain="$(env_value PUBLIC_DOMAIN)"
  [[ "$domain" =~ ^([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$ ]] && echo "[OK]   PUBLIC_DOMAIN=$domain" || { echo "[FAIL] PUBLIC_DOMAIN must be a real hostname"; fail_count=$((fail_count+1)); }
  email="$(env_value ACME_EMAIL)"
  [[ "$email" == *@*.* ]] && echo "[OK]   ACME_EMAIL" || { echo "[FAIL] ACME_EMAIL"; fail_count=$((fail_count+1)); }

  replicas="$(env_value SKILLPASS_REPLICAS)"; [[ -z "$replicas" ]] && replicas=2
  [[ "$replicas" =~ ^[0-9]+$ ]] && (( replicas >= 1 && replicas <= 20 )) && echo "[OK]   SKILLPASS_REPLICAS=$replicas" || { echo "[FAIL] SKILLPASS_REPLICAS must be 1..20"; fail_count=$((fail_count+1)); }

  value="$(env_value STATE_BACKEND)"; [[ "$value" == postgres-redis ]] && echo "[OK]   STATE_BACKEND=postgres-redis" || { echo "[FAIL] production requires STATE_BACKEND=postgres-redis"; fail_count=$((fail_count+1)); }
  value="$(env_value POSTGRES_DB)"; [[ "$value" =~ ^[A-Za-z0-9_]+$ ]] && echo "[OK]   POSTGRES_DB" || { echo "[FAIL] POSTGRES_DB"; fail_count=$((fail_count+1)); }
  value="$(env_value POSTGRES_USER)"; [[ "$value" =~ ^[A-Za-z0-9_]+$ ]] && echo "[OK]   POSTGRES_USER" || { echo "[FAIL] POSTGRES_USER"; fail_count=$((fail_count+1)); }

  value="$(env_value CAPABILITY_CODE_HASH)"; is_hex32 "$value" && echo "[OK]   CAPABILITY_CODE_HASH" || { echo "[FAIL] CAPABILITY_CODE_HASH"; fail_count=$((fail_count+1)); }
  value="$(env_value CAPABILITY_DEP_TX_HASH)"; is_hex32 "$value" && echo "[OK]   CAPABILITY_DEP_TX_HASH" || { echo "[FAIL] CAPABILITY_DEP_TX_HASH"; fail_count=$((fail_count+1)); }
  value="$(env_value CAPABILITY_HASH_TYPE)"; [[ "$value" =~ ^(data|data1|data2|type)$ ]] && echo "[OK]   CAPABILITY_HASH_TYPE" || { echo "[FAIL] CAPABILITY_HASH_TYPE"; fail_count=$((fail_count+1)); }
  value="$(env_value CAPABILITY_DEP_INDEX)"; [[ "$value" =~ ^[0-9]+$ ]] && echo "[OK]   CAPABILITY_DEP_INDEX" || { echo "[FAIL] CAPABILITY_DEP_INDEX"; fail_count=$((fail_count+1)); }
  value="$(env_value CAPABILITY_TRUSTED_ISSUER_ID)"; is_hex32 "$value" && [[ ! "$value" =~ ^0x0{64}$ ]] && echo "[OK]   CAPABILITY_TRUSTED_ISSUER_ID" || { echo "[FAIL] CAPABILITY_TRUSTED_ISSUER_ID"; fail_count=$((fail_count+1)); }

  value="$(env_value CKB_RPC_URL)"
  if [[ ! "$value" =~ ^https?:// ]]; then echo "[FAIL] CKB_RPC_URL is required for production"; fail_count=$((fail_count+1))
  elif is_public_ckb_rpc "$value" && [[ "$(env_value ALLOW_PUBLIC_CKB_RPC)" != true ]]; then
    echo "[FAIL] CKB_RPC_URL points to a community public RPC. Use a dedicated/self-hosted RPC or explicitly set ALLOW_PUBLIC_CKB_RPC=true."
    fail_count=$((fail_count+1))
  else echo "[OK]   CKB_RPC_URL"; fi

  value="$(env_value FIBER_BACKEND)"; [[ "$value" == fnn ]] && echo "[OK]   FIBER_BACKEND=fnn" || { echo "[FAIL] FIBER_BACKEND must be fnn"; fail_count=$((fail_count+1)); }
  value="$(env_value FIBER_NETWORK)"; [[ "$value" == testnet ]] && echo "[OK]   FIBER_NETWORK=testnet" || { echo "[FAIL] this release profile requires FIBER_NETWORK=testnet"; fail_count=$((fail_count+1)); }
  value="$(env_value FIBER_RPC_URL)"; [[ "$value" =~ ^https?:// ]] && echo "[OK]   FIBER_RPC_URL" || { echo "[FAIL] FIBER_RPC_URL"; fail_count=$((fail_count+1)); }
  value="$(env_value FIBER_PAYMENT_PROOF)"; [[ "$value" =~ ^(invoice-status|preimage)$ ]] && echo "[OK]   FIBER_PAYMENT_PROOF=$value" || { echo "[FAIL] FIBER_PAYMENT_PROOF"; fail_count=$((fail_count+1)); }
  value="$(env_value PAYMENTS_REQUIRED)"; [[ "$value" == true ]] && echo "[OK]   PAYMENTS_REQUIRED=true" || { echo "[FAIL] PAYMENTS_REQUIRED=true is required by this production profile"; fail_count=$((fail_count+1)); }
  value="$(env_value PAYMENT_AMOUNT)"; [[ "$value" =~ ^[1-9][0-9]*$ ]] && echo "[OK]   PAYMENT_AMOUNT" || { echo "[FAIL] PAYMENT_AMOUNT"; fail_count=$((fail_count+1)); }
  value="$(env_value PAYMENT_DECIMALS)"; [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 0 && value <= 18 )) && echo "[OK]   PAYMENT_DECIMALS=$value" || { echo "[FAIL] PAYMENT_DECIMALS must be 0..18"; fail_count=$((fail_count+1)); }
  value="$(env_value PAYMENT_ATOMIC_UNIT)"; [[ -n "$value" ]] && echo "[OK]   PAYMENT_ATOMIC_UNIT=$value" || { echo "[FAIL] PAYMENT_ATOMIC_UNIT"; fail_count=$((fail_count+1)); }
  value="$(env_value SERVICE_RECEIPT_TTL_SECONDS)"; [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 60 && value <= 2592000 )) && echo "[OK]   SERVICE_RECEIPT_TTL_SECONDS=$value" || { echo "[FAIL] SERVICE_RECEIPT_TTL_SECONDS must be 60..2592000"; fail_count=$((fail_count+1)); }
  value="$(env_value POSTGRES_POOL_MAX)"; [[ "$value" =~ ^[0-9]+$ ]] && (( value >= 1 && value <= 200 )) && echo "[OK]   POSTGRES_POOL_MAX=$value" || { echo "[FAIL] POSTGRES_POOL_MAX must be 1..200"; fail_count=$((fail_count+1)); }

  if have docker && docker info >/dev/null 2>&1; then
    docker compose --env-file .env.production -f deploy/compose.production.yaml config -q && echo "[OK]   Docker Compose configuration" || { echo "[FAIL] Docker Compose configuration"; fail_count=$((fail_count+1)); }
  else
    warn "Docker daemon not available during doctor; Compose validation skipped."
  fi

  [[ "$fail_count" == 0 ]] || fail "Production configuration has $fail_count blocking issue(s)"
  info "Production configuration passed"
}

wait_service(){
  local service="$1" timeout="${2:-180}" start now status cid all_ok
  start="$(date +%s)"
  while true; do
    mapfile -t ids < <(compose ps -q "$service" 2>/dev/null || true)
    if (( ${#ids[@]} > 0 )); then
      all_ok=1
      for cid in "${ids[@]}"; do
        status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null || true)"
        if [[ "$status" == unhealthy || "$status" == exited || "$status" == dead ]]; then
          compose logs --tail=150 "$service" || true; fail "$service replica became $status"
        fi
        [[ "$status" == healthy || "$status" == running ]] || all_ok=0
      done
      (( all_ok == 1 )) && { info "$service: ${#ids[@]} replica(s) ready"; return 0; }
    fi
    now="$(date +%s)"; (( now - start < timeout )) || { compose logs --tail=150 "$service" || true; fail "Timed out waiting for $service"; }
    sleep 2
  done
}

smoke(){
  local domain; domain="$(env_value PUBLIC_DOMAIN)"; [[ -n "$domain" ]] || fail "PUBLIC_DOMAIN missing"
  have curl || fail "curl is required"
  for path in /livez /readyz /api/config /.well-known/skillpass.json; do
    curl --fail --silent --show-error --max-time 20 "https://${domain}${path}" >/dev/null || fail "HTTPS smoke failed: $path"
  done
  info "HTTPS smoke passed: https://${domain}"
}

up(){
  require_docker; doctor
  local replicas="$(env_value SKILLPASS_REPLICAS)"; [[ -z "$replicas" ]] && replicas=2
  compose up -d --build --remove-orphans --scale "skillpass=$replicas"
  wait_service postgres 180
  wait_service redis 120
  wait_service facilitator 240
  wait_service skillpass 300
  wait_service caddy 180
  smoke
  info "SkillPass is serving real concurrent users at https://$(env_value PUBLIC_DOMAIN) with $replicas app replica(s)"
}

scale(){
  require_docker
  local replicas="${1:-}"; [[ "$replicas" =~ ^[0-9]+$ ]] && (( replicas >= 1 && replicas <= 20 )) || fail "Usage: ./deploy-production.sh scale N  (N=1..20)"
  set_env_value SKILLPASS_REPLICAS "$replicas"
  compose up -d --no-deps --scale "skillpass=$replicas" skillpass
  wait_service skillpass 240
  smoke
  info "Scaled SkillPass to $replicas replicas"
}

status(){ require_docker; compose ps; }
logs(){ require_docker; if [[ -n "${1:-}" ]]; then compose logs -f --tail=200 "$1"; else compose logs -f --tail=200; fi; }
health(){
  local domain="$(env_value PUBLIC_DOMAIN)"; have curl || fail "curl is required"
  curl --fail --silent --show-error --max-time 20 "https://${domain}/api/status" | { if have python3; then python3 -m json.tool; else cat; fi; }
}
down(){ require_docker; compose down; }

backup(){
  require_docker
  local stamp dir db user
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"; dir="$ROOT/backups/production-$stamp"; mkdir -p "$dir"
  db="$(env_value POSTGRES_DB)"; user="$(env_value POSTGRES_USER)"
  [[ -n "$db" && -n "$user" ]] || fail "POSTGRES_DB/POSTGRES_USER missing"
  compose exec -T postgres pg_dump -U "$user" -d "$db" --clean --if-exists --no-owner --no-privileges | gzip -9 > "$dir/skillpass.sql.gz"
  cp .env.production.example "$dir/env-template.txt"
  cat > "$dir/README.txt" <<TXT
SkillPass production backup: $stamp
Contains PostgreSQL application state only. It intentionally excludes secrets,
user keys, Caddy certificates, and Fiber node/channel storage.
Back up Fiber/FNN separately using Fiber's official backup/restore mechanism.
Restore application DB with:
  ./deploy-production.sh restore backups/production-$stamp/skillpass.sql.gz --yes
TXT
  info "Backup created: $dir"
}

restore(){
  require_docker
  local file="${1:-}" confirm="${2:-}" db user
  [[ -f "$file" && "$confirm" == --yes ]] || fail "Usage: ./deploy-production.sh restore /path/skillpass.sql.gz --yes"
  db="$(env_value POSTGRES_DB)"; user="$(env_value POSTGRES_USER)"
  info "Stopping application writers before restore"
  compose stop skillpass facilitator >/dev/null
  gzip -dc "$file" | compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "$user" -d "$db"
  info "Database restored; starting application services"
  up
}

upgrade(){
  require_docker; doctor
  info "Creating a database backup before upgrade"
  backup
  compose pull caddy postgres redis
  up
}

cmd="${1:-help}"; shift || true
case "$cmd" in
  init) init ;;
  doctor) doctor ;;
  up) up ;;
  scale) scale "${1:-}" ;;
  status) status ;;
  health) health ;;
  logs) logs "${1:-}" ;;
  smoke) smoke ;;
  backup) backup ;;
  restore) restore "${1:-}" "${2:-}" ;;
  upgrade) upgrade ;;
  down|stop) down ;;
  help|-h|--help) usage ;;
  *) usage; fail "unknown command: $cmd" ;;
esac
