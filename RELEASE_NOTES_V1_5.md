# SkillPass v1.5 — asset-bound service-right foundation

This release narrows SkillPass around portable service rights for transferable agents and digital assets rather than generic SaaS entitlement management.

## Implemented

- Backward-compatible Capability v2 codec (`172` bytes) while retaining Capability v1 (`106` bytes).
- Immutable V2 subject commitments: subject type, subject id, binding mode, and policy hash.
- V2 parsing/immutability protection in the CKB Capability Type contract source.
- Provider policies can require subject-bound rights, restrict accepted subject types, and enforce a policy commitment.
- Fresh subject-owner invariant helper: a bound subject and Capability must resolve to the same live owner.
- Generic SDK transfer refuses `ATOMIC` V2 rights; a protocol-aware subject adapter is required instead of silently separating the right from its subject.
- Federated provider acceptance manifests for provider-local recognition of shared rights.
- Authorization evidence objects using request/payment hashes rather than raw payloads.
- CKB issue helper accepts V2 fields.
- Restored missing production/Vercel env templates, `.dockerignore`, `.gitignore`, security CI workflow, and CKB/Fiber handoff documentation.
- Added a concrete market-validation experiment plan.

## Verification in this environment

- `npm test`: 175/175 passed.
- `npm run verify:deploy`: passed.
- `npm run verify:security`: security tests passed; Chromium browser smoke skipped because local Chromium execution is blocked by the environment.
- `node scripts/security-preflight.mjs`: passed.
- `npm run verify:contract`: not executable here because Cargo/Rust is not installed. Run it in the project's documented Rust/CKB contract environment before deploying a new v2 contract binary.

## Important boundary

`BINDING_ATOMIC` is fail-closed in the generic TypeScript transfer helper, but the base Capability contract intentionally does not hard-code how a Spore/DOB/agent subject is discovered. A production atomic adapter must validate the selected subject protocol and construct the co-transfer transaction. Do not claim consensus-enforced atomic subject coupling until such an adapter/contract rule has been implemented and contract-tested for the target subject protocol.
