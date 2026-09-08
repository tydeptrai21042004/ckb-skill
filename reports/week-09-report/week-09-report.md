# SkillPass Week 9 Report — Proving Transferable Service Entitlements on CKB Testnet

## Result Summary

Week 9 moves SkillPass from generic gated access toward **provider-issued portable service rights on CKB**.

Target result:

> A provider issues a service right directly to Alice. Alice can use it, transfers the same Cell to Bob, then immediately loses entitlement while Bob gains it. Fiber payment remains an independent per-use condition and cannot substitute for current Cell ownership.

## Security Improvement

The service now pins a trusted provider issuer. A Capability with the correct service ID is rejected if its `issuer_id` is not configured as the trusted provider.

## Testnet Evidence

Fill these after the real Testnet run.

| Evidence | Value |
| --- | --- |
| Capability deployment code hash | TODO |
| Trusted provider issuer ID | TODO |
| Service ID | TODO |
| Provider -> Alice issuance tx | TODO |
| Capability ID | TODO |
| Alice initial out point | TODO |
| Alice access result | TODO |
| Alice -> Bob transfer tx | TODO |
| Bob successor out point | TODO |
| Alice post-transfer denial | TODO |
| Alice paid post-transfer denial | TODO |
| Bob access result | TODO |
| Bob Fiber payment evidence | TODO |

## Automated Verification

- JavaScript/security suite: `npm test`
- CKB contract suite: `npm run verify:contract`

## Main Invariant

```text
current service-right owner = current live Capability Cell lock owner
payment != entitlement
```
