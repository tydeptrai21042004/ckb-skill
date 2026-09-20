# SkillPass Funding Scope

## One-sentence project

**SkillPass is a CKB-native protocol for portable service rights: the current holder is derived from a live CKB Cell, and independently operated providers can verify that holder without synchronizing a shared entitlement-owner database.**

SkillPass Care is the first reference application and demonstrates the protocol with transferable service coverage for second-hand/refurbished products.

## What is already built

- Capability Type Script and transfer invariants.
- Capability V1/V2 codec with subject and policy commitments.
- live-owner/client transaction building logic.
- provider policy and provider-verifier packages.
- request-bound authorization challenges and replay protection.
- signed provider manifests / authorization evidence infrastructure.
- multi-provider local pilot scaffolding.
- optional Fiber/x402 settlement path.
- SkillPass Care reference application and product workflow.

These are **existing work** and should not be represented as future funded deliverables.

## What the funding milestone should complete

1. **Canonical release/reproducibility** — clean install, CI, documented package boundary, final lockfile, one funding-verification command.
2. **Real CKB Testnet lifecycle** — public deployment metadata, issuance to Alice, Alice->Bob transfer, public tx hashes and outpoints.
3. **Independent provider proof** — isolated Provider A and B verify the same live SkillPass right with no shared owner database.
4. **SkillPass Care reference integration** — Care consumes the canonical protocol boundary and demonstrates second-owner service eligibility.
5. **External validation** — at least one external provider/developer integration plus a small provider/user workflow study.

## Acceptance criteria

The funded milestone is complete only when a reviewer can reproduce or independently inspect:

```text
Before transfer:
  Alice @ Provider A -> ALLOW
  Alice @ Provider B -> ALLOW
  Bob              -> DENY

CKB Testnet:
  issue right to Alice
  consume Alice Cell
  create Bob successor Cell
  preserve Capability data/type identity

After transfer:
  Alice @ Provider A -> DENY
  Alice @ Provider B -> DENY
  Bob @ Provider A   -> ALLOW
  Bob @ Provider B   -> ALLOW
```

The evidence package must include the deployment transaction, issuance transaction, transfer transaction, relevant outpoints, provider evidence, source commit, and the exact verification commands.

## Reference application

SkillPass Care must remain downstream of the protocol:

```text
CKB -> SkillPass Capability V2 -> SkillPass verifier -> SkillPass Care -> provider service
```

Care-specific service history or quotas are application/provider evidence. They are not silently added as mutable fields to the ownership Cell during this milestone.

## Explicit non-goals for this grant

- mainnet launch;
- tokenomics or a marketplace;
- identity/reputation system;
- cross-chain portability;
- legal warranty automation;
- global mutable claim-accounting protocol;
- AI-agent marketplace;
- large commercial rollout.

Fiber/x402, delegation, and agent features remain optional extensions and are not required to prove the portable-service-right thesis.

## Evidence, not feature count

The proposal should optimize for uncertainty reduction: real Testnet state, reproducible verification, provider independence, integration difficulty, and user/provider feedback. Adding more unrelated features is lower priority than proving the lifecycle above.
