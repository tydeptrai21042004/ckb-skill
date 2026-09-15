# SkillPass Grant-Readiness Direction

## Frozen thesis

SkillPass is reusable CKB infrastructure for provider-issued portable service rights. A live Capability Cell represents the right, the current live Cell owner is the authorization source of truth, independent providers can verify the right without a shared entitlement database, and Fiber/x402 is an optional settlement layer for repeated usage.

The reference web application demonstrates the protocol; it is not the core funded output.

## Milestone 1 — Reliability and reproducibility

Acceptance criteria:

- single-winner execution lease is enforced before protected execution;
- 100 concurrent identical retries produce one execution lease winner and one protected side effect;
- stale execution leases can be reclaimed by exactly one worker;
- replay, payment-recovery and durable invocation tests pass;
- Capability V2 Rust contract tests cover issue/transfer/mutation/burn rules;
- clean release includes all `.env.*.example`, ignore files and CI assets;
- a fresh clone can configure and deploy the Testnet reference implementation.

## Milestone 2 — Reusable independent-provider infrastructure

Outputs:

- Capability Cell specification;
- authorization-intent specification;
- provider-manifest specification;
- gateway-assertion specification;
- `@skillpass/provider-verifier`;
- `@skillpass/ckb-client`;
- reference provider integration guide;
- at least two independently operated provider deployments.

Each provider must use separate keys, policy, trusted-issuer configuration and endpoint, and must not share an entitlement ownership database.

## Milestone 3 — Public Testnet validation

Targets:

- 10–20 external testers;
- at least 2 independent providers;
- 30+ completed Alice -> Bob transfer/access cycles;
- 50–100+ protected service calls;
- multiple Fiber/x402 paid interactions;
- zero accepted replay attempts;
- zero duplicate protected executions in the concurrency evidence run;
- public CKB transaction hashes, provider decisions, recovery results and setup-time measurements.

## Canonical demo

1. Issue one Service Bundle Capability to Alice.
2. Provider A independently verifies Alice and serves a protected request.
3. Provider B independently recognizes the same Capability.
4. Alice transfers the Capability to Bob and waits for confirmation.
5. Alice retries Provider A and is denied.
6. Bob uses Provider A and is authorized.
7. Bob uses Provider B with the same entitlement and is authorized.
8. Bob performs one paid Fiber/x402 request.
9. Show the CKB transfer transaction, live owner, provider verification evidence and payment evidence.

## Scope control

Before grant submission, do not expand the primary narrative into an AI-agent framework, marketplace, reputation layer, governance system, NFT marketplace, social product, token economics or cross-chain platform. Those features are outside the hypothesis being validated.

## Falsification criteria

The portable-right hypothesis is weakened if independent providers find integration substantially more complex than conventional entitlement systems, external users show little value for transferability, or tested workflows are better served by a provider-local database or signed receipt. These outcomes should be reported rather than hidden.
