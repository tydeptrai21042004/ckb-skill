# Experimental x402 v2 binding for SkillPass + Fiber

Status: **prototype / not claimed as an upstream-registered x402 mechanism**.

Fiber has its own x402 facilitator design and draft implementation work. This package therefore exists to make SkillPass's **combined payment + portable-capability** experiments deterministic and testable; it is not claimed as a novel replacement for upstream Fiber x402 work.

## Transport

The resource-server side follows the x402 v2 HTTP pattern:

- server -> client: HTTP `402` plus `PAYMENT-REQUIRED: base64(JSON)`;
- client -> server: `PAYMENT-SIGNATURE: base64(JSON)`;
- server -> client: `PAYMENT-RESPONSE: base64(JSON)`.

## Experimental requirement

```json
{
  "scheme": "exact",
  "network": "ckb:fiber-testnet",
  "amount": "100000",
  "asset": "CKB",
  "payTo": "<provider>",
  "maxTimeoutSeconds": 60,
  "extra": {
    "assetTransferMethod": "fiber-invoice",
    "paymentFlow": "authorization",
    "invoice": "<Fiber invoice>",
    "paymentHash": "0x...",
    "requestBinding": "sha256:..."
  }
}
```

`ckb:fiber-*` is a local experimental network identifier. Do not advertise it as standardized without upstream registration/agreement.

## Verification model

The current receiver-side FNN mode:

1. creates a Fiber invoice with `new_invoice`;
2. records its payment hash in a request-bound quote;
3. `/verify` reads receiver-side payment/invoice state;
4. the service independently verifies current SkillPass capability ownership;
5. `/settle` consumes the payment hash in a local replay store to prevent credential reuse.

The official Fiber x402 work also explores successful-payment **preimage proof** support. A future compatibility step should prefer the stable upstream interface when it is finalized rather than forking protocol behavior indefinitely.

## Core invariant

```text
paid && NOT current capability owner  => DENY
current capability owner && unpaid    => DENY
paid && current capability owner      => ALLOW
```

## Security boundary

- Fiber payment does not prove SkillPass ownership.
- SkillPass ownership does not prove payment.
- mock payment endpoints are local-test only.
- file-backed replay state is single-process only.
- real FNN RPC requires least-privilege authentication and network isolation.
- service delivery vs payment-consumption persistence needs production idempotency/crash recovery.

## Upstream references

- https://github.com/nervosnetwork/fiber/issues/1255
- https://github.com/nervosnetwork/fiber/pull/1301
- https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md
