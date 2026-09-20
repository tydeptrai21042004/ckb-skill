# SkillPass / SkillPass Care boundary

SkillPass Care is intentionally **more than a UI demo**, but it is not a second implementation of portable ownership.

The funding architecture separates two different state machines.

## 1. SkillPass portable-ownership state

SkillPass answers:

> Who currently controls this portable service right, and can an independent provider verify that fact from fresh CKB state?

The authoritative owner is the lock of the current live Capability Cell. A transfer consumes the old Cell and creates the successor for the new holder while preserving the immutable Capability identity/policy commitments.

SkillPass owns:

- Capability V1/V2 encoding;
- Type Script identity and transfer invariant;
- live outpoint/current-owner resolution;
- issuer/service/policy checks;
- owner/delegation authorization;
- provider manifest and signed authorization evidence;
- optional Fiber/x402 settlement after entitlement succeeds.

## 2. Care coverage/service state

SkillPass Care answers a different question:

> What product coverage is still available and what service has already happened?

Care is expected to own mutable product-domain state such as:

- product metadata and product commitment;
- coverage plan/version;
- initial and remaining service quota;
- service-event history;
- issuer suspension/revocation state;
- provider-network membership and service-type rules;
- repair notes or other private operational records.

This state does **not** need to be encoded as mutable fields in the SkillPass ownership Cell.

## 3. Capability V2 mapping

A reference mapping is:

| Capability V2 | SkillPass Care |
|---|---|
| `capabilityId` | portable coverage/right identity |
| `issuerId` | coverage issuer/refurbisher |
| `serviceId` | Care service program/bundle |
| `subjectId` | privacy-preserving product commitment |
| `subjectType` | device/custom product class |
| `policyHash` | commitment to canonical Care plan/version |
| `expiry` | maximum entitlement expiry |
| `FLAG_TRANSFERABLE` | coverage can move to a new holder |
| live Cell lock | current service-right holder |

## 4. Two independent transitions

Ownership transfer changes SkillPass state while preserving Care coverage:

```text
SkillPass: Alice -> Bob
Care:      2 remaining visits -> 2 remaining visits
```

Service consumption changes Care state while preserving ownership:

```text
SkillPass: Bob -> Bob
Care:      2 remaining visits -> 1 remaining visit
```

This distinction is important. It lets Care remain a useful vertical product without forcing generic repair/warranty accounting into the base SkillPass protocol.

## 5. Cross-layer race rule

A Care provider must not commit a service event from stale ownership evidence. Before committing a quota-consuming service event, the provider/application should re-check that the referenced Capability outpoint is still live (or use an equivalent atomic freshness guard). If the Cell has already been consumed by a transfer, the service request must be re-authorized against the successor state.

This rule is a high-value integration test for the funding pilot:

```text
Provider authorizes Alice
Alice transfers right to Bob
Provider attempts to commit Alice service
=> reject as stale ownership state
```

## 6. Why this boundary matters

It gives the proposal two credible deliverables rather than two overlapping protocols:

- **SkillPass** demonstrates a reusable CKB-native portable-right primitive across the generic Model API / Private Data API / Compute API bundle.
- **SkillPass Care** demonstrates a richer product lifecycle: coverage continuity, quota/service history, issuer controls, resale transfer and cross-provider service.
