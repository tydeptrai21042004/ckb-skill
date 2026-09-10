# SkillPass v1.6 — Portable Service Ownership hardening

v1.6 consolidates SkillPass around one primary product claim: a CKB Service Bundle can be recognized by independent providers, and transferring the live Capability Cell changes the authorized owner without synchronizing provider entitlement databases.

## Correctness and stability

- Delegation v2 usage accounting now uses **reserve -> protected execution/payment settlement -> commit**.
- Failed protected execution releases the reservation instead of permanently consuming calls/spend.
- Local and PostgreSQL ledgers track reserved calls/spend and invocation states (`reserved`, `committed`, `released`).
- Concurrent requests cannot oversubscribe a bounded delegation; stale reservations have a bounded recovery path.
- The legacy `consume()` ledger API remains backward compatible.

## Real Service Bundle behavior

- Model API performs a deterministic reference embedding computation.
- Private Data API performs a protected reference dataset query.
- Compute API performs deterministic vector computation and returns a stable job ID.
- Compute is explicitly `idempotent-action`; configured side-effecting upstreams must declare `idempotencyMode=invocation-key`.
- Action requests carry a caller-stable `operationId` bound into the signed wallet challenge, payment binding, delegation accounting, and upstream invocation key so a fresh one-time challenge does not destroy retry idempotency.
- Arbitrary operation modes remain rejected.

## Multi-provider proof

- Added `deploy/compose.multi-provider-pilot.yaml` with three isolated provider identities/processes.
- Added `/api/provider-manifest` with provider identity, service/policy metadata, live-CKB ownership source, canonical manifest hash, and optional external signature.
- Added `SKILLPASS_ENABLED_SERVICES`, `SKILLPASS_PRIMARY_SERVICE`, `SKILLPASS_PROVIDER_ID`, and `SKILLPASS_PROVIDER_NAME`.
- Added `scripts/pilot-check.mjs` to verify provider independence and, when given an outpoint, confirm all providers converge on the same live CKB Capability owner.
- Added `docs/MULTI_PROVIDER_PILOT.md`.

## Product/release coherence

- `npm run dev` now launches the current Model API / Private Data API / Compute API product.
- The old Paper Analyzer / Research Insights simulator is no longer in the primary live Docker image; it remains only as an explicit legacy demo/compatibility path.
- Product-facing docs/examples use the current Service Bundle catalog.
- Restored hidden release assets (`.env*.example`, `.dockerignore`, `.gitignore`, security CI workflow) so clean ZIPs contain their required deployment templates.
- Capability v2 subject-binding policy options are wired through the live provider-policy runtime, while V2/agents remain secondary to the portable-ownership story.

## Verification

- `npm test`: **192/192 passing** in the correction environment before export.
- `npm run security:preflight`: PASS.
- `npm run verify:deploy`: PASS.
- `npm run verify:production`: PASS.

## Known release limitation

A root dependency lockfile is still not present in the supplied repository. Direct dependency versions are pinned, but transitive dependency resolution is not fully reproducible. Generate and commit `package-lock.json` with the intended Node/npm toolchain, review the lockfile, and use `npm ci` before a high-risk production/mainnet launch. This environment could not reliably resolve the npm registry, so v1.6 does not fabricate a lockfile.

The Rust Capability Type contract should also be executed through its Cargo test/reproducible contract build pipeline before any mainnet use.
