# Validation snapshot — 2026-08-28

This file records what was actually verified while preparing the v0.4 deployment-focused bundle.

## Passed in the preparation environment

- Node.js: `v22.16.0`
- **38/38 Node tests passed**
  - deterministic ownership/transfer lifecycle
  - x402 v2 transport/requirements
  - facilitator payment/replay behavior
  - persistent replay-store restart behavior
  - FNN request-shape/status adapter
  - facilitator HTTP client/auth behavior
  - backend readiness probes
- `npm run smoke:http` passed
- `npm run smoke:fiber` passed
- `npm run smoke:paid` passed
- combined flow still proves: `402 -> pay -> owner access -> replay reject -> transfer -> paid old-owner reject -> new-owner paid access`
- `bash -n deploy.sh` passed
- `deploy.sh init-testnet` + `deploy.sh doctor` tested in a temporary fixture with valid deployment metadata
- Node syntax checks passed for the live service, facilitator, and new facilitator HTTP client
- latest local verifier benchmark written to `reports/benchmarks/latest.md`

## Dependency-heavy stages are environment-limited here

The preparation sandbox again timed out while downloading the CCC/React/Vite npm dependency trees. No `node_modules` directories were left installed. Therefore these are **not falsely marked as passed** in this environment:

- `npm run typecheck:ckb`
- `npm run build:web`
- Docker image builds / Docker Compose runtime health (Docker daemon unavailable in this sandbox)
- `npm run verify:contract` (Rust toolchain unavailable here)

The typecheck/build commands fail here specifically because their declared npm packages were not downloaded, e.g. `@ckb-ccc/ccc`, React, and connector types are absent. `run_all.sh` and the Dockerfiles install those dependencies on a normal Linux/macOS/WSL/Docker host.

## Deployment changes validated statically

- `.env.testnet.example` and compatibility `.env.live.example` now exist.
- `bootstrap-live.mjs` no longer references a missing template.
- `deploy.sh` generates a random facilitator secret without overwriting an existing environment file.
- real deployment metadata is auto-imported from `deployments/testnet.json` when present.
- self-hosted Fiber defaults to the official `nervos/fiber:0.9.0` release image.
- Fiber wallet funding/channel creation is intentionally not automated.

## Benchmark boundary

The benchmark in `reports/benchmarks/latest.md` measures the in-memory authorization/verifier path only. The latest preparation run was about **86.8k checks/sec**, but it intentionally excludes CKB RPC/network and Fiber latency and must not be presented as end-to-end chain/payment latency.
