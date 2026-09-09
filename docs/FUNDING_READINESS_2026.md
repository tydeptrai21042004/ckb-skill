# SkillPass funding-readiness direction (September 2026)

## Funding thesis

SkillPass should be positioned as **portable service-right infrastructure for CKB users, applications, devices, digital assets, and automated clients**, not as another paywalled demo API.

The CKB Eco Fund Spark Program explicitly lists **Fiber Network**, **Developer Tools**, and **Digital Sovereign Infrastructure & Primitives** among its focus areas and is intended to fund a concrete prototype/validation milestone. Source: https://ckbeco.fund/build

Fiber's April 2026 machine-client/agent integration design identifies a missing **Fiber Gateway / reverse-proxy layer**, service discovery, cryptographic credentials, delegation, and agent-oriented API access as useful building blocks. Source: https://github.com/nervosnetwork/fiber/issues/1255

The August 2026 Nervos ecosystem opportunity map also cautions developers not to rebuild generic payment gating/receipt components when reusable implementations already exist. SkillPass therefore differentiates at the **durable CKB-owned entitlement + live ownership + transfer-aware delegation** layer while reusing Fiber/x402 for payment. Source: https://talk.nervos.org/t/ai-machine-payments-and-fiber-in-2026-an-opportunity-map-for-ckb-and-fiber-developers/10665

## What this revision adds

1. **Multi-service registry** — one SkillPass deployment can support multiple service IDs instead of being hard-coded to one analyzer.
2. **Service Gateway** — an operator can protect an existing JSON POST API with SkillPass without rewriting that upstream application.
3. **Owner-signed optional delegation** — the current owner can grant a short-lived `invoke` credential to a separate CKB address while ownership remains in the owner's Capability Cell.
4. **Transfer-aware invalidation** — every delegated use still verifies that the delegating owner controls the current live Capability Cell. A transfer consumes the bound outpoint, automatically killing the old grant.
5. **Intent-bound delegated requests** — delegate address, service, service ID, capability ID, outpoint, action, expiry, request hash and delegation ID are cryptographically bound.
6. **Machine-readable service discovery** — discovery/OpenAPI now publishes the service catalog and delegation model.
7. **Portable evidence** — live ownership verification returns an exportable proof bundle and proof hash.
8. **Authorization receipts in UI** — successful protected requests expose owner/delegate identity mode, entitlement verification, request ID and payment-verification state.
9. **Service Bundle service trio** — `model-api-v1`, `private-data-api-v1`, and `compute-api-v1` demonstrate one shared CKB entitlement being accepted across distinct protected service categories.
10. **Automated-client SDK** — dependency-light discovery and signed invocation helpers expose payment requirements cleanly to automated callers.
11. **Production packaging repair** — missing env templates, Git/Docker ignore files and container copies for new packages are restored.
12. **Per-service Fiber pricing** — operators can price each protected service independently with a validated service-price map.

## Proposed grant milestone

A strong Spark-sized milestone is:

> **SkillPass Gateway: protect an existing read/idempotent JSON API with a transferable CKB Capability, optional Fiber/x402 payment, and optional owner-signed temporary delegation.**

Demo acceptance criteria:

- provider issues two different service rights;
- wallet discovers both from live CKB state;
- owner invokes each service through the same gateway;
- owner optionally delegates one service to another client wallet for <= 24 hours;
- the delegate invokes without receiving the owner's private key or Capability Cell;
- transfer of the Capability invalidates the previous delegation;
- optional Fiber payment is independently verified;
- proof/receipt JSON can be exported;
- a third-party JSON API can be protected using environment configuration only.

## Production gaps that remain (do not hide these in a grant proposal)

### 1. Side-effecting upstream APIs

The current HTTP gateway is intentionally for **read/idempotent JSON services**. A paid request may need to be replayed after a crash or dropped response. Before protecting actions such as purchases, writes, deployments or irreversible jobs, add an upstream idempotency contract/outbox so the business side effect cannot run twice.

### 2. Delegation quotas and spending caps

The first delegation primitive scopes service/action/outpoint/expiry, but does not maintain per-grant call counters or payment budgets. Add durable grant usage accounting only when a concrete delegated-client workflow needs it. Doing this correctly requires shared state across replicas.

### 3. Revocation semantics

A transfer automatically invalidates an old delegation. Provider revocation of the durable Capability itself is deliberately not defined in v1 because that changes the economic meaning from an owned right to a revocable license. Define this policy before adding a revocation mechanism.

### 4. Mainnet / external security review

This remains a CKB Testnet implementation. Before mainnet or meaningful-value payments: freeze protocol formats, add load/failure-injection tests, run dependency audit with a committed lockfile, obtain independent contract/backend review, and document incident/key-rotation procedures.

### 5. Gateway SSRF / egress policy

The upstream URL is operator-configured rather than user-controlled, which removes the main request-time SSRF vector. A higher-assurance deployment should additionally enforce an egress allowlist/private network policy and pin expected upstream identity/certificates where appropriate.

## Suggested next funding phase after this revision

1. Fiber payment adapter for the automated-client SDK so it can satisfy a 402 requirement and retry with a fresh intent-bound challenge.
2. Durable delegation usage/budget policy with Postgres/Redis shared state.
3. Idempotency/outbox protocol for side-effecting protected services.
4. gRPC/MCP adapter in addition to JSON HTTP.
5. External pilot: protect one real community API/tool owned by another CKB developer.
6. Benchmark: authorization latency, CKB lookup latency, payment overhead, throughput under multiple replicas.
7. Independent security review and Testnet public pilot report.

## v1.2 extension: stronger funding evidence

The funding story is stronger when SkillPass is evaluated as an infrastructure primitive rather than as a single demo application. v1.2 therefore adds three concrete pieces that map to real machine-to-service production gaps:

1. **Budgeted delegation** — the owner can authorize a delegated client for a bounded number of calls and/or a bounded Fiber spend amount without transferring the durable CKB right.
2. **Multi-upstream service gateway** — one SkillPass deployment can protect several existing read/query APIs, each with its own service ID, limits and Fiber price.
3. **Optional machine-client protocol + payment adapter** — automated clients can discover the gateway, obtain fresh intent signatures, present delegated credentials, surface/pay x402 requirements through a pluggable adapter, then retry with a fresh challenge.

This preserves the differentiator: **CKB is the durable ownership authority; delegation is temporary scoped authority; Fiber/x402 is usage settlement.**

### Suggested next funded milestone

A natural next milestone is a write-safe job gateway with a client-signed operation ID, durable outbox, upstream idempotency acknowledgement, reconciliation UI, and end-to-end automated-client paid service demo. That milestone should be treated separately from the current read/query gateway because payment settlement and irreversible upstream side effects require stronger recovery guarantees.
