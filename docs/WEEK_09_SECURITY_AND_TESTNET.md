# Week 9: Security and Testnet Evidence Guide

## 1. Configure the trusted provider

SkillPass now requires the service to know which provider may issue rights for the protected service.
Set the provider wallet **lock-script hash** (32 bytes), not an address and never a private key:

```bash
CAPABILITY_TRUSTED_ISSUER_ID=0x...
```

The provider issuer ID must equal the hash of the lock script used by the provider wallet that funds/signs issuance.

## 2. Direct provider -> Alice issuance

The browser transaction helper now takes an explicit recipient:

```ts
await buildIssueCapabilityTx({
  signer: providerSigner,
  deployment,
  recipientAddress: aliceAddress,
  serviceId,
  expiry,
  flags: FLAG_TRANSFERABLE,
});
```

The provider signer supplies the issuer-authorized input and pays capacity/fees. The Capability output lock is Alice's lock.

## 3. Record evidence

Record these values from the real Testnet lifecycle:

| Step | Evidence to record |
| --- | --- |
| Provider -> Alice issue | issuance tx hash, capability ID, output index, provider issuer ID, Alice address |
| Alice access | API result showing trusted issuer + Alice current ownership |
| Alice -> Bob transfer | transfer tx hash, old out point, successor out point |
| Alice retry | `403 CELL_NOT_LIVE` for old out point or `403 NOT_OWNER` for Bob successor |
| Alice paid retry | must still fail entitlement before a new Fiber quote is created |
| Bob access | successful entitlement result; Fiber settlement evidence if payment is enabled |

## 4. Recommended verification order

First prove the ownership lifecycle with payments disabled:

```text
PAYMENTS_REQUIRED=false
```

After Alice -> Bob behavior is stable, enable real Fiber payment and prove that settlement is an additional condition:

```text
PAYMENTS_REQUIRED=true
FIBER_BACKEND=fnn
```

Do not use `ALLOW_DEV_PAYMENT=true` for public evidence.

## 5. Tests

Run JavaScript/security tests:

```bash
npm test
```

Run the CKB contract tests on a machine with the required Rust/CKB target toolchain:

```bash
npm run verify:contract
```

The Week 9 contract suite includes a direct **provider A -> recipient B** issuance case.

## 6. Security properties

The current protected flow checks, in order:

1. request/body envelope limits;
2. one-time wallet challenge and signature;
3. live Capability Cell existence;
4. expected Capability Type Script deployment;
5. Type args / Capability data identity match;
6. expected service ID;
7. trusted provider issuer ID;
8. transferable policy;
9. expiry;
10. requester equals current live Cell owner;
11. only then, Fiber/x402 payment when enabled.

This ordering prevents unauthenticated/unentitled callers from creating payment work and prevents payment from being treated as ownership.
