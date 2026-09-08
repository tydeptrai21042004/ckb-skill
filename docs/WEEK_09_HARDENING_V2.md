# SkillPass Week 9 — Security, Feature and Performance Hardening v2

This pass keeps the Week 9 protocol goal unchanged: the live CKB Capability Cell is the source of truth for the current owner of a provider-issued portable service right. It does **not** add an entitlement database or change the 106-byte Capability v1 layout.

## New product features

- **Provider issuer rotation:** `CAPABILITY_TRUSTED_ISSUER_IDS` accepts a comma-separated allowlist while `CAPABILITY_TRUSTED_ISSUER_ID` remains the primary issuer for backward-compatible clients and provider UX.
- **Live ownership inspection:** `POST /api/capability/status` reads the current live Cell and returns the current owner lock hash, capability identity, issuer, expiry, policy and check timestamp. The web UI exposes this as **Verify live owner** for Alice/Bob evidence collection.
- **Machine-readable integration:** discovery and OpenAPI advertise the capability-status endpoint, the trusted issuer set and intent-bound wallet authentication.
- **Stable capability discovery:** active rights are preferred and results are filtered to the configured service, trusted provider set and portability policy before being shown to the user.

## Security hardening

### Intent-bound wallet signatures

The one-time wallet challenge now commits to:

- action (`analyze`);
- service ID;
- service policy ID and fingerprint;
- exact capability outpoint;
- SHA-256 of the protected request body;
- wallet address;
- nonce and expiry.

A signature captured for one capability or one paper cannot be substituted for another capability/request. The nonce is still burned before signature verification, preserving one-time replay protection.

### Provider trust and key rotation

Authorization accepts only an explicitly configured issuer allowlist. A capability with the correct Type Script and service ID but an arbitrary self-selected issuer is denied. During provider-key rotation, deploy with both old and new issuer IDs, migrate issuance, then remove the retired ID.

### Safer CKB transactions

Issuance refuses to consume an existing SkillPass Capability Cell as funding or fee capacity. Transfer now additionally rejects:

- an expired capability;
- self-transfer to the current owner;
- any *additional* SkillPass capability selected as a fee input;
- fee completion that changes the capability input, Type Script, data or intended recipient.

This reduces accidental destruction of unrelated service rights by wallet capacity selection.

### Payment remains subordinate to entitlement

The server verifies live entitlement before creating a Fiber invoice. Payment binding commits to the requester, capability outpoint, request hash, service ID, policy ID, policy fingerprint and canonical resource URL. A paid quote therefore cannot be moved to a different right, request or policy.

### HTTP/browser hardening

- Capability-status has per-subject and global rate limits.
- Local rate-limit map keys use hashes rather than raw wallet/IP subjects.
- Public production adds HSTS.
- Cross-site browser mutations and non-JSON mutation bodies remain rejected.
- Request timeout is bounded with `REQUEST_TIMEOUT_MS`.
- Production paid deployments outside Vercel require an explicit canonical `PUBLIC_BASE_URL`.

## Performance and reliability

### Fiber quote reuse

Identical unexpired paid requests reuse the persisted quote associated with the same semantic payment binding. Concurrent identical requests in one server instance are coalesced through an in-flight map, avoiding unnecessary duplicate Fiber invoices.

Persisted quote pointers survive a service restart. Expired quote pointers are removed and cannot resurrect old invoices.

> Multi-instance quote creation can still race between separate replicas before persistence wins. The quote remains safely bound, but fully eliminating duplicate upstream invoice creation across replicas would require a distributed lock/advisory-lock primitive.

### Bounded payment-state pruning

Expired payment state is no longer scanned on every request. Pruning is throttled by `PAYMENT_PRUNE_INTERVAL_MS` (default 30 seconds), reducing repeated database/state work.

### Static asset cache

The live service caches static file contents/metadata in a small bounded in-process cache and emits ETags. Fingerprinted Vite assets use immutable one-year browser caching, while the HTML shell stays `no-cache` so deployments update quickly.

**Authorization and capability-status results are deliberately not cached.** Protected service requests continue to verify the live CKB Cell.

## New / updated configuration

```dotenv
# Primary provider issuer (backward-compatible field)
CAPABILITY_TRUSTED_ISSUER_ID=0x...

# Optional rotation allowlist, comma separated
CAPABILITY_TRUSTED_ISSUER_IDS=0x...,0x...

CAPABILITY_STATUS_RATE_LIMIT_PER_MINUTE=24
GLOBAL_CAPABILITY_STATUS_RATE_LIMIT_PER_MINUTE=600
PAYMENT_PRUNE_INTERVAL_MS=30000
REQUEST_TIMEOUT_MS=30000
```

For a public paid non-Vercel deployment also set:

```dotenv
PUBLIC_BASE_URL=https://your-real-domain.example
```

## Week 9 security/evidence checks

1. Provider issues directly to Alice.
2. `Verify live owner` reports Alice's current lock hash.
3. Alice signs an intent for capability A + request A; changing either causes authentication failure.
4. Alice transfers the same Capability Cell to Bob.
5. `Verify live owner` reports Bob's lock hash from the new live Cell.
6. Alice is denied before any new Fiber invoice can authorize her.
7. A payment tied to Alice/request A cannot authorize Bob/request B or another policy.
8. Bob signs a fresh intent and, when payment is required, satisfies a separately bound Fiber payment.
9. Fake/self-issued and retired-untrusted-provider rights are denied.
10. Full JS/security/deployment verification is green before publishing transaction evidence.

## Remaining production items

- Generate and commit the repository lockfile so transitive dependencies are reproducible, then run the package-manager audit in CI.
- Run the Rust CKB contract suite in an environment with the CKB/Rust toolchain (`npm run verify:contract`).
- For multi-replica high-volume paid production, consider a distributed single-flight/advisory lock around upstream invoice creation.
- Provider issuer rotation is an operational allowlist. Removing an issuer from the allowlist intentionally makes that issuer's existing rights invalid for this service policy; plan migrations before removal.
