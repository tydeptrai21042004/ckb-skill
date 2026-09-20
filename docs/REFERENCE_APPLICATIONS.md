# Reference Applications

## SkillPass Care

SkillPass Care is the first reference application for SkillPass. It demonstrates portable service coverage for second-hand/refurbished products.

```text
SkillPass protocol                    SkillPass Care application
-----------------                    --------------------------
Capability V2               ->       product-linked coverage view
live Cell owner             ->       current eligible holder
transfer invariant          ->       Alice -> Bob sale workflow
provider verifier           ->       repair/service decision
signed authorization        ->       Care service-event evidence
```

### Integration rule

SkillPass Care must not redefine the transferable-right protocol. For the funding pilot:

- product commitment maps to Capability V2 `subjectId`;
- Care policy maps to `policyHash`;
- current holder always comes from the live Capability Cell lock;
- transfer preserves canonical Capability data/type identity and changes the owner lock;
- Care service history stays separate from ownership state.

### Compatibility contract

The Care repository contains `skillpass.protocol.json` and a dependency-free compatibility checker that can be run against this repository. The expected canonical packages in the current snapshot are:

- `@skillpass/capability-codec` 0.7.0;
- `@skillpass/service-rights` 1.0.0;
- `@skillpass/provider-verifier` 1.0.0;
- `@skillpass/ckb-client` 1.0.0.

A final funding release should tag the protocol and pin the Care application to that exact release/commit.
