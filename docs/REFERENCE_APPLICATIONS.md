# Reference Applications

SkillPass is deliberately application-neutral. Reference applications should prove that the same portable-right primitive can support richer vertical products without moving all product-domain state into the base protocol.

## Generic Service Bundle demo

The main SkillPass demo remains a protocol playground with three independent digital services:

```text
Service Bundle Pass
├── Provider A -> Model API
├── Provider B -> Private Data API
└── Provider C -> Compute API
```

This demonstrates protocol generality: one transferable entitlement can be recognized under independently configured provider policies.

## SkillPass Care

SkillPass Care is the flagship reference **product** for service coverage on second-hand/refurbished products.

```text
SkillPass protocol                    SkillPass Care product
-----------------                    ----------------------
Capability V2               ->       product-linked coverage identity
live Cell owner             ->       current eligible holder
transfer invariant          ->       resale / Alice -> Bob workflow
provider verifier           ->       repair-provider owner authorization
policyHash                  ->       committed Care plan/version
signed authorization        ->       Care service-event audit link
```

Care deliberately retains substantial application logic. Examples include coverage quota, service history, issuer suspension/revocation, product metadata and repair-provider workflows. These are **not** generic SkillPass protocol fields.

### Integration rule

For the funding pilot:

- product commitment maps to Capability V2 `subjectId`;
- Care plan/version commits to Capability V2 `policyHash`;
- current portable-right holder always comes from the live Capability Cell lock;
- transfer preserves canonical Capability data/type identity and changes the owner lock;
- Care may update its own coverage/service state without redefining portable ownership;
- a quota-consuming Care service must reject stale authorization if the referenced Capability Cell has already been consumed.

See [`SKILLPASS_CARE_BOUNDARY.md`](./SKILLPASS_CARE_BOUNDARY.md) for the two-state model.

### Compatibility contract

The Care repository should pin a released SkillPass protocol profile and run the provider-conformance lifecycle. The expected canonical packages in this snapshot are:

- `@skillpass/capability-codec` 0.7.0;
- `@skillpass/service-rights` 1.0.0;
- `@skillpass/provider-verifier` 1.0.0;
- `@skillpass/ckb-client` 1.0.0.

The optional `@skillpass/provider-conformance` 1.0.0 package is test tooling for providers rather than a Care runtime dependency.

A final funding release should tag the protocol and pin the Care application to the exact release/commit used for pilot evidence.
