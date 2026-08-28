#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "[SkillPass] Node.js 22+ is required for native development." >&2
  echo "[SkillPass] Docker-only alternative:" >&2
  echo "  docker compose -f deploy/compose.demo.yaml up --build" >&2
  exit 1
fi
exec node scripts/dev-cli.mjs "${1:-help}"
