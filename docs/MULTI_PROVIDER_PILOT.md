# Multi-provider shared-entitlement pilot

This is the strongest v1.3 demonstration because it makes the CKB-specific value measurable: **one live Capability entitlement can be accepted by several independently operated services without synchronizing entitlement databases**.

## Architecture

```text
                 CKB Capability Cell
             entitlement = BUNDLE_ID
                       |
          +------------+------------+
          |                         |
   Provider A service        Provider B service
   Model API                 Private Data API
   own policy/payment        own policy/payment
          |                         |
          +-- both explicitly trust the bundle issuer --+
```

A shared entitlement does **not** mean that providers share a database or admin authority. Each provider still controls its own service policy, payment settings, delegation rules, and—when `rightMode=license`—its own service-local revocation records.

## Shared bundle policy example

Replace the example identifiers with real 32-byte values. Both providers deliberately trust the same bundle issuer and accept the same immutable entitlement ID.

```json
{
  "model-api-v1": {
    "trustedIssuerIds": ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "entitlementIds": ["0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
    "issuanceEntitlementId": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "bundleId": "service-bundle-v1",
    "rightMode": "owned",
    "requireTransferable": true,
    "delegationAllowed": true,
    "requireDelegatable": true,
    "policyId": "provider-a-bundle-v1"
  },
  "private-data-api-v1": {
    "trustedIssuerIds": ["0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
    "entitlementIds": ["0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"],
    "issuanceEntitlementId": "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "bundleId": "service-bundle-v1",
    "rightMode": "owned",
    "requireTransferable": true,
    "delegationAllowed": true,
    "requireDelegatable": false,
    "policyId": "provider-b-bundle-v1"
  }
}
```

Set this object as `SKILLPASS_SERVICE_POLICIES_JSON`.

## Flow to prove

1. The trusted bundle issuer creates one `TRANSFERABLE + DELEGATABLE` Capability whose immutable `serviceId` is the shared bundle entitlement ID.
2. Alice owns the live Capability and successfully invokes Model API and Private Data API. Compute API can join the same bundle as a third provider/service.
3. Alice may delegate Provider A to a bounded client such as a team tool, automation, device, or agent. Provider B may independently accept or reject delegation according to its own policy.
4. Alice transfers the Capability to Bob, consuming Alice's old outpoint.
5. Alice immediately fails against both providers because she no longer owns the live Cell.
6. Any old delegated grant bound to the consumed outpoint fails automatically.
7. Bob succeeds against both providers from the new live outpoint.
8. Neither provider updates a shared entitlement database during the ownership transition.

## Separate revocable-license drill

Also configure a third test service with:

```json
{
  "rightMode": "license",
  "requireTransferable": false,
  "delegationAllowed": false
}
```

Issue a `REVOCABLE` non-transferable Capability, then use `npm run provider:admin` to revoke and restore it. This demonstrates that SkillPass does not force ordinary SaaS providers into irreversible ownership semantics.

## Evidence to capture

- Capability ID, entitlement ID, bundle ID, issuer and flags;
- old/new CKB outpoints and owner lock hashes;
- policy ID/fingerprint for every provider;
- HTTP success/deny codes before and after transfer;
- delegation grant ID and limits;
- provider-local revocation result for the license drill;
- per-provider integration time and authorization latency;
- number of entitlement database writes avoided during transfer.

Never publish wallet private keys, admin tokens, database credentials, upstream bearer tokens, payment preimages, or full bearer-sensitive delegation credentials.
