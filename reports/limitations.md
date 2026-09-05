# Current Limitations — v0.6

1. The local demo uses an in-memory CKB-like chain and mock Fiber backend; it is deterministic simulation, not CKB/Fiber network evidence.
2. The actual CKB wallet/transaction layer is isolated in `packages/ckb-client` and `apps/web` and requires npm dependencies plus a real wallet/network to execute.
3. The current build sandbox did not provide Docker/Rust execution for the contract/container stages. The Type Script source was not changed; Rust contract tests and Docker image builds remain required in an environment that provides those toolchains.
4. No deployment/payment hash is fabricated. Real testnet evidence must be added only after actual transactions/payments occur.
5. Expiry is an access-layer rule in capability v1: an expired capability can remain ownable/transferable under the Type Script but is rejected for service use.
6. Burn is forbidden in the v1 Type Script to keep lifecycle/singleton semantics simple.
7. Revocation/policy versioning is not yet represented by a separate issuer policy Cell.
8. Delegated sub-agent authority and spending limits are not implemented yet.
9. The local x402/Fiber scheme/network identifier is experimental and is not claimed as an upstream-registered x402 mechanism.
10. Fiber's own x402 facilitator work exists upstream; the local facilitator is a compatibility/research harness, not the research novelty.
12. `paymentPayload.payload.payer` is metadata in this prototype, not an independent cryptographic identity claim. Authorization remains bound to the fresh CKB wallet signature + live Capability Cell; optional preimage mode proves knowledge of the payment preimage, not the human identity string.
11. Real FNN E2E needs funded payer/receiver routing/channel state. `run_all.sh` never creates or funds channels automatically.
13. File-backed payment replay, quote, and delivery-receipt state plus in-memory wallet nonce state are single-replica designs. Horizontal scaling needs shared atomic state.
14. The local verifier benchmark excludes CKB RPC, wallet, Fiber routing, payment confirmation, HTTP WAN latency, and database/storage costs.
15. Single-process restart recovery is implemented, including idempotent facilitator settlement for the post-settlement/pre-receipt crash window. Multi-replica settlement/delivery still needs shared atomic idempotency and failover semantics.
16. Delivery receipts contain protected results and are retained for 24 hours by default; production operators should secure the state volume and choose an appropriate `SERVICE_RECEIPT_TTL_SECONDS`.
17. A production deployment still needs TLS/reverse proxying, observability, dependency scanning, backup/recovery, rate-limit tuning, and independent security review.

18. The revision sandbox could not reach the npm registry, so the dependency-free Node suite and smoke flows were executed, but the React/CCC production build must be rerun with `npm run setup && npm run check` in a networked Node 22 environment.
