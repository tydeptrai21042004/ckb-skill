# Current Limitations — v0.3

1. The local demo uses an in-memory CKB-like chain and mock Fiber backend; it is deterministic simulation, not CKB/Fiber network evidence.
2. The actual CKB wallet/transaction layer is isolated in `packages/ckb-client` and `apps/web` and requires npm dependencies plus a real wallet/network to execute.
3. The current build sandbox used for this revision did not provide a preinstalled Rust/Docker toolchain; the Type Script source was not changed, and its Rust tests remain a required external/CI verification stage.
4. No deployment/payment hash is fabricated. Real testnet evidence must be added only after actual transactions/payments occur.
5. Expiry is an access-layer rule in capability v1: an expired capability can remain ownable/transferable under the Type Script but is rejected for service use.
6. Burn is forbidden in the v1 Type Script to keep lifecycle/singleton semantics simple.
7. Revocation/policy versioning is not yet represented by a separate issuer policy Cell.
8. Delegated sub-agent authority and spending limits are not implemented yet.
9. The local x402/Fiber scheme/network identifier is experimental and is not claimed as an upstream-registered x402 mechanism.
10. Fiber's own x402 facilitator work exists upstream; the local facilitator is a compatibility/research harness, not the research novelty.
11. Real FNN E2E needs funded payer/receiver routing/channel state. `run_all.sh` never creates or funds channels automatically.
12. File-backed payment replay state and in-memory wallet nonce state are single-replica designs. Horizontal scaling needs shared atomic state.
13. The local verifier benchmark excludes CKB RPC, wallet, Fiber routing, payment confirmation, HTTP WAN latency, and database/storage costs.
14. The service/settlement crash boundary needs production idempotency so delivery cannot be duplicated around a state-persistence failure.
15. A production deployment still needs TLS/reverse proxying, observability, dependency scanning, backup/recovery, rate-limit tuning, and independent security review.
