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
4. SkillPass Care as the first reference application;
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

SkillPass Care demonstrates the protocol with service coverage for a second-hand/refurbished product:

```text
product commitment
      |
SkillPass Capability V2
      |
Alice -> Bob transfer on CKB
      |
independent repair/service providers
```

Care is an application, **not a second transferable-right protocol**. See [`docs/REFERENCE_APPLICATIONS.md`](./docs/REFERENCE_APPLICATIONS.md).

## Core packages

| Package | Role |
|---|---|
| `@skillpass/capability-codec` | canonical Capability V1/V2 encoding and identity |
| `@skillpass/service-rights` | service-right policy and subject-binding rules |
| `@skillpass/provider-verifier` | independent provider verification/evidence |
| `@skillpass/ckb-client` | live CKB discovery, issuance and transfer building |
| `@skillpass/auth-protocol` | canonical request/authorization intent |

Delegation, agent SDK, service gateway, and Fiber/x402 settlement are useful extensions but are not required to validate the core funding thesis.

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
