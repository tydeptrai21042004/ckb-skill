# Proposed Funding Milestones

This plan keeps the proposal focused on proving the portable-service-right primitive rather than expanding feature count.

## Milestone 1 — Canonical funding release

**Deliverables**

- clean repository/release assets;
- reproducible dependency lock generated from registry metadata;
- protocol/reference-app compatibility contract;
- one funding verification entry point;
- explicit existing-work vs funded-work documentation.

**Acceptance**

- clean clone installs successfully;
- all Node tests pass;
- Type Script tests pass;
- security/grant-readiness checks pass;
- SkillPass Care compatibility check passes.

## Milestone 2 — Real CKB Testnet lifecycle

**Deliverables**

- deployed Capability Type Script metadata;
- real issue transaction to Alice;
- real Alice -> Bob transfer;
- machine-readable Testnet evidence manifest.

**Acceptance**

- original Alice outpoint is consumed;
- successor Bob Cell is live;
- Capability data and Type Script identity are unchanged across transfer;
- transaction hashes/outpoints are public and independently inspectable.

## Milestone 3 — Independent provider verification

**Deliverables**

- Provider A and B use separate identities, signing keys, configuration, and runtime state;
- both verify the same SkillPass right from CKB;
- negative cases for old owner, wrong issuer, stale outpoint, request tampering, and replay.

**Acceptance**

- Alice succeeds before transfer and fails after transfer;
- Bob fails before transfer and succeeds after transfer;
- providers do not synchronize an authoritative owner table.

## Milestone 4 — SkillPass Care reference application

**Deliverables**

- product commitment mapped to Capability V2 subject;
- Care UI exposes real Testnet evidence in live mode;
- provider service event recorded separately from ownership state;
- Demo Mode remains visibly simulated.

**Acceptance**

A reviewer can execute/inspect the complete second-owner workflow without confusing demo state with chain state.

## Milestone 5 — External validation

**Deliverables**

- at least one external provider/developer integration;
- measured time-to-first-successful verification;
- five provider/seller interviews;
- five buyer/user interviews;
- anonymized findings including negative findings.

**Acceptance**

The report distinguishes interview interest, integration success, and actual pilot usage rather than calling internal demonstrations market validation.
