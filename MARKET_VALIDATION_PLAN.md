# SkillPass market-validation plan

The project must prove the value of **portable multi-provider service ownership** instead of assuming it. Agent and Capability v2 scenarios are secondary experiments, not the flagship product claim.

## Flagship experiment

Issue one transferable Service Bundle Capability accepted by three independently configured providers: Model API, Private Data API, and Compute API. The providers must not share an entitlement database.

Expected sequence:

- Alice owns the live Capability Cell and can use all three providers.
- Bob is denied before transfer.
- Alice may optionally create a bounded contractor/CI delegation.
- Alice transfers the Capability to Bob.
- After transfer, Alice and any grant tied to the consumed old outpoint are denied from fresh live state.
- Bob is accepted by all participating providers from the new live outpoint.
- Provider-side entitlement ownership updates after transfer: **zero**.
- Fiber/x402 remains an optional per-use payment requirement, separate from ownership and authorization.

Run the local three-provider proof with `npm run pilot:up` and `npm run pilot:check`. See `docs/MULTI_PROVIDER_PILOT.md`.

## Compare against

1. Provider-local database entitlement + manual account migration.
2. API-key rotation / per-provider ACL update.
3. Generic token/NFT gate.
4. SkillPass Service Bundle Capability.

Record provider DB writes, manual synchronization operations, stale-authorization window, number of trusted state stores, integration code, authorization latency, transfer confirmation latency, and failure modes.

## Evidence required before product claims

- Real Testnet transaction hashes and current live outpoints.
- At least three provider identities with independently configured acceptance policies.
- Reproducible transfer + old-owner/delegation invalidation trace.
- Failure cases: stale outpoint, wrong issuer, wrong policy, expired right, exceeded delegation limits, valid payment without entitlement.
- At least one external provider integration or structured interview demonstrating a real ownership-migration/delegation pain that provider-local accounts do not solve cleanly.

## Secondary experiments

After the core experiment succeeds, test Capability v2 asset/subject binding and automated-client delegation. These should demonstrate extensions of portable ownership, not redefine the product around agents.
