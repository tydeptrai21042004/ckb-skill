# SkillPass technical hardening v1.7

This revision keeps the Week 9 product/UI flow but hardens the authorization and execution path.

## Security invariants

- Live CKB Cell ownership remains the entitlement source of truth.
- Capability v2 subject binding is resolved and verified fail-closed when present.
- Wallet challenges use one canonical `SkillPass Authorization Intent v1` serializer.
- Idempotent actions bind provider, service, policy, capability outpoint, operation ID and request hash.
- Paid execution is represented by a durable monotonic state machine from `AUTHORIZED` to `DELIVERED`.
- Fiber payment and authorization stay separate; production facilitator mode must be `fnn`.
- Configured remote providers receive a short-lived Ed25519 authorization assertion.
- Provider manifests are Ed25519 signed in public production.
- DNS is resolved and pinned before protected upstream and subject-resolver requests; private/reserved answers fail closed.
- Delegation accounting binds each grant ID to a signed-grant fingerprint.
- Authorization evidence records request/capability/policy/payment/chain hashes without storing the protected request body.

## New production secrets

`deploy-production.sh init` generates:

- `.secrets/provider_manifest_ed25519.pem`
- `.secrets/gateway_signing_ed25519.pem`

They are mounted by `deploy/compose.production.yaml` and never belong in Git.

## Capability v2 subject resolvers

Configure `SKILLPASS_SUBJECT_RESOLVERS_JSON` as an object keyed by numeric subject type. In public production, every resolver host must also appear in `SKILLPASS_SUBJECT_RESOLVER_ALLOWED_HOSTS`. A resolver response must explicitly return `id`, `lockHash`, and `live: true`.

## Finality

`SKILLPASS_MIN_CAPABILITY_CONFIRMATIONS` defaults to `0`. Raising it makes protected authorization fail closed if CKB inclusion metadata is unavailable or below the threshold. Decisions and capability-status proofs include chain-tip/finality evidence when available.

## Dependency reproducibility

All declared external dependencies remain exact-version pinned and `dependency-versions.lock.json` is verified by `npm run verify:dependency-lock`. A registry-resolved npm `package-lock.json` still needs to be generated in an environment with npm registry access before a high-risk production launch so transitive versions are fully frozen.
