# Lock ownership security boundary

## Purpose

SkillPass authorizes the controller of the **current live Capability Cell**. The Capability Type Script protects the service-right identity and transfer invariants, while the Cell lock defines who can spend/control that particular live Cell.

This distinction is security-critical: CKB lock scripts are programs, so an arbitrary lock script is not automatically equivalent to a conventional single-wallet ownership model.

## Phase-1 security rule

A provider MUST treat the Capability deployment and the ownership-lock policy as separate trust decisions.

Authorization requires all of the following:

1. the referenced Capability Cell is live on the expected CKB network;
2. its Capability Type Script matches an explicitly accepted deployment;
3. Capability data/identity, issuer, service policy and finality satisfy provider policy;
4. the requester matches the controller identity expected by the provider for the Cell lock; and
5. the Cell lock belongs to a lock family/configuration that the provider has explicitly reviewed and accepted.

Unknown or custom lock semantics MUST fail closed when the provider cannot establish the intended controller semantics.

## Supported-lock policy

For the funding-candidate lifecycle, record the exact lock script used by Alice and Bob, including code hash, hash type, args shape, wallet/lock family, and the reason its controller semantics are acceptable for the demonstration.

Do not claim universal compatibility with arbitrary CKB locks. ACP-style shared-control arrangements, unusual multisig policies, custom proxy locks, or any script with semantics not reviewed by the provider are outside the Phase-1 assurance boundary unless explicitly added and tested.

## Transfer implication

A transfer is authoritative only after the old Capability outpoint is spent and the successor Capability Cell is live with sufficient confirmations. Providers must re-resolve live-chain state for protected requests; possession of an old challenge, cached owner record, or previously valid outpoint is not ownership evidence after transfer.

## Provider implementation guidance

The high-level `verifySkillPassAuthorization()` path should remain the default integration surface. If a provider uses lower-level verification primitives, that provider is responsible for enforcing accepted deployment identity, finality, current liveness, trusted issuer/service policy, and the supported-lock policy described above.

## Evidence required for funding

The retained Testnet evidence should identify the lock scripts used before and after transfer and demonstrate that Provider A and Provider B independently observe the same ownership transition from canonical CKB state.
