# SkillPass Week 9 Direction

## Goal

For Week 9, I will focus SkillPass on **portable service rights on CKB** rather than generic gated access.

The key idea is:

> A service provider issues a transferable service right as a CKB Cell.  
> The current Cell owner can use the service, while Fiber can handle per-use payment separately.

This keeps SkillPass distinct from payment-access tools such as FiberLatch or payment-session tools such as FiberPass.

---

## Core Question

SkillPass should answer:

> **Who currently owns the provider-issued right to use this service?**

The ownership source of truth should be the live CKB Cell, not a provider-side entitlement database.

---

## Week 9 Plan

### 1. Real Alice → Bob Testnet Transfer

Create and record a real CKB Testnet capability flow:

1. Provider issues a SkillPass service-right Cell to Alice.
2. Alice can access the protected service.
3. Alice transfers the same service right to Bob.
4. After confirmation:
   - Alice must be rejected.
   - Bob must be accepted.

The important invariant is:

```text
current service-right owner = current live Cell lock owner
```

### 2. Separate Payment from Entitlement

Demonstrate that payment alone does not grant the service right.

Expected test:

```text
Alice pays successfully
+ Alice no longer owns the Capability Cell
= ACCESS DENIED
```

For Bob:

```text
Bob owns the Capability Cell
+ valid Fiber payment
= ACCESS ALLOWED
```

This demonstrates:

```text
payment != entitlement
```

### 3. Strengthen the Portable Service-Right Model

Keep the existing Capability Cell format where possible and define a clearer service policy around it, including:

- service identifier;
- provider / issuer;
- capability identifier;
- expiry;
- transferability;
- pricing/payment policy;
- service terms or policy hash.

The Capability Cell should remain small and reference the service policy rather than storing unnecessary service metadata directly.

### 4. Improve Evidence in the Public Demo

The deployed application should clearly show:

- capability ID;
- current owner;
- service ID;
- issuing provider;
- transfer transaction;
- entitlement status;
- Fiber payment status;
- allow / deny result.

The Week 9 report should include real Testnet transaction evidence for the Alice → Bob lifecycle.

### 5. Start Making SkillPass Reusable

Begin separating the authorization logic from the demo application so another service can eventually integrate SkillPass.

Initial reusable functions may include:

```text
findCurrentOwner()
verifyServiceRight()
verifyServicePolicy()
authorizeRequest()
```

The longer-term goal is to make SkillPass a reusable **portable service-right primitive**, not only one application.

---

## Positioning

SkillPass should not be positioned as another token-gated page or Fiber payment gateway.

The intended distinction is:

| Project area | Main question |
| --- | --- |
| Fiber / x402 | Has this request been paid for? |
| FiberLatch | Is this access receipt valid? |
| FiberPass / agent permissions | May this application spend the user's funds? |
| **SkillPass** | **Who currently owns the provider-issued right to use this service?** |

---

## Week 9 Success Criteria

Week 9 is successful if the public Testnet demo proves all of the following:

- Alice initially owns and can use the service right.
- Alice transfers the same right to Bob on CKB Testnet.
- Alice cannot use the service after transfer.
- Alice cannot regain access simply by paying.
- Bob can use the service after becoming the current Cell owner.
- Fiber payment remains separate from entitlement verification.
- The service provider does not need to manually change an ownership record in its own database.

---

## Longer-Term Direction

The longer-term direction is:

> **SkillPass — Portable Service Rights on CKB**

A provider can issue a machine-readable service entitlement as a transferable Cell. Ownership can move independently on CKB, while the provider only verifies the current live owner when a service request is made. Fiber can be used independently for usage-based settlement.

Short version:

> **Own the service right. Transfer it without the provider. Pay for usage over Fiber.**
