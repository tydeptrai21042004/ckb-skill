# @skillpass/provider-conformance

A dependency-free conformance harness for independently operated SkillPass providers.

It does **not** replace provider-side CKB verification. Instead, an integrator supplies an `authorize()` callback backed by its own RPC/indexer and policy. The harness verifies the observable ownership lifecycle:

```text
before transfer: Alice ALLOW, Bob DENY
after transfer:  Alice DENY,  Bob ALLOW
```

This is intentionally small so an external provider can run the same acceptance test without sharing SkillPass server state or an entitlement-owner database.

```js
import {
  runPortableOwnershipConformance,
  assertPortableOwnershipConformance,
} from "@skillpass/provider-conformance";

const report = await runPortableOwnershipConformance({
  aliceLockHash,
  bobLockHash,
  metadata: { providerId: "repair-provider-b" },
  authorize: ({ phase, requesterLockHash }) =>
    myProvider.authorize({ phase, requesterLockHash }),
});

assertPortableOwnershipConformance(report);
```

For live evidence, store the resulting report together with the provider manifest fingerprint, CKB deployment metadata, source commit and the issue/transfer transaction references.
