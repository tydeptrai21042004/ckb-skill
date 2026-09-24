# SkillPass

**Portable service rights on CKB.**

SkillPass represents a service entitlement as a CKB Capability Cell. The current holder is derived from the **live Cell lock**, so independent providers can recognize an ownership change without synchronizing a shared entitlement-owner database.

```text
Alice owns SkillPass right
        |
        +--> Provider A: ALLOW
        +--> Provider B: ALLOW
        |
        |  Alice transfers the live Cell
        v
Bob owns successor Cell
        |
        +--> Alice: DENY
        +--> Bob @ Provider A: ALLOW
        +--> Bob @ Provider B: ALLOW
```

## Funding focus

The funding candidate is intentionally narrower than the full repository feature set:

1. canonical SkillPass protocol release;
2. real CKB Testnet issue + Alice->Bob transfer evidence;
3. independently operated provider verification;
4. SkillPass Care as a rich reference product built on the protocol;
5. external integration and small user/provider validation.

See [`FUNDING.md`](./FUNDING.md), [`STATUS.md`](./STATUS.md), and [`docs/FUNDING_ACCEPTANCE_MATRIX.md`](./docs/FUNDING_ACCEPTANCE_MATRIX.md).

## Why CKB

SkillPass uses CKB primitives directly:

- **Cell data / Type Script** — immutable service-right identity and policy fields;
- **Cell lock** — authoritative current controller;
- **Cell consumption + successor output** — ownership transition;
- **outpoint/live-state resolution** — stale-owner rejection;
- **provider-side verification** — independent authorization from public chain state.

Capability V2 additionally supports subject and policy commitments for application-specific binding without moving application databases into the ownership protocol.

## Reference application: SkillPass Care

SkillPass Care demonstrates more than ownership transfer. It is a vertical product for second-hand/refurbished service coverage with its own mutable coverage lifecycle:

```text
product commitment + Care plan
            |
SkillPass Capability V2
            |
Alice uses service at Provider A
3 visits -> 2 visits
            |
Alice -> Bob portable-right transfer on CKB
            |
coverage remains 2 visits
            |
Bob uses service at Provider B
2 visits -> 1 visit
```

SkillPass remains authoritative for **portable ownership and authorization**. Care remains authoritative for **coverage plan, quota, service history, issuer controls and repair-provider workflow**. This two-state boundary keeps the base protocol reusable without flattening the reference product into a Capability viewer. See [`docs/REFERENCE_APPLICATIONS.md`](./docs/REFERENCE_APPLICATIONS.md) and [`docs/SKILLPASS_CARE_BOUNDARY.md`](./docs/SKILLPASS_CARE_BOUNDARY.md).

## Core packages

| Package | Role |
|---|---|
| `@skillpass/capability-codec` | canonical Capability V1/V2 encoding and identity |
| `@skillpass/service-rights` | service-right policy and subject-binding rules |
| `@skillpass/provider-verifier` | independent provider verification/evidence |
| `@skillpass/provider-conformance` | portable-ownership acceptance harness for independent providers |
| `@skillpass/ckb-client` | live CKB discovery, issuance and transfer building |
| `@skillpass/auth-protocol` | canonical request/authorization intent |

Delegation, agent SDK, service gateway, and Fiber/x402 settlement are useful extensions but are **not part of the Phase-1 protocol acceptance scope**. SkillPass does not attempt to replace Fiber payments, DID/reputation systems, verifiable credentials, or generic token-gating frameworks. See [`docs/non-goals.md`](./docs/non-goals.md) for the overlap boundary.

## Verification

Repository tests that do not require installed workspace dependencies can be run with:

```bash
node --test
```

For the complete funding candidate after installing dependencies:

```bash
npm install --ignore-scripts --no-audit --no-fund
npm run verify:funding-candidate
```

A final tagged funding release should include a generated `package-lock.json` and use `npm ci`. This snapshot does not fabricate a transitive lockfile without registry metadata.

Important verification commands:

```bash
npm run verify:protocol-core
npm run test:provider-adversarial
npm run verify:provider-conformance
npm run verify:contract
npm run verify:grant-ready
npm run verify:features
npm run evidence:verify
```

See [`HOW_TO_VERIFY.md`](./HOW_TO_VERIFY.md) for the broader verification flow.

## Real-chain status

Example deployment templates live under `deployments/`. Placeholder values such as `0xREPLACE_AFTER_REAL_DEPLOYMENT` are **not** presented as a real Testnet deployment. The highest-priority remaining funding artifact is a public Testnet deployment plus issuance/transfer evidence recorded under `evidence/testnet/`.

## Security model

Providers must fail closed when authoritative state cannot be resolved. Authorization is bound to the capability, requester, service/policy, and request intent; replay/idempotency controls exist for protected actions. See [`SECURITY.md`](./SECURITY.md), [`docs/AUTHORIZATION_EVIDENCE.md`](./docs/AUTHORIZATION_EVIDENCE.md), and [`docs/CAPABILITY_V2.md`](./docs/CAPABILITY_V2.md).

## Repository status

The repository includes historical reports and release notes because it has evolved through multiple weekly iterations. For funding review, start with:

1. `README.md`;
2. `FUNDING.md`;
3. `HOW_TO_VERIFY.md`;
4. `docs/FUNDING_ACCEPTANCE_MATRIX.md`;
5. `docs/REFERENCE_APPLICATIONS.md`;
6. `evidence/README.md`.
