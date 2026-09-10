# Owner-signed agent delegation

SkillPass delegation allows the owner of a live Capability Cell to authorize a different CKB address to invoke one service temporarily **without transferring the Capability or sharing the owner's private key**.

## Credential scope

A v1 grant binds:

- owner CKB address;
- delegate CKB address;
- service slug and service ID;
- Capability ID;
- exact Capability outpoint;
- `invoke` action;
- issuance time and expiry;
- random 128-bit grant ID.

The owner signs the canonical grant message with the connected CKB wallet.

## Request flow

```text
Owner wallet
  -> signs delegation grant
  -> gives JSON credential to agent

Agent wallet
  -> asks /api/challenge for service + delegation_id
  -> signs one-time request intent
  -> POST /api/invoke/<service> with delegation credential

SkillPass
  -> verifies agent challenge/signature
  -> verifies owner signature on grant
  -> verifies grant scope + expiry
  -> fetches the exact live CKB Capability Cell
  -> proves the grant owner still owns that Cell
  -> optionally verifies Fiber/x402 payment
  -> invokes service
```

## Why transfer revokes the grant automatically

The grant is bound to the exact live Capability outpoint. CKB transfer consumes that Cell and creates a successor Cell. After transfer, the old outpoint is no longer live, so a credential derived from the old ownership state fails without a centralized revocation table.

## Limits

- Maximum default lifetime: 24 hours.
- v1 supports service/action/time scope, not durable call-count or spend quotas.
- A delegate still needs its own CKB-native wallet signature for each one-time challenge.
- Provider-level revocation of the durable Capability is a separate protocol decision.

## Agent SDK

`packages/agent-sdk` provides dependency-light helpers for agent integrations:

```js
import { discoverSkillPass, resolveService, invokeSkillPass } from "@skillpass/agent-sdk";

const discovery = await discoverSkillPass("https://skillpass.example");
const service = resolveService(discovery, "private-data-api-v1");

const response = await invokeSkillPass({
  baseUrl: "https://skillpass.example",
  signer: agentCkbSigner,
  outPoint: capabilityOutPoint,
  service,
  input: "paper text...",
  delegation: ownerSignedCredential,
});
```

If the service returns HTTP 402, the SDK exposes the `PAYMENT-REQUIRED` header instead of pretending payment succeeded. A Fiber wallet/payment adapter can then satisfy the requirement and retry with a fresh challenge.

## v1.2: budgeted delegation

Delegation v2 keeps the same owner/service/capability/outpoint/action/expiry binding and additionally signs one or both limits:

```json
{
  "version": 2,
  "limits": {
    "maxUses": 20,
    "maxSpendAtomic": "5000000"
  }
}
```

`maxUses` is bounded to 1..10000. `maxSpendAtomic` is an exact positive integer string in the payment asset's atomic units.

Public multi-replica production uses a PostgreSQL ledger. Usage updates are serialized per grant; retries with the same payment hash are idempotent and do not consume the grant twice. Transfer still invalidates the grant because the signed outpoint is consumed.
