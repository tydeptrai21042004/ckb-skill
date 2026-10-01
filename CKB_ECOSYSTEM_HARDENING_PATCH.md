# CKB ecosystem hardening patch

This patch applies the highest-impact changes from the ecosystem review without changing Capability V1/V2 binary layout.

## Implemented

1. **Owner surrender / capacity recovery**: the Capability contract now accepts `1 -> 0` in the Type Script group. The current input lock remains the authorization boundary. The TS client adds `buildSurrenderCapabilityTx()` to return occupied capacity to an ordinary Cell owned by the same signer.
2. **ATOMIC semantics hardened**: the generic issue builder refuses new `BINDING_ATOMIC` issuance, generic transfer already refuses it, and provider verification requires explicit `atomicBindingVerified=true` evidence from a subject-specific adapter. Equal current owners alone are no longer described as atomic co-transfer.
3. **Protocol reference/tests**: protocol-core now models `SURRENDER`; Rust tests cover V1, expired/non-transferable, and V2 surrender. JS tests cover fail-closed atomic binding.
4. **CKB ecosystem boundary**: README clarifies SkillPass as entitlement/authorization, CCC as CKB interaction, Spore/subject protocols as optional bound objects, and Fiber/x402 as optional payment adapters.
5. **Identifier specification**: `docs/IDENTIFIERS_AND_COMMITMENTS.md` defines domain-separated CKB-hash derivation for new service IDs and policy commitments without invalidating legacy values.
6. **Reproducibility assets**: safe environment templates, ignore files, and CI workflows are restored. No real secret or Testnet evidence is fabricated.

## Intentionally not fabricated

- `package-lock.json` (requires registry metadata; run `./prepare-funding-release.sh` on Node 24.x)
- `contracts/capability-type/Cargo.lock` (generate with the pinned Rust 1.95.0 toolchain)
- public Testnet deployment/evidence
- external-provider adoption evidence

## Required before public Testnet deployment

The on-chain contract behavior changed because surrender is now accepted. Rebuild the RISC-V binary and deploy a **new code cell**; do not reuse a code hash for an older binary. Update deployment manifests and provider accepted deployments to the new `codeHash + hashType`.
