# SkillPass Agent Protocol v1.2

SkillPass lets an AI agent invoke a protected service without receiving ownership of the user's CKB Capability Cell and without receiving the user's private key.

## Discovery

Agents should start with:

```text
GET /.well-known/skillpass.json
GET /.well-known/skillpass-agent.txt
GET /api/services
GET /api/openapi.json
```

The machine-readable catalog contains the service slug, service ID, endpoint, input kind, provider policy fingerprint, and payment policy.

## Owner path

1. Select a service and a live Capability whose `serviceId` matches that service.
2. Hash the exact service input. JSON inputs use stable canonical JSON before SHA-256.
3. Request `/api/challenge` with the acting CKB address, Capability outpoint, request hash, service slug, and `delegationId` when applicable.
4. Sign the returned challenge with the acting wallet.
5. Call the service endpoint with the challenge, signature, outpoint, and input.
6. SkillPass consumes the one-time challenge and re-checks the Capability from live CKB state before service execution.

## Delegated agent path

An owner may export an owner-signed credential instead of transferring the Capability.

Delegation v1 binds:

- owner and delegate CKB addresses;
- service slug and service ID;
- Capability ID and exact live outpoint;
- action;
- issue and expiry time.

Delegation v2 additionally signs one or both of:

- `maxUses` — maximum authorized execution attempts;
- `maxSpendAtomic` — maximum total Fiber atomic-unit spend.

Production deployments store v2 usage in PostgreSQL. The counter update is serialized per grant, and a retry using the same settled payment hash is idempotent: it does not consume quota twice.

A transfer consumes the outpoint to which the grant was bound. The old delegated credential therefore fails automatically on the next live-chain verification.

## Fiber/x402 paid retry

When payment is enabled, authorization happens before invoice creation:

```text
fresh wallet intent proof
  -> live CKB entitlement
  -> delegation signature/scope
  -> HTTP 402 + Fiber invoice
  -> payment
  -> FRESH wallet challenge
  -> live entitlement/delegation re-check
  -> payment verification
  -> delegation budget consumption
  -> service execution
  -> settlement + delivery receipt
```

The Agent SDK exposes `invokeSkillPassWithPayment()`. A caller supplies a payment adapter implementing `createPaymentSignature()`. The SDK deliberately obtains a new one-time wallet challenge before the paid retry.

## Security notes

- Never give SkillPass or a delegated agent the owner's private key.
- Treat exported delegation credentials as bearer-sensitive authorization material until expiry or Capability transfer.
- A v2 spend limit is an application authorization limit. It does not replace wallet-level or Fiber-level payment controls.
- The generic HTTP gateway is intentionally limited to read/query semantics. Side-effecting upstreams require a separate idempotency/outbox contract before they should be enabled.
