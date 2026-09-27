# Funding Must-Fix Final Checklist — ckb-skill

> **Funding role:** PRIMARY funding candidate.
>
> **Rule:** Do not add broad new features until every **P0 Funding Blocker** below is complete.
>
> **Core claim to prove:** A transferable service entitlement is represented by a live CKB Capability Cell; authorization follows the current live Cell owner; independent providers can verify the same right without sharing an entitlement-owner database.

---

## 0. Funding goal

The funding case should be:

> SkillPass already works as a CKB-native portable service-right primitive. The requested grant turns the proven primitive into a reproducible, independently consumable ecosystem component.

Do **not** make the first funding request about Fiber, x402, agents, DID, reputation, marketplace, cross-chain, or Mainnet.

---

# P0 — FUNDING BLOCKERS

These items must be finished before submitting a serious DAO funding proposal.

## P0.1 — Publish one complete REAL CKB Testnet lifecycle

- [ ] Deploy the exact `contracts/capability-type` binary built from the funding-candidate source commit to CKB Testnet.
- [ ] Record the exact source Git commit.
- [ ] Record the Rust toolchain version used for the deployment build.
- [ ] Record the contract binary SHA-256.
- [ ] Record the deployed code hash / Type Script identity.
- [ ] Record the deployment transaction hash and output index.
- [ ] Issue one real SkillPass Capability to Alice.
- [ ] Record the issuance transaction hash and Alice live outpoint.
- [ ] Confirm Alice's Capability Cell is live before authorization.
- [ ] Provider A independently returns `ALLOW` for Alice.
- [ ] Provider B independently returns `ALLOW` for Alice.
- [ ] Bob returns `DENY` before transfer.
- [ ] Execute a real Alice -> Bob transfer on CKB Testnet.
- [ ] Record the transfer transaction hash.
- [ ] Prove Alice's old outpoint is spent/dead.
- [ ] Prove Bob's successor Capability Cell is live.
- [ ] Prove Capability identity/data/type invariants are preserved across transfer.
- [ ] Provider A returns `DENY` for Alice after transfer.
- [ ] Provider B returns `DENY` for Alice after transfer.
- [ ] Provider A returns `ALLOW` for Bob after transfer.
- [ ] Provider B returns `ALLOW` for Bob after transfer.
- [ ] Record block numbers / confirmation depth / finality evidence used for every authorization decision.

### Required repo artifact

Replace the current example-only evidence with real evidence:

- [ ] Create `evidence/testnet/manifest.json`.
- [ ] Replace or supplement `evidence/testnet/manifest.example.json`.
- [ ] Create real Provider A evidence under `evidence/testnet/providers/`.
- [ ] Create real Provider B evidence under `evidence/testnet/providers/`.
- [ ] Add transaction/outpoint/code-hash evidence files.
- [ ] Update `evidence/SHA256SUMS.txt`.
- [ ] `npm run evidence:testnet:require` passes against retained real evidence.

### Acceptance condition

A reviewer who has never spoken to the author can inspect the repository and independently confirm:

```text
Before transfer:
Alice -> ALLOW at A
Alice -> ALLOW at B
Bob   -> DENY

After real CKB transfer:
old Alice Cell -> DEAD
new Bob Cell   -> LIVE
Alice -> DENY at A
Alice -> DENY at B
Bob   -> ALLOW at A
Bob   -> ALLOW at B
```

---

## P0.2 — Make the contract build reproducible

The current repo already has `rust-toolchain.toml` and contract verification tooling. Finish the release chain.

- [ ] Generate and commit `contracts/capability-type/Cargo.lock` if the contract workspace design expects one.
- [ ] Verify `rust-toolchain.toml` pins the exact release toolchain.
- [ ] Make the canonical release build command explicit in `HOW_TO_VERIFY.md`.
- [ ] Run `npm run verify:contract`.
- [ ] Run `npm run verify:contract:docker`.
- [ ] Rebuild the deployed Testnet binary from the release commit.
- [ ] Prove the rebuilt binary hash matches the deployed binary hash byte-for-byte.
- [ ] Store the build output hash in the Testnet evidence manifest.
- [ ] Add a CI job that rebuilds the contract from a clean environment.

### Funding gate

- [ ] A clean clone can deterministically recreate the contract artifact used in the public Testnet proof.

---

## P0.3 — Commit a real npm lockfile and make clean install reproducible

The repository currently has exact direct versions plus `dependency-versions.lock.json`, but no root `package-lock.json`.

- [ ] Generate root `package-lock.json` using the pinned Node release.
- [ ] Commit `package-lock.json`.
- [ ] Confirm all workspace packages install with `npm ci`.
- [ ] Confirm no manual workspace linking is required after `npm ci`.
- [ ] Run all funding verification from a brand-new clone.
- [ ] Update `docs/NPM_LOCKFILE.md` / verification docs to remove any "pending lockfile" state.
- [ ] Update `STATUS.md` so root npm lockfile is no longer marked pending.

### Required clean-clone command sequence

- [ ] `npm ci`
- [ ] `npm run verify:protocol-core`
- [ ] `npm run test:provider-adversarial`
- [ ] `npm run verify:provider-conformance`
- [ ] `npm run verify:funding-candidate`
- [ ] `npm run evidence:testnet:require`
- [ ] contract Docker/reproducibility check

---

## P0.4 — Add PUBLIC CI as a release gate

The uploaded funding candidate has no `.github/workflows` directory.

Create public GitHub Actions workflows.

### Minimum workflows

- [ ] `.github/workflows/protocol.yml`
- [ ] `.github/workflows/contract.yml`
- [ ] `.github/workflows/web.yml`
- [ ] `.github/workflows/funding-release.yml`

### Required CI checks

- [ ] `npm ci`
- [ ] `npm run verify:protocol-core`
- [ ] `npm run test:provider-adversarial`
- [ ] `npm run verify:provider-conformance`
- [ ] `npm run verify:dependency-lock`
- [ ] `npm run verify:workspaces`
- [ ] `npm run security:preflight`
- [ ] `npm run typecheck:vercel`
- [ ] `npm run build:web`
- [ ] `npm run verify:funding-candidate`
- [ ] Rust contract unit/integration tests
- [ ] Docker reproducible contract build
- [ ] Evidence manifest validation

### Funding gate

- [ ] Funding-candidate Git tag points to a commit with green public CI.
- [ ] README displays CI status.
- [ ] Exact successful CI run is linked from the funding evidence document.

---

## P0.5 — Make Provider A and Provider B genuinely independent

Internal conformance profiles are useful, but funding evidence should show real independence.

- [ ] Provider A and Provider B run as separate processes/deployments.
- [ ] Provider A has a unique provider identity.
- [ ] Provider B has a unique provider identity.
- [ ] Provider A uses a separate signing key.
- [ ] Provider B uses a separate signing key.
- [ ] Provider A configuration is stored separately from Provider B.
- [ ] Provider A does not read Provider B's private database/state.
- [ ] Provider B does not read Provider A's private database/state.
- [ ] Neither provider uses a shared mutable "current owner" database.
- [ ] Both resolve current ownership from CKB.
- [ ] Prefer separate RPC endpoints for the retained proof.
- [ ] Document exactly what "independent provider" means in the protocol docs.
- [ ] Retain Provider A/B evidence before and after transfer.
- [ ] Ideally have Provider B operated by another developer/team.

### Existing scripts to use

- [ ] `npm run providers:init-testnet`
- [ ] `npm run providers:testnet:before`
- [ ] `npm run providers:testnet:after`

---

## P0.6 — Obtain independent clean-clone reproduction

Self-authored proof is not enough for the strongest funding case.

- [ ] Ask at least one CKB developer/reviewer to clone the tagged release.
- [ ] Reviewer runs the documented clean-install path.
- [ ] Reviewer verifies the Testnet deployment/code hash.
- [ ] Reviewer verifies Alice/Bob lifecycle evidence.
- [ ] Reviewer runs provider verification locally or against a public provider.
- [ ] Reviewer confirms results publicly in GitHub issue #37, a PR, or another immutable public record.
- [ ] Store a link/reference to the independent reproduction in the funding evidence README.

### Best outcome

- [ ] One reviewer reproduces the proof without receiving private setup help.

---

## P0.7 — Document lock/ownership semantics explicitly

SkillPass treats the live Capability Cell lock as the current service-right owner. Make the security assumption explicit.

Create:

- [ ] `docs/LOCK_OWNERSHIP_SECURITY.md`

It must define:

- [ ] What "owner" means in SkillPass.
- [ ] Which lock families are explicitly supported.
- [ ] Which lock families are unreviewed/unsupported.
- [ ] What happens with unknown/custom locks.
- [ ] How ACP-like or permissive locks are treated.
- [ ] Whether lock semantics can permit third-party spending.
- [ ] Fail-closed behavior for ambiguous ownership semantics.
- [ ] How multiple candidate Capability Cells are handled.
- [ ] How stale RPC/indexer results are handled.
- [ ] Reorg/finality policy for provider authorization.
- [ ] Script deployment identity / upgrade policy.

### Funding gate

- [ ] Unsupported or ambiguous lock semantics cannot silently produce `ALLOW`.

---

# P1 — STRONGLY IMPROVE THE FUNDING CASE

## P1.1 — Publish one tiny provider/verifier package boundary

The monorepo has many useful packages. Funding reviewers and adopters need one obvious integration path.

- [ ] Choose one canonical package boundary for third-party providers.
- [ ] Prefer a name such as `@skillpass/verifier` or `@skillpass/provider`.
- [ ] Keep the first public API minimal.
- [ ] Add one `<30 minute` integration example.
- [ ] Add one executable sample provider.
- [ ] Add one test proving the package can be consumed outside the monorepo.
- [ ] Test ESM consumption.
- [ ] Test TypeScript consumption.
- [ ] Publish a versioned package or release tarball.
- [ ] Document compatibility with the deployed Capability version.

### Target developer experience

```ts
const decision = await verifySkillPass({
  capabilityId,
  claimant,
  serviceId
});

if (!decision.allowed) deny();
```

The exact API may differ, but the integration must fit on one README screen.

---

## P1.2 — Bind SkillPass Care to the real Testnet lifecycle

This should be evidence that SkillPass creates real product utility, not a second funding project.

- [ ] Inject the canonical SkillPass Testnet ownership/verifier into Care.
- [ ] Alice starts with 3 Care service units.
- [ ] Provider A verifies Alice from live SkillPass ownership.
- [ ] Provider A consumes 1 service unit: `3 -> 2`.
- [ ] Execute the real SkillPass Alice -> Bob transfer.
- [ ] Alice is rejected after transfer.
- [ ] Bob is accepted from the new live Capability Cell.
- [ ] Provider B consumes 1 service unit: `2 -> 1`.
- [ ] Care preserves both service events across ownership transfer.
- [ ] Care database never becomes authoritative for current owner.
- [ ] Retain machine-readable evidence of the entire cross-repo flow.

---

## P1.3 — Add external adoption evidence

- [ ] Get one project outside `ckb-skill` / SkillPass Care to consume the verifier.
- [ ] Prefer another CKBuilder project or independent CKB developer.
- [ ] Record integration time and friction.
- [ ] Record what API/docs had to change because of the integration.
- [ ] Obtain public confirmation from the external maintainer.
- [ ] Add the integration as a funding evidence link.

---

## P1.4 — Add minimal user/provider validation

Do not overclaim market validation.

- [ ] Interview at least 5 relevant providers/sellers/developers.
- [ ] Ask whether transferable service coverage/right is understandable.
- [ ] Ask what provider evidence is required before accepting a transferred right.
- [ ] Ask whether provider independence is valuable.
- [ ] Record objections and negative feedback.
- [ ] Publish anonymized findings.
- [ ] Separate "technical interest" from "willingness to pilot".

---

## P1.5 — Create one canonical funding evidence document

Create:

- [ ] `docs/FUNDING_EVIDENCE.md`

It should contain:

- [ ] release tag
- [ ] source commit
- [ ] CI link
- [ ] contract binary hash
- [ ] deployment transaction
- [ ] issuance transaction
- [ ] transfer transaction
- [ ] old/new outpoints
- [ ] confirmation policy
- [ ] Provider A before/after evidence
- [ ] Provider B before/after evidence
- [ ] Care cross-provider lifecycle evidence
- [ ] external reproduction
- [ ] external integration
- [ ] exact verification commands
- [ ] known limitations
- [ ] explicitly unfinished items

---

# P2 — GRANT PROPOSAL PREPARATION

Only do this after all P0 items are complete.

## P2.1 — Narrow the first grant scope

- [ ] Make SkillPass the funded primitive.
- [ ] Treat SkillPass Care as the reference application.
- [ ] Keep CellFlow out of this first proposal.
- [ ] Keep Mainnet out of scope.
- [ ] Keep Fiber/x402 optional/out of milestone acceptance.
- [ ] Keep DID/reputation/credentials out of scope.
- [ ] Keep agent marketplace/delegation out of scope.
- [ ] Keep marketplace/tokenomics out of scope.

---

## P2.2 — Define objective milestones

Every funded milestone must end in reviewer-verifiable outputs.

Suggested shape:

### Milestone 1 — Canonical reusable release
- [ ] tagged release
- [ ] public CI
- [ ] reproducible contract
- [ ] verifier package
- [ ] Testnet deployment metadata

### Milestone 2 — Independent provider + Care proof
- [ ] Provider A/B live proof
- [ ] Alice -> Bob real transfer
- [ ] Care `3 -> 2 -> transfer -> 1` lifecycle
- [ ] evidence bundle

### Milestone 3 — External adoption
- [ ] external integration
- [ ] integration report
- [ ] documentation/API changes from real adoption
- [ ] final reproducibility report

---

## P2.3 — Budget discipline

- [ ] Request funding only for future work.
- [ ] Do not bill the DAO for code already implemented.
- [ ] Keep the first request modest and milestone-based.
- [ ] Tie each payment to observable deliverables.
- [ ] State explicit deadlines.
- [ ] State explicit out-of-scope items.
- [ ] State maintenance/support commitment after the final milestone.
- [ ] State what happens if an integration target becomes unavailable.

---

# FINAL FUNDING GATE — ckb-skill

Do not submit the DAO proposal until all boxes below are checked.

- [ ] Real Capability Type Script deployed on CKB Testnet.
- [ ] Reproducible contract binary matches deployed code.
- [ ] Root `package-lock.json` committed.
- [ ] Clean `npm ci` works.
- [ ] Public GitHub Actions CI is green.
- [ ] Real issuance to Alice retained.
- [ ] Real Alice -> Bob transfer retained.
- [ ] Old Alice outpoint proven dead.
- [ ] Bob successor outpoint proven live.
- [ ] Provider A independently verifies before/after.
- [ ] Provider B independently verifies before/after.
- [ ] Alice is denied after transfer.
- [ ] Bob is allowed after transfer.
- [ ] Confirmation/finality policy documented.
- [ ] Lock ownership assumptions documented.
- [ ] Testnet evidence manifest is complete and machine-readable.
- [ ] `npm run evidence:testnet:require` passes.
- [ ] One external developer reproduces the proof.
- [ ] One external consumer/provider integrates the verifier.
- [ ] SkillPass Care demonstrates the real cross-provider continuity flow.
- [ ] Funding scope excludes unrelated feature expansion.
- [ ] Every proposed milestone has an objective verification path.
- [ ] Grant budget pays only for new work.

---

## Current repo-specific starting point

Already strong in this uploaded revision:

- Capability Type Script source/tests.
- Capability V1/V2 codec.
- transfer builder and live-owner logic.
- provider verifier.
- provider conformance harness.
- adversarial/fail-closed provider tests.
- grant-readiness scripts.
- security preflight.
- signed provider evidence infrastructure.
- multi-provider pilot scaffolding.
- `rust-toolchain.toml`.
- `dependency-versions.lock.json`.
- `npm run verify:funding-candidate`.
- `npm run evidence:testnet:*` tooling.
- 213/213 Node tests reported in the grant-ready snapshot.

Still funding-critical in this uploaded revision:

- real retained Testnet lifecycle;
- root npm transitive lockfile;
- public GitHub Actions workflows;
- clean independent reproduction;
- external adoption;
- deployed binary reproducibility proof;
- explicit lock-semantics security policy.

**Priority order:** Testnet evidence -> reproducibility/CI -> provider independence -> external reproduction -> Care real integration -> external adoption -> grant proposal.
