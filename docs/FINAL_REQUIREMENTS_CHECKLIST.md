# SkillPass final grant-readiness requirements checklist

Baseline compared: `ckb-skill-main (2)(1).zip`

This checklist separates requirements that can be completed and verified in source code from requirements that require real external deployments/users. Do not claim the second group as completed until evidence exists.

## Code/repository requirements — implemented

- [x] Single-winner execution reservation with an executor lease token.
- [x] Atomic stale-lease reclaim; only one worker can reclaim an expired lease.
- [x] Execution results can only be persisted by the current lease owner.
- [x] 100-concurrent-retry evidence: 1 lease winner, 1 protected side effect, 0 duplicate executions.
- [x] Replay/challenge/request-intent protection remains enforced.
- [x] Current live CKB Cell ownership remains the authorization source of truth.
- [x] Provider policy and trusted issuer checks remain before protected execution/payment.
- [x] Provider manifest trust can be pinned to an independently trusted Ed25519 public key/fingerprint.
- [x] Gateway assertions can be bound to provider, service, request hash, capability, policy, operation and invocation.
- [x] Multi-provider pilot uses separate provider signing identities/fingerprints.
- [x] Provider-verifier SDK exposes safe-by-default verification helpers.
- [x] Provider integration documentation and protocol specifications are included.
- [x] Reproducible release templates are included: `.env.example`, `.env.testnet.example`, `.env.live.example`, `.env.production.example`, `.env.vercel.example`.
- [x] `.gitignore`, `.dockerignore`, and security-readiness GitHub Actions workflow are included.
- [x] Full Node test suite passes after normal workspace linking/install: 213/213.
- [x] Grant-readiness suite passes: 8/8.
- [x] Security preflight passes.
- [x] Workspace dependency declaration verification passes.
- [x] Deployment/runtime syntax verification passes.
- [x] Direct dependency declarations are exact and checked by `dependency-versions.lock.json`.

## Release gate still required in an online Node 24 environment

- [ ] Generate and commit a real root `package-lock.json` with `npm install --package-lock-only --ignore-scripts`, then use `npm ci` in the release CI gate.
- [ ] Run the full suite under the repository-pinned Node 24.x runtime. This offline verification environment provides Node 22.16.0.
- [ ] Run the Rust Capability V2 contract build/tests with the required RISC-V Rust toolchain or the repository contract Docker path. The current verification container does not provide `cargo`.

These are release-environment tasks, not reasons to weaken or replace the implemented runtime protections.

## External validation requirements — must be completed with real evidence

- [ ] Independent Provider A is operated/deployed independently and verifies SkillPass using its own provider key, policy, issuer allowlist and endpoint.
- [ ] Independent Provider B is operated/deployed independently with the same separation.
- [ ] Provider A and Provider B share no entitlement/ownership database.
- [ ] Real CKB Testnet evidence: Alice is authorized before transfer.
- [ ] Real CKB Testnet evidence: Alice is rejected after the transfer confirms.
- [ ] Real CKB Testnet evidence: Bob is authorized after transfer.
- [ ] The same Capability is recognized by both independent providers.
- [ ] Real Fiber/x402 paid calls and payment-recovery evidence are published.
- [ ] 10–20 external Testnet testers participate.
- [ ] 30+ Alice-to-Bob transfer/access cycles are published with transaction/provider evidence.
- [ ] 50+ protected service calls are recorded.
- [ ] Public test results and an evidence bundle are published.
- [ ] Provider integration time and user-confusion/setup metrics are measured.
- [ ] Demo video and final ecosystem report are published.

## Canonical grant demo

1. Issue a Service Bundle Capability to Alice.
2. Provider A verifies Alice from the live CKB Cell.
3. Alice successfully uses Provider A.
4. Alice transfers the Capability to Bob.
5. Wait for CKB confirmation.
6. Alice retries Provider A and is denied as the old owner.
7. Bob uses Provider A and is authorized.
8. Bob uses independent Provider B with the same Capability and is authorized.
9. Bob performs a paid Fiber/x402 request.
10. Show the CKB transaction, live Cell owner, provider verification evidence and payment evidence.

Do not expand the funding demo with marketplace, reputation, governance, generic AI-agent, NFT or social features. The proposal should remain centered on portable provider-issued service rights.
