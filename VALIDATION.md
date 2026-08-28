# Validation snapshot — 2026-08-28

This file records what was actually verified while preparing the v0.3 corrected bundle.

## Passed in the preparation environment

- Node.js: `v22.16.0`
- `npm run verify`
  - **36/36 Node tests passed**
  - deterministic ownership/transfer lifecycle
  - HTTP/UI smoke
  - experimental x402/Fiber facilitator smoke
  - combined `402 -> pay -> capability authorization -> settlement` smoke
  - payment replay rejection
  - paid-but-no-longer-owner rejection after transfer
- `bash -n run_all.sh`
- `./run_all.sh --help`
- generated browser/demo JavaScript syntax checks
- latest local in-memory verifier benchmark written to `reports/benchmarks/latest.md`

## Environment-limited stages

The sandbox used to prepare this archive repeatedly timed out while downloading the dependency-heavy CCC/Vite npm trees. It also did not have a preinstalled Rust/Docker toolchain. Therefore the following were **not falsely marked as passed here**:

- `npm run typecheck:ckb`
- `npm run build:web`
- `npm run verify:contract`

`run_all.sh` is designed to install the missing local toolchains/dependencies and run those stages on Linux, macOS, or WSL. The GitHub Actions workflow runs the same Node + Rust acceptance layers in CI.

## Benchmark boundary

The benchmark in `reports/benchmarks/latest.md` measures the in-memory authorization/verifier path only. It intentionally excludes CKB RPC/network latency and must not be presented as end-to-end chain latency.
