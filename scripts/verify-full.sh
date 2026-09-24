#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."

run() {
  local label="$1"
  shift
  printf '\n=== %s ===\n' "$label"
  "$@"
  printf '[PASS] %s\n' "$label"
}

# Phase-1 protocol evidence first. These checks are intentionally independent
# of Fiber/x402 so a reviewer can validate the portable-service-right thesis
# without treating optional payment integrations as part of the core protocol.
run "SkillPass protocol core" npm run verify:protocol-core
run "Provider adversarial matrix" npm run test:provider-adversarial
run "Provider conformance" npm run verify:provider-conformance
run "Funding Phase-1 hardening" npm run verify:funding-phase1
run "Testnet evidence shape/status" npm run evidence:testnet:shape

# Existing repository-wide checks remain part of full local verification.
run "Repository verification" npm run verify
run "HTTP smoke" npm run smoke:http
run "CKB client typecheck" npm run typecheck:ckb
run "Web build" npm run build:web
run "Capability Type Script" make -C contracts/capability-type test

printf '\n=== SkillPass full verification summary ===\n'
printf 'skillpass_verify=passed\n'
printf 'phase1_protocol=passed\n'
printf 'provider_adversarial=passed\n'
printf 'provider_conformance=passed\n'
printf 'testnet_evidence=checked\n'
printf '\nReal CKB Testnet lifecycle evidence remains a separate acceptance gate when evidence/testnet/manifest.json is absent.\n'
