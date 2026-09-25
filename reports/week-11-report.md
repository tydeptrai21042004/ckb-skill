# Week 11 Report — SkillPass, SkillPass Care, and CellFlow

**Builder:** Dang  
**Week:** 11  
**Date:** 25 September 2026

## 1. Summary

This week I focused on strengthening the two existing SkillPass projects and creating a new CKB developer-infrastructure project.

The main outcomes were:

- submitted **SkillPass / SkillPass Care** to the formal CKBuilder feedback process through issue **#37**;
- continued hardening the core **SkillPass** portable service-right protocol;
- improved **SkillPass Care** as the concrete second-hand/refurbished product-coverage reference application;
- created **CellFlow**, a new CKB-native durable transaction-operations and recovery layer for TypeScript applications;
- deployed and improved a production-style CellFlow operations UI;
- expanded deterministic tests and failure/recovery coverage.

---

## 2. Formal CKBuilder feedback submission

Following Neon's recommendation, I submitted the project through the formal CKBuilder feedback process:

**Issue #37:**  
https://github.com/Nervos-Community-Catalyst/CKBuilder-projects/issues/37

The issue keeps the project boundary explicit:

- **SkillPass** is the portable service-right ownership and authorization layer.
- **SkillPass Care** is a reference application for second-hand/refurbished product coverage.

The feedback request focuses on:

- Capability Cell lifecycle design;
- live-owner authorization;
- Alice → Bob transfer semantics;
- stale-owner rejection;
- independent provider verification;
- multi-provider acceptance;
- real CKB Testnet evidence;
- the boundary between SkillPass protocol state and SkillPass Care application state.

This formal review is now being used as the next validation step before any DAO funding proposal.

---

## 3. SkillPass improvements

SkillPass remains focused on **portable service rights on CKB**.

The protocol represents a service entitlement through a CKB Capability Cell, with the current controller derived from the **live Cell lock** instead of a shared entitlement-owner database.

This week I continued improving the protocol around:

- canonical Capability V1/V2 encoding;
- service-right policy and subject binding;
- independent provider verification;
- provider conformance / multi-provider acceptance;
- live CKB discovery and ownership verification;
- stale-owner rejection after transfer;
- authorization evidence and auditability;
- clearer separation between the funding-critical protocol path and optional extensions.

The target lifecycle remains:

```text
Alice owns the live Capability Cell
        |
        +--> Provider A: ALLOW
        +--> Provider B: ALLOW
        |
        | Alice transfers the live Cell
        v
Bob owns the successor Cell
        |
        +--> Alice: DENY
        +--> Bob @ Provider A: ALLOW
        +--> Bob @ Provider B: ALLOW
```

The current funding-oriented scope is intentionally narrower than the full repository and prioritizes real Testnet evidence, independently operated provider verification, and external integration validation.

**Demo:**  
https://ckb-skill.vercel.app/

---

## 4. SkillPass Care improvements

SkillPass Care continues to act as the more product-oriented reference application for **second-hand/refurbished product-service coverage**.

The application keeps ownership and mutable product/service state separate:

- **SkillPass / CKB** is authoritative for the current portable service-right owner.
- **SkillPass Care** is authoritative for product commitment, coverage plan, remaining service units, service history, provider workflow, and issuer suspension/revocation.

The reference lifecycle is:

```text
STANDARD_90D issued to Alice
3 service units
        |
        +--> Provider A verifies Alice
        +--> Alice uses one service unit
              3 -> 2

Alice transfers the SkillPass right to Bob
        |
        +--> Alice's old ownership becomes stale

After transfer
        +--> Alice: DENY
        +--> Provider B verifies Bob
        +--> Bob uses one service unit
              2 -> 1
```

This week the Care implementation was improved around:

- canonical ownership integration boundaries;
- provider-side verification;
- service-event evidence;
- request/evidence identity binding;
- idempotent retry behavior;
- PostgreSQL row locking and optimistic versioning;
- atomic event insertion;
- cross-provider service continuity;
- fail-closed behavior when a real canonical SkillPass binding is unavailable.

**Demo:**  
https://skill-pass-care-api.vercel.app/

---

## 5. New project — CellFlow

This week I also created **CellFlow**, a separate CKB-native developer-infrastructure project.

CellFlow targets a different problem from SkillPass:

> what happens after an application sends a CKB transaction but the result is ambiguous because of RPC timeout, serverless restart, delayed confirmation, or reorg?

CellFlow sits after transaction construction/signing and before final application state.

It provides:

- durable business intent persistence;
- deterministic transaction identity before broadcast;
- separated submission / chain / workflow states;
- CKB RPC reconciliation;
- ambiguous-submit recovery without blind rebroadcast;
- configurable confirmation depth;
- explicit reorg handling;
- expected Cell verification;
- current live-Cell verification;
- deterministic evidence export;
- signed webhooks;
- optimistic concurrency;
- reconciliation and webhook worker leases;
- Vercel durable workflow integration;
- a production-style operations dashboard;
- API key / webhook management;
- an interactive local-only SkillPass lifecycle example.

The current operational model is:

```text
01 Intent     -> persist business intent
02 Identity   -> determine tx hash before broadcast
03 Reconcile  -> observe canonical CKB state
04 Verify     -> verify the expected live Cell
```

CellFlow is intentionally **not** a wallet, signer, custody system, explorer, or generic blockchain indexer.

### Stability work

The current repository includes **47 deterministic tests** covering lifecycle, reorg, assertions, UI/deployment contracts, and hardening scenarios.

The UI was also upgraded with:

- database and CKB RPC health;
- operations KPIs;
- intent search/filtering;
- lifecycle status views;
- audit/detail drawer;
- expected-Cell assertion visibility;
- API-key management;
- webhook management;
- local-only guided SkillPass Alice → Bob example.

**Repository:**  
https://github.com/tydeptrai21042004/CellFlow

---

## 6. Evidence

Attached evidence screenshot:

**`week-11-evidence.png`**

It contains:

1. the deployed CellFlow V0.2 operations UI; and
2. the submitted CKBuilder feedback issue #37 for SkillPass / SkillPass Care.

---

## 7. Current project boundaries

The three projects now have clearer responsibilities:

| Project | Responsibility |
|---|---|
| **SkillPass** | Portable service-right ownership and authorization on CKB |
| **SkillPass Care** | Product-specific coverage, quota, service history, and provider workflow |
| **CellFlow** | Durable CKB transaction lifecycle, recovery, reconciliation, and evidence |

This separation is intended to prevent overlapping responsibilities:

```text
SkillPass
   = who currently controls the service right?

SkillPass Care
   = what product/service coverage remains?

CellFlow
   = what happened to the CKB transaction and expected Cell state?
```

---

## 8. Next steps

For Week 12, the priority is validation rather than adding unrelated features:

1. complete a real **CKB Testnet Alice → Bob lifecycle** for SkillPass;
2. record transaction/outpoint evidence and old-owner rejection;
3. validate independent provider verification against the same canonical ownership state;
4. connect the SkillPass Care lifecycle more directly to canonical SkillPass ownership;
5. use CellFlow to capture durable transaction/reconciliation evidence for the Testnet lifecycle;
6. collect and respond to feedback from CKBuilder issue #37 and the related forum discussion.

The goal is to move from a strong implementation/demo state toward **externally reviewable Testnet evidence and independent integration validation**.
