# SkillPass market-validation plan

The project should prove the value of portable service ownership instead of assuming it.

## Flagship experiment

Use one transferable AI agent or digital asset bound to one Capability v2 entitlement. Have two independently configured providers accept the same right. The owner delegates bounded service access to an agent, then transfers the asset/right to a second owner.

Expected sequence:

- Alice + Alice's valid delegate: allowed before transfer.
- Bob: denied before transfer.
- After transfer: Alice and her old delegate are denied from fresh live state.
- Bob and a newly authorized Bob delegate: allowed.
- Per-use Fiber/x402 payment remains a separate requirement.

## Compare against

1. Provider-local database entitlement.
2. Generic token/NFT gate.
3. SkillPass Capability v2.

Record provider DB writes, synchronization operations, stale-authorization window, number of trusted state stores, integration code, authorization latency, transfer latency, and failure modes.

## Evidence required before product claims

- Real Testnet transaction hashes and live outpoints.
- Two providers with independently configured acceptance policies.
- Reproducible transfer/delegation invalidation trace.
- Failure cases: stale outpoint, subject-owner mismatch, wrong issuer, wrong policy hash, expired right, exceeded delegation limits, valid payment without entitlement.
- At least one external developer integration or structured interview indicating why a provider needs portable ownership rather than a database entitlement.
