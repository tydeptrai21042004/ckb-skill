# Current Limitations

1. The dependency-free local service uses `TestWallet` HMAC proofs solely for deterministic tests. It is not a real wallet implementation.
2. The actual CCC transaction/sign-message layer is isolated in `packages/ckb-client` and needs npm dependencies plus a real wallet/network to execute.
3. This build environment did not include Rust/Cargo, so the included CKB contract tests could not be executed here.
4. No devnet/testnet deployment hash is fabricated. `deployments/*.json` remain templates until a real deployment occurs.
5. Expiry is an access-layer rule in v1: an expired capability remains ownable/transferable under the Type Script, but `verifyLiveCapability` rejects service use at `now >= expiry`.
6. Burn is forbidden in the v1 Type Script to preserve simple lifecycle semantics.
7. Delegation, Fiber/x402, Spore, JoyID-specific mappings, marketplace, and mainnet are intentionally out of scope for this MVP.
8. The CCC challenge helper should initially be limited to a CKB-native identity mapping. Cross-ecosystem CCC signers need an explicit, audited identity-to-CKB-lock binding before being accepted for service authorization.
9. A production service should replace in-memory nonce storage with a shared TTL store if horizontally scaled, while preserving one-time atomic consumption semantics.
10. A production deployment still needs rate limiting, observability, dependency scanning, and a public web UI.
