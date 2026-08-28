# Changelog

## v0.3.0 — 2026-08-28

### Added

- `run_all.sh` auto-detecting Linux/macOS/WSL and x64/arm64.
- portable Node.js 22 fallback and local rustup/RISC-V setup under `.tooling/`.
- optional local OffCKB and official Fiber FNN installation.
- experimental x402 v2/Fiber compatibility package and facilitator server.
- real FNN JSON-RPC adapter for invoice creation/status reads.
- file-backed single-process payment replay protection.
- combined paid-access route that requires both payment and current capability ownership.
- end-to-end smoke proving paid old-owner rejection after A -> B transfer.
- clickable paid-use path in the local UI.
- local verifier benchmark + generated report.
- CI workflow for Node/integration and Rust contract verification.
- research-gap/funding document correcting the novelty claim relative to upstream Fiber x402 work.

### Changed

- package/repository docs updated from v0.2 to v0.3.
- project positioning changed from a simple AI access pass to **portable payment-linked service rights**.
- `verify:full` now includes HTTP, CCC typecheck/frontend build, and contract tests.

### Important boundaries

- x402/Fiber local scheme identifiers remain experimental.
- real CKB/Fiber transactions are not claimed until independently executed and published.
- the local facilitator is a compatibility harness; Fiber has upstream x402 facilitator work.
