#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
TOOLING="$ROOT/.tooling"
mkdir -p "$TOOLING"

WITH_RUST=1
WITH_OFFCKB=0
WITH_FIBER=0
SERVE=0
SKIP_INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-rust) WITH_RUST=0 ;;
    --with-offckb) WITH_OFFCKB=1 ;;
    --with-fiber) WITH_FIBER=1 ;;
    --serve) SERVE=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    -h|--help)
      cat <<'HELP'
Usage: ./run_all.sh [options]

Default: detect/install a local Node.js 22 toolchain, install project dependencies,
run all Node tests/smokes/typechecks/web build/benchmark, and verify the Rust CKB contract.

Options:
  --no-rust       skip Rust/CKB contract toolchain and contract tests
  --with-offckb   install OffCKB into .tooling/npm-global (does not start a chain)
  --with-fiber    install the official Fiber FNN release into .tooling/fiber (does not open/fund channels)
  --serve         start the local SkillPass demo after verification
  --skip-install  do not run npm dependency installation
HELP
      exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

log(){ printf '\n\033[1;34m[SkillPass]\033[0m %s\n' "$*"; }
warn(){ printf '\033[1;33m[WARN]\033[0m %s\n' "$*" >&2; }
die(){ printf '\033[1;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

OS_RAW="$(uname -s)"; ARCH_RAW="$(uname -m)"
case "$OS_RAW" in Linux) OS=linux ;; Darwin) OS=darwin ;; *) die "Unsupported OS: $OS_RAW (use Linux/macOS/WSL)" ;; esac
case "$ARCH_RAW" in x86_64|amd64) ARCH=x64 ;; aarch64|arm64) ARCH=arm64 ;; *) die "Unsupported architecture: $ARCH_RAW" ;; esac
if [[ "$OS" == linux ]] && grep -qi microsoft /proc/version 2>/dev/null; then PLATFORM="WSL"; else PLATFORM="$OS"; fi
log "Detected platform=$PLATFORM arch=$ARCH"

fetch(){
  local url="$1" out="$2"
  if command -v curl >/dev/null 2>&1; then curl -fL --retry 3 --connect-timeout 15 "$url" -o "$out"
  elif command -v wget >/dev/null 2>&1; then wget -O "$out" "$url"
  elif command -v python3 >/dev/null 2>&1; then python3 - "$url" "$out" <<'PY'
import sys, urllib.request
urllib.request.urlretrieve(sys.argv[1], sys.argv[2])
PY
  else die "Need curl, wget, or python3 to download missing tools"; fi
}

verify_sha256(){
  local expected="$1" file="$2" actual
  if command -v sha256sum >/dev/null 2>&1; then
    actual="$(sha256sum "$file" | awk '{print $1}')"
  elif command -v shasum >/dev/null 2>&1; then
    actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  elif command -v python3 >/dev/null 2>&1; then
    actual="$(python3 - "$file" <<'PY'
import hashlib, sys
h=hashlib.sha256()
with open(sys.argv[1], 'rb') as f:
    for chunk in iter(lambda: f.read(1024*1024), b''):
        h.update(chunk)
print(h.hexdigest())
PY
)"
  else
    die "Need sha256sum, shasum, or python3 to verify downloaded tools"
  fi
  actual="$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]')"
  expected="$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]')"
  [[ "$actual" == "$expected" ]] || die "SHA-256 mismatch for $file"
}

node_major_ge_22(){
  local v="$1" major="${1%%.*}"
  [[ "$major" =~ ^[0-9]+$ ]] && (( major >= 22 ))
}

setup_node(){
  local use_system=0
  if command -v node >/dev/null 2>&1; then
    local v="$(node -p 'process.versions.node')"
    if node_major_ge_22 "$v"; then use_system=1; log "Using system Node.js v$v"; fi
  fi
  if [[ "$use_system" == 0 ]]; then
    local node_dir="$TOOLING/node"
    if [[ ! -x "$node_dir/bin/node" ]]; then
      log "Installing portable Node.js 22 into .tooling/node"
      local sums="$TOOLING/node-SHASUMS256.txt"
      fetch "https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt" "$sums"
      local suffix="$OS-$ARCH.tar.gz"
      local archive="$(awk -v s="$suffix" '$2 ~ s"$" {print $2; exit}' "$sums")"
      [[ -n "$archive" ]] || die "Could not resolve Node.js archive for $OS/$ARCH"
      fetch "https://nodejs.org/dist/latest-v22.x/$archive" "$TOOLING/$archive"
      node_expected="$(awk -v a="$archive" '$2 == a {print $1; exit}' "$sums")"
      [[ -n "$node_expected" ]] || die "Could not resolve Node.js checksum for $archive"
      verify_sha256 "$node_expected" "$TOOLING/$archive"
      rm -rf "$node_dir" "$TOOLING/node-extract"; mkdir -p "$TOOLING/node-extract"
      tar -xzf "$TOOLING/$archive" -C "$TOOLING/node-extract"
      mv "$TOOLING/node-extract"/* "$node_dir"
      rm -rf "$TOOLING/node-extract" "$TOOLING/$archive"
    fi
    export PATH="$node_dir/bin:$PATH"
    log "Using portable Node.js $(node -v)"
  fi
  command -v npm >/dev/null 2>&1 || die "npm not found after Node setup"
}

setup_rust(){
  [[ "$WITH_RUST" == 1 ]] || return 0
  export CARGO_HOME="$TOOLING/cargo"
  export RUSTUP_HOME="$TOOLING/rustup"
  export PATH="$CARGO_HOME/bin:$PATH"
  if ! command -v rustup >/dev/null 2>&1; then
    log "Installing local rustup toolchain manager into .tooling"
    local target
    if [[ "$OS" == linux && "$ARCH" == x64 ]]; then target=x86_64-unknown-linux-gnu
    elif [[ "$OS" == linux && "$ARCH" == arm64 ]]; then target=aarch64-unknown-linux-gnu
    elif [[ "$OS" == darwin && "$ARCH" == x64 ]]; then target=x86_64-apple-darwin
    else target=aarch64-apple-darwin; fi
    rustup_url="https://static.rust-lang.org/rustup/dist/$target/rustup-init"
    fetch "$rustup_url" "$TOOLING/rustup-init"
    fetch "$rustup_url.sha256" "$TOOLING/rustup-init.sha256"
    rustup_expected="$(awk '{print $1; exit}' "$TOOLING/rustup-init.sha256")"
    [[ -n "$rustup_expected" ]] || die "Could not read rustup SHA-256"
    verify_sha256 "$rustup_expected" "$TOOLING/rustup-init"
    rm -f "$TOOLING/rustup-init.sha256"
    chmod +x "$TOOLING/rustup-init"
    "$TOOLING/rustup-init" -y --profile minimal --no-modify-path --default-toolchain none
    rm -f "$TOOLING/rustup-init"
  fi
  log "Rustup ready: $(rustup --version | head -n1)"
  # rust-toolchain.toml pins the compiler + target; this makes failures explicit early.
  (
    cd contracts/capability-type
    rustup toolchain install 1.95.0 --profile minimal
    rustup target add riscv64imac-unknown-none-elf --toolchain 1.95.0
    if [[ ! -f Cargo.lock ]]; then
      log "Generating contracts/capability-type/Cargo.lock for reproducible transitive dependencies"
      cargo +1.95.0 generate-lockfile
    fi
  )
}

setup_node
setup_rust

npm_install_dir(){
  local dir="$1"
  local args=(--no-audit --no-fund)
  if [[ -f "$dir/package-lock.json" ]]; then
    log "npm ci: $dir"
    npm ci --prefix "$dir" "${args[@]}"
  else
    log "npm install: $dir (no lockfile present yet)"
    npm install --prefix "$dir" "${args[@]}"
  fi
}

if [[ "$SKIP_INSTALL" == 0 ]]; then
  log "Installing npm dependencies (isolated app/package manifests)"
  export npm_config_fetch_retries="${npm_config_fetch_retries:-2}"
  export npm_config_fetch_retry_mintimeout="${npm_config_fetch_retry_mintimeout:-1000}"
  export npm_config_fetch_retry_maxtimeout="${npm_config_fetch_retry_maxtimeout:-15000}"
  export npm_config_fetch_timeout="${npm_config_fetch_timeout:-60000}"
  npm_install_dir packages/ckb-client
  npm_install_dir apps/web
  npm_install_dir apps/live-service
fi

if [[ "$WITH_OFFCKB" == 1 ]]; then
  if command -v offckb >/dev/null 2>&1; then
    log "Using existing OffCKB: $(offckb --version 2>/dev/null | head -n1 || true)"
  else
    log "Installing OffCKB locally into .tooling/npm-global"
    mkdir -p "$TOOLING/npm-global"
    npm install -g @offckb/cli --prefix "$TOOLING/npm-global" --no-audit --no-fund
    export PATH="$TOOLING/npm-global/bin:$PATH"
    offckb --version
  fi
fi

if [[ "$WITH_FIBER" == 1 ]]; then
  if command -v fnn >/dev/null 2>&1; then
    log "Using existing Fiber FNN: $(fnn --version 2>/dev/null | head -n1 || echo installed)"
  elif [[ -x "$TOOLING/fiber/fnn" ]]; then
    export PATH="$TOOLING/fiber:$PATH"
    log "Using previously installed local Fiber FNN"
  else
    [[ "$OS" == linux ]] || warn "Fiber's official installer is best tested on Linux; attempting on $OS."
    fiber_version="${SKILLPASS_FIBER_VERSION:-0.9.0}"
    log "Installing official Fiber FNN v${fiber_version} into .tooling/fiber (testnet; no channels or funds are created)"
    local_installer="$TOOLING/fiber-install.sh"
    fetch "https://raw.githubusercontent.com/nervosnetwork/fiber/v${fiber_version}/tools/install/install.sh" "$local_installer"
    chmod +x "$local_installer"
    INSTALL_DIR="$TOOLING/fiber" FNN_VERSION="$fiber_version" NETWORK=testnet bash "$local_installer"
    rm -f "$local_installer"
    [[ -x "$TOOLING/fiber/fnn" ]] && export PATH="$TOOLING/fiber:$PATH"
  fi
fi

log "Bootstrapping safe local config"
npm run bootstrap

log "Running environment doctor"
npm run doctor

log "Running complete Node test suite"
npm test

log "Running HTTP/UI smoke test"
npm run smoke:http

log "Running x402/Fiber facilitator smoke test"
npm run smoke:fiber

log "Running combined CKB capability + x402/Fiber paid-access smoke test"
npm run smoke:paid

log "Type-checking CCC CKB client"
npm run typecheck:ckb

log "Building React + CCC frontend"
npm run build:web

log "Running local authorization benchmark"
npm run benchmark

if [[ "$WITH_RUST" == 1 ]]; then
  log "Building and testing the CKB RISC-V capability contract"
  npm run verify:contract
else
  warn "Rust contract verification skipped (--no-rust)."
fi

log "All requested verification stages completed successfully"
printf 'Node: %s\n' "$(node -v)"
printf 'npm:  %s\n' "$(npm -v)"
[[ "$WITH_RUST" == 1 ]] && printf 'Rust: %s\n' "$(rustc --version)"
printf 'Benchmark: reports/benchmarks/latest.md\n'

if [[ "$SERVE" == 1 ]]; then
  log "Starting local demo at http://127.0.0.1:8787"
  exec npm run dev
else
  printf '\nRun \033[1m./run_all.sh --serve\033[0m to verify and launch the local demo.\n'
  printf 'Run \033[1mnpm run facilitator\033[0m for the mock x402/Fiber facilitator.\n'
fi
