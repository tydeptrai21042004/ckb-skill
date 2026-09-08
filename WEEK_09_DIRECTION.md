# SkillPass Week 9 Direction

## Goal

Week 9 focuses SkillPass on **provider-issued portable service rights on CKB**.

> A provider issues a transferable service right directly to a recipient as a CKB Cell. The current live Cell owner is the entitlement holder. Fiber/x402 is an independent per-use settlement condition and cannot replace entitlement ownership.

The source of truth for ownership is the live CKB Cell, not a provider-side ownership table.

---

## Security Invariant Added for Week 9

A Cell is not trusted merely because it uses the SkillPass Type Script and the correct `service_id`.
The protected service must also pin the provider that is allowed to issue rights for that service:

```text
ALLOW_ENTITLEMENT =
    correct SkillPass deployment
    && correct Capability identity/data
    && correct service_id
    && trusted issuer_id
    && transferable flag present
    && not expired
    && requester controls current live Cell lock
```

The trusted provider is configured with:

```text
CAPABILITY_TRUSTED_ISSUER_ID=0x...
```

This prevents a user from self-issuing a Capability for `paper-analyzer-v1` and presenting it as a provider-issued right.

---

## Week 9 Plan

### 1. Provider -> Alice -> Bob Testnet Lifecycle

1. Provider wallet funds and signs issuance.
2. The Capability output is created **directly under Alice's lock**.
3. Alice authenticates and uses the protected service.
4. Alice transfers the exact Capability Cell to Bob.
5. After confirmation:
   - the consumed Alice out point is rejected;
   - Alice is rejected against Bob's successor Cell;
   - Bob is accepted as the current owner.

Invariant:

```text
current service-right owner = current live Capability Cell lock owner
```

### 2. Keep Payment Separate from Entitlement

Authorization ordering is intentionally:

```text
wallet challenge/signature
-> live CKB entitlement verification
-> Fiber/x402 quote/payment verification (when required)
-> protected service execution
```

Required proof:

```text
Alice paid successfully
+ Bob currently owns the Capability Cell
= ACCESS DENIED
```

and:

```text
Bob owns the Capability Cell
+ valid Fiber payment
= ACCESS ALLOWED
```

Therefore:

```text
payment != entitlement
```

### 3. Keep Capability v1 Compact

The 106-byte Capability v1 data format stays unchanged:

- version;
- flags;
- service ID;
- issuer ID;
- capability ID;
- expiry.

Pricing, terms and policy metadata remain provider-side service policy metadata instead of expanding Cell data in Week 9.
The runtime exposes a policy identifier and optional policy URL/terms hash:

```text
SERVICE_POLICY_ID
SERVICE_POLICY_URL
SERVICE_TERMS_HASH
```

### 4. Improve Public Evidence

The application/API should expose enough non-secret evidence to make the lifecycle auditable:

- capability ID;
- service ID;
- provider / issuer ID;
- current owner;
- live out point;
- transfer transaction hash;
- policy identifier;
- entitlement allow/deny result;
- Fiber payment result when enabled.

### 5. Reusable Authorization Layer

Week 9 adds a reusable `packages/service-rights` policy layer with:

```text
createServicePolicy()
findCurrentOwner()
verifyServicePolicy()
verifyServiceRight()
authorizeRequest()
```

`authorizeRequest()` always verifies entitlement first. A valid payment cannot override `NOT_OWNER`, `UNTRUSTED_ISSUER`, `WRONG_SERVICE`, `EXPIRED`, or `NOT_PORTABLE`.

---

## Positioning

| Project area | Main question |
| --- | --- |
| Fiber / x402 | Has this request been paid for? |
| FiberLatch | Is this access receipt valid? |
| FiberPass / agent permissions | May this application spend the user's funds? |
| **SkillPass** | **Who currently owns the provider-issued right to use this service?** |

---

## Week 9 Success Criteria

Week 9 is successful when real CKB Testnet evidence proves:

- provider issues directly to Alice;
- the service accepts Alice while Alice is the current owner;
- Alice transfers the same right to Bob;
- the old Alice out point is consumed;
- Alice cannot use Bob's successor Cell;
- successful payment cannot restore Alice's entitlement;
- Bob can use the service as current owner;
- Fiber remains independent from entitlement verification;
- no provider ownership database update is required for Alice -> Bob transfer;
- `npm test` remains fully green.

---

## Longer-Term Direction

> **SkillPass — Portable Service Rights on CKB**

**Own the service right. Transfer it without the provider. Pay for usage over Fiber.**
