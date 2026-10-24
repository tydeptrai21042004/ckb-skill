# `@skillpass/care-bridge`

Safe reference integration boundary for **SkillPass Care**, not a replacement for the Care application.

Provide three functions to `createCareBridge`:

1. `verifyRequesterProof(request)`: verify a fresh, nonce-bound wallet signature of a request that includes the Capability outpoint, service, provider, operation id, and request payload hash. Replay must be prevented in persistent storage; never treat a lock hash supplied by the caller as proof of key control.
2. `verifyCurrentOwner(request)`: resolve **that precise outpoint** against current CKB live-Cell state using the existing `verifySkillPassAuthorization` helper; return `{authorized:true, capabilityId, ownerLockHash, outPoint, confirmations}` on success, otherwise throw or deny.
3. `commitCoverageEvent(request)`: Care's **database transaction** must enforce available quota, unchanged coverage policy, unique `operationId`, any provider permissions and product/coverage binding. Return `{status:"committed"}` or `{status:"deduplicated"}` only after durable commit. Duplicate `operationId`s with different payloads must fail.

The bridge rechecks live ownership before committing a service-event update. This narrows stale-owner races but **cannot make an off-chain database transaction atomic with CKB consensus**. Care must define its policy for transfers occurring after that final read (e.g. retain the verified authorization outpoint as event provenance, require confirmations and reconcile on chain updates). For high-value irreversible physical repairs, require application-level reservation/settlement controls.

Use `npm run test:care-bridge` to run the failure, transfer and concurrent-redemption regression tests. This is an offline adapter suite; SC-01/SC-02 are not marked complete until the separate Care repo integrates and passes a real Testnet workflow.
