# Architecture

```text
Browser / wallet
  | explicit signing
  v
CCC transaction client  -----------> CKB testnet
  |                                Capability Cell
  |                                + owner lock
  |                                + Capability Type Script
  |
  +------ signed challenge -------> protected service
                                      |
                                      +--> live-cell verification
                                      +--> paper-analyzer-v1
```

The repository contains two execution paths:

1. **Dependency-free local verification path** — Node's built-in test runner plus an in-memory CKB-like live-cell model. This verifies codec, transition rules, replay protection, service authorization, and the complete A→B transfer/access sequence in a clean environment.
2. **Live CKB path** — Rust `ckb-std` Type Script plus CCC transaction/discovery helpers. This path requires the Rust RISC-V toolchain, contract deployment, a funded CKB testnet wallet, and network access.

The local path is intentionally not presented as proof that CKB-VM execution passed. The live contract tests in `contracts/capability-type/tests` are the on-chain-equivalent tests and should be run in CI or a machine with the Rust toolchain.
