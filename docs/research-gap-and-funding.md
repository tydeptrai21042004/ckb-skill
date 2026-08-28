# Research gap and funding direction — SkillPass v0.3

## What is no longer a defensible gap

Do **not** pitch the project as “build x402 on Fiber.” Nervos/Fiber already published an agent-payment design that prioritizes an x402 Fiber facilitator, and an x402 facilitator/payment-preimage draft implementation exists upstream.

Therefore the research novelty must sit **above the payment rail**.

## Defensible gap

The stronger question is **payment-linked portable rights**:

```text
provider-issued durable right
          +
portable current ownership
          +
per-use/session machine payment
          +
request/delivery evidence
```

Existing payment integration can answer “was this invoice/payment valid?” SkillPass adds the independent question “does the payer/requester currently possess the provider-issued right required for this service?”

The strongest adversarial case is:

> A valid payment from an actor who no longer owns the capability must still be denied.

That case is now automated in `npm run smoke:paid`.

## Research questions

### RQ1 — Portable authorization
Can a service right move A -> B with no provider entitlement-row mutation while immediately revoking A and granting B?

### RQ2 — Separation of durable right from frequent consumption
Can CKB hold slow/durable ownership state while Fiber carries frequent payment activity, avoiding a CKB L1 update for every API invocation?

### RQ3 — Payment/authorization composition
Can payment and capability proofs be composed so neither a copied payment proof nor a stale/consumed capability grants access?

### RQ4 — Production economics
When does `CKB capability + Fiber payment` offer a meaningful advantage over database subscriptions, API keys, or payment-only x402?

## Baselines for a paper/report

| Baseline | Ownership source | Payment | Portable right | Key experiment |
|---|---|---|---|---|
| B0 database/API key | provider DB | external | no | latency/ops baseline |
| B1 x402/Fiber only | none | yes | no | payer can access after payment |
| B2 CKB capability only | CKB | no | yes | transfer revokes/grants |
| B3 SkillPass v0.3 | CKB | Fiber/x402 | yes | wrong owner pays but is denied |

## Measurements still needed for a serious result

- CKB RPC authorization p50/p95/p99 with a real public/private node;
- Fiber payment p50/p95/p99 and failure rate;
- end-to-end 402 -> payment -> authorized response latency;
- L1 transactions per 100/1,000 API uses;
- transfer confirmation time and post-transfer revocation lag;
- payment replay success rate (target 0%);
- stale Cell replay success rate (target 0%);
- provider entitlement database writes per transfer (target 0);
- restart and horizontal-replica behavior;
- 5-10 unrelated-user usability pilot.

`reports/benchmarks/latest.md` currently measures only the local verifier CPU path and must not be reported as network latency.

## Funding-oriented milestone ladder

### Milestone 1 — reproducible prototype
Success criteria:

- one-command setup;
- public source;
- automated A -> B capability flow;
- automated 402/payment/replay flow;
- “paid but no longer owner” denial;
- CI green;
- benchmark methodology documented.

### Milestone 2 — real testnet evidence
Success criteria:

- real CKB contract deployment hash;
- real issue + transfer hashes;
- real CCC wallet flow;
- real FNN payment proof/receipt evidence;
- public endpoint;
- unrelated tester reproduces the flow.

### Milestone 3 — provider pilot
Success criteria:

- at least 2 independent protected services/providers;
- a documented business reason for transferability/delegation;
- observable repeated usage rather than a one-shot demo;
- production replay/nonce store and operational metrics.

## Current ecosystem references

- Fiber agent/x402 design: https://github.com/nervosnetwork/fiber/issues/1255
- Fiber x402 facilitator draft: https://github.com/nervosnetwork/fiber/pull/1301
- Fiber v0.9 series/repository: https://github.com/nervosnetwork/fiber
- x402 v2: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
- CCC: https://github.com/ckb-devrel/ccc
