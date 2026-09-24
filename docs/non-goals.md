# Phase-1 non-goals and overlap boundary

SkillPass Phase 1 is intentionally narrow. The project validates one CKB-native primitive: **a transferable service entitlement whose authorization follows the current live Capability Cell owner and can be independently verified by multiple providers**.

The following are explicitly outside the Phase-1 protocol scope:

1. **Mainnet launch** — public CKB Testnet evidence comes first.
2. **Payment protocol development** — Fiber/x402 may be composed with SkillPass, but SkillPass does not redefine Fiber payments, invoices, spending permissions, or generic payment receipts.
3. **DID, identity, reputation, or credential infrastructure** — SkillPass represents an exercisable service right, not an achievement certificate, identity claim, or reputation record.
4. **Generic token gating** — the target is a service-right lifecycle with immutable entitlement semantics, transfer-aware stale-owner rejection, provider policy, and multi-provider conformance rather than a generic "owns asset -> enter" gate.
5. **Agent authorization as the primary product** — agent SDK/delegation code may remain available as an extension, but direct current-owner authorization is the Phase-1 acceptance path.
6. **Marketplace/discovery infrastructure** — prove the service-right primitive before building discovery or exchange layers.
7. **Physical-product possession or legal-title proof** — SkillPass proves control of the service-right Cell. A reference application may bind product metadata, but physical possession/title is a separate trust problem.
8. **Application databases as ownership authority** — off-chain applications may store quota, history, workflow, or revocation policy; they must not override the canonical current owner resolved from CKB.
9. **Cross-chain/RGB++ support** — unnecessary before the CKB-native lifecycle is independently reproduced.
10. **Speculative-token economics** — Capability Cells represent service authorization, not a speculative asset thesis.

## Phase-1 core

The funded/reviewed core is limited to:

- Capability V1/V2 encoding and Type Script lifecycle invariants;
- live CKB ownership resolution;
- provider deployment/issuer/service/finality verification;
- Alice -> Bob stale-owner rejection;
- independent Provider A / Provider B conformance;
- reproducible real-Testnet evidence;
- SkillPass Care compatibility as a reference application boundary.
