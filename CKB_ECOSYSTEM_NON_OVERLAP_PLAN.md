# CKB Ecosystem Architecture and Non-Overlap Plan

## 1. Goal

The ecosystem should not look like four projects solving the same "CKB state" problem.

The clean model is:

```text
Application state layer
        |
        +--> SkillPass Care
        |
        v
Portable ownership layer
        |
        +--> SkillPass
        |
        v
Transaction operations layer
        |
        +--> CellFlow
        |
        v
CKB
```

And separately:

```text
Operator A                     Operator B
    |                              |
    +---------- EventMesh ----------+
                   |
                 Fiber
                   |
          optional CKB checkpoint
                   |
                CellFlow
                   |
                  CKB
```

Each repository should own a different failure domain.

---

## 2. One Question Per Repository

### SkillPass
> **Who currently owns this transferable service right?**

### SkillPass Care
> **What service coverage, quota, and history remain for the current right?**

### CellFlow
> **What actually happened to this CKB transaction, and is application finalization safe?**

### EventMesh
> **What exact application state did two independent operators both agree to?**

These four questions are different and should remain different.

---

## 3. Recommended CKB Ecosystem Positioning

### SkillPass
Category:
**CKB-native portable service entitlement protocol**

Core primitive:
**Capability Cell**

Source of truth:
**canonical live Cell + lock owner**

Primary integration audience:
- product warranty providers;
- service providers;
- membership/service-right applications;
- second-hand goods applications.

### SkillPass Care
Category:
**reference application**

Core primitive:
**coverage state linked to SkillPass entitlement identity**

Source of truth:
- ownership -> SkillPass / CKB;
- quota/history -> Care database.

Primary audience:
- reviewers evaluating a concrete SkillPass use case;
- service providers;
- refurbished-device / after-sales service pilots.

### CellFlow
Category:
**CKB transaction operations infrastructure**

Core primitive:
**durable business intent + transaction attempts + canonical chain reconciliation**

Source of truth:
**CKB canonical transaction / Cell state plus durable operational evidence**

Primary audience:
- CKB application developers;
- stateful Cell applications;
- apps exposed to contention/reorg/RPC uncertainty.

### EventMesh
Category:
**bilateral application reconciliation protocol**

Core primitive:
**dual-signed, hash-linked application transcript**

Source of truth:
**two operators signing the same final commitment**

Primary audience:
- Fiber-enabled services;
- cross-operator applications;
- application protocols where payment success does not fully determine business settlement.

---

## 4. What Each Project Must Never Become

| Project | Must not become |
|---|---|
| SkillPass | payment protocol, transaction recovery engine, Care database, DID system |
| SkillPass Care | owner registry, Capability transaction protocol, chain recovery service |
| CellFlow | wallet, entitlement system, business database, bilateral agreement protocol |
| EventMesh | Fiber replacement, CKB transaction orchestrator, entitlement protocol, generic message bus |

This table should be reflected in each README.

---

## 5. Recommended Flagship Use Cases

Use different flagship scenarios to prevent conceptual overlap.

### SkillPass — transferable service entitlement
**Second-hand product warranty/service right**

```text
Alice owns service right
        |
Provider A verifies Alice
        |
Alice transfers Capability Cell to Bob
        |
Alice denied
Bob allowed
```

### SkillPass Care — continuity of application state
**Refurbished laptop coverage continuity**

```text
Alice: 3 service units
        |
Provider A diagnostic
3 -> 2
        |
SkillPass transfer Alice -> Bob
        |
Alice denied
Bob allowed
        |
Provider B repair
2 -> 1
```

### CellFlow — transaction uncertainty
**Contended state Cell / ambiguous submission**

```text
intent
  |
tx attempt A
  |
timeout / conflict / replacement
  |
reconcile
  |
possibly rebuild as attempt B
  |
commit
  |
expected Cell verified
```

### EventMesh — bilateral service agreement
**Fiber-paid remote service result**

```text
request
  |
accept
  |
Fiber payment
  |
receiver verification
  |
result commitment
  |
delivery
  |
dual-signed close
```

Do not reuse the same Alice/Bob SkillPass transfer story as the main demo for all repositories.

---

## 6. Dependency Direction

Dependencies should be one-way.

```text
SkillPass Care
    |
    +----> SkillPass
```

Optional:

```text
SkillPass application
    |
    +----> CellFlow
```

Optional:

```text
EventMesh
    |
    +----> Fiber PaymentVerifier
    |
    +----> CellFlow AnchorAdapter
```

Never create these dependencies:

```text
SkillPass -> Care
CellFlow -> SkillPass
CellFlow -> EventMesh
SkillPass -> EventMesh
```

This avoids circular product architecture.

---

## 7. Canonical Cross-Repository Interfaces

### A. SkillPass -> applications

Create a small canonical provider-facing contract:

```text
resolve
verify
checkLiveStateRef
health
```

Example:

```json
{
  "authorized": true,
  "capabilityId": "...",
  "currentOwner": "...",
  "stateRef": {
    "txHash": "...",
    "index": "..."
  },
  "deploymentId": "...",
  "confirmations": 12
}
```

SkillPass Care should consume this contract rather than SkillPass internals.

---

### B. Application -> CellFlow

CellFlow receives generic CKB transaction information:

```json
{
  "intentId": "care-transfer-42",
  "signedTransaction": {},
  "expectedOutputs": [],
  "inputRoles": []
}
```

It should not need to know:
- what SkillPass is;
- why the transaction exists;
- what warranty means.

---

### C. EventMesh -> Fiber

Narrow interface:

```ts
interface PaymentVerifier {
  verify(reference, expected): Promise<PaymentEvidence>;
}
```

---

### D. EventMesh -> CKB

Narrow interface:

```ts
interface CommitmentAnchor {
  submit(commitment): Promise<AnchorReference>;
  getStatus(reference): Promise<AnchorStatus>;
}
```

Recommended implementation:
`CellFlowAnchor`.

---

## 8. CKB-Specific Value Proposition of Each Project

### SkillPass uses CKB because
- Cell ownership maps naturally to transferable service-right ownership;
- the live Cell gives a canonical current-owner primitive;
- providers can independently resolve the same ownership state.

### Care uses CKB indirectly because
- ownership should not live in a shared Care owner table;
- Care can preserve mutable business state while ownership changes independently.

### CellFlow exists because
- CKB apps can have stateful inputs;
- transaction contention matters;
- an RPC timeout does not prove transaction failure;
- canonical live-Cell verification is often the real application settlement boundary.

### EventMesh uses CKB only where useful
- CKB is not the event bus;
- CKB is not required for every bilateral event;
- a compact final commitment can be checkpointed for durable public evidence.

This is a clean use of CKB rather than writing every piece of application state on-chain.

---

## 9. Ecosystem Integration Scenario

A single ecosystem demo can exist, but it should be secondary.

### Scenario

Alice owns a refurbished device and its service entitlement.

#### Step 1 — SkillPass
A Capability Cell identifies Alice as the current service-right owner.

#### Step 2 — SkillPass Care
Care records:

```text
Device: refurbished laptop
Plan: Premium Care
Remaining units: 3
History: empty
```

#### Step 3 — Service
Provider A verifies Alice through SkillPass.

Care changes:

```text
3 -> 2 units
```

#### Step 4 — Transfer
Alice sells the product to Bob.

The application constructs a SkillPass transfer transaction.

#### Step 5 — CellFlow
CellFlow receives the signed CKB transaction.

It:
- persists the business intent;
- persists deterministic transaction identity;
- handles timeout/conflict/replacement;
- observes canonical commit;
- verifies the Bob Capability Cell.

#### Step 6 — SkillPass
After canonical transfer:

```text
Alice -> DENY
Bob -> ALLOW
```

#### Step 7 — Care
Care keeps:

```text
remaining units: 2
Provider A history
```

Bob later uses Provider B:

```text
2 -> 1
```

#### Step 8 — Separate paid remote service
Bob purchases an independent remote diagnostic service.

Fiber moves payment.

EventMesh records:
- exact request;
- receiver-verified payment evidence;
- result commitment;
- delivery;
- dual-signed final state.

Optionally the final EventMesh commitment is anchored through CellFlow.

This ecosystem demo proves interoperability without collapsing responsibilities.

---

## 10. Do Not Use the Mega-Flow as Every Repo's Main Demo

The integrated scenario belongs in:

```text
docs/ecosystem-integration.md
```

Each repository should still make sense on its own.

### Homepage responsibilities

#### SkillPass
> Transfer a service right without maintaining a shared owner database.

#### SkillPass Care
> Keep service coverage and history continuous when a service right changes owner.

#### CellFlow
> Recover safely when a CKB transaction result is uncertain.

#### EventMesh
> Prove exactly what two independent services agreed happened.

---

## 11. README Template for All Repositories

Every README should start with:

### 1. What this project solves
One paragraph.

### 2. What it does not solve
Explicit exclusions.

### 3. Core invariant
One sentence.

### 4. Primary use case
One concrete scenario.

### 5. Architecture boundary
Show upstream/downstream dependencies.

### 6. Current validation status
Separate:
- implemented;
- simulated;
- Testnet-proven;
- production-ready.

### 7. Evidence
Machine-readable artifacts.

This shared structure will make ecosystem review much easier.

---

## 12. Validation Levels

Use the same maturity vocabulary across repos.

### Level 0 — design
Architecture/docs only.

### Level 1 — local implementation
Automated local tests.

### Level 2 — simulated integration
Controlled demo, mocked external systems.

### Level 3 — retained Testnet evidence
Real CKB/Fiber interactions with machine-readable evidence.

### Level 4 — independent reproduction
Another developer/operator reproduces the flow.

### Level 5 — production candidate
Security review, operations, backups, monitoring, external pilot.

Avoid calling a project "production ready" before Levels 4-5.

---

## 13. Evidence Standard

Every real Testnet claim should preserve:

```text
source commit
network
deployment IDs
script code hashes
transaction hashes
input/output outpoints
block numbers/hashes
confirmation depth
RPC observation timestamps
public keys
signatures
verifier output
reproduction instructions
```

Application-specific evidence may add:
- Care service events;
- CellFlow recovery decisions;
- EventMesh transcript;
- Fiber payment references.

---

## 14. Shared Naming Rules

Use consistent terms across projects.

### CKB
- transaction;
- input;
- output;
- OutPoint;
- live Cell;
- Type Script;
- lock;
- confirmation depth;
- canonical block.

### SkillPass
- Capability;
- entitlement identity;
- current holder / current owner;
- provider authorization;
- stateRef.

### Care
- coverage plan;
- remaining units;
- service event;
- service history.

### CellFlow
- business intent;
- transaction attempt;
- submission state;
- chain state;
- recovery action;
- expected Cell assertion.

### EventMesh
- operator;
- session;
- signed event;
- acknowledgement;
- transcript tip;
- final commitment;
- payment evidence;
- anchor reference.

Do not reuse one project's terms for another project's state model.

---

## 15. Repository-Level Changes

### SkillPass
Focus on:
- canonical verification API;
- real Type Script deployment;
- Alice -> Bob retained Testnet evidence;
- independent providers;
- stale owner rejection;
- deployment identity/finality.

Reduce:
- optional payment logic in the main path;
- unrelated integrations.

### SkillPass Care
Focus on:
- Care domain state;
- SkillPass canonical adapter;
- real 3 -> 2 -> transfer -> 1 lifecycle;
- asymmetric provider evidence;
- concurrency/idempotency;
- operations guidance.

Remove:
- legacy API entrypoints;
- any alternate ownership registry.

### CellFlow
Focus on:
- multi-attempt intent model;
- input-role conflict recovery;
- RBF/replacement;
- ambiguous submission;
- multi-RPC evidence;
- reorg/finality;
- expected live-Cell verification.

Keep application-specific code under `examples/`.

### EventMesh
Focus on:
- independent operators;
- bilateral transcript;
- receiver-side Fiber verification;
- dual-signed close;
- portable verifier;
- adapter-based CKB anchoring.

Move CKB recovery to CellFlow integration.

---

## 16. Priority Roadmap

### P0 — remove overlap
1. SkillPass exposes canonical provider API.
2. Care consumes only that boundary.
3. CellFlow core becomes fully application-neutral.
4. EventMesh extracts `PaymentVerifier`.
5. EventMesh extracts `CommitmentAnchor`.
6. EventMesh uses CellFlow for durable CKB anchoring where appropriate.

### P0 — real evidence
1. SkillPass real Testnet Capability deployment.
2. SkillPass Alice -> Bob transfer.
3. Provider A/B before-after verification.
4. Care 3 -> 2 -> transfer -> 1.
5. CellFlow ambiguous-submit and contention evidence.
6. EventMesh independent-operator Fiber flow.

### P1 — external reproduction
- another provider integrates SkillPass;
- another app uses CellFlow;
- EventMesh integrates an external Fiber app;
- clean-clone scripts reproduce evidence.

### P2 — broader features
Only after external validation:
- more SkillPass service-right examples;
- more Care verticals;
- more CellFlow adapters;
- EventMesh batching / more workflow templates.

---

## 17. Recommended Funding / Reviewer Story

The ecosystem story should be:

### SkillPass
A CKB-native primitive for portable service rights.

### SkillPass Care
A concrete application proving that meaningful off-chain application state can remain continuous while ownership follows CKB.

### CellFlow
Reusable infrastructure for the uncertain operational period between transaction signing/broadcast and safe application finalization.

### EventMesh
A separate bilateral coordination layer for cases where payment settlement alone does not determine the application state accepted by two independent operators.

This story is much stronger than presenting all four as general "CKB workflow" projects.

---

## 18. Final Non-Overlap Test

For every proposed feature, ask which question it answers.

### Question A
Who owns the portable right?
-> **SkillPass**

### Question B
What service/application state remains?
-> **SkillPass Care**

### Question C
What happened to the CKB transaction?
-> **CellFlow**

### Question D
What did two independent operators agree happened?
-> **EventMesh**

If a feature answers more than one question, split it into an adapter or move it to the repository that owns the primary responsibility.

That should be the long-term architecture rule for the ecosystem.
