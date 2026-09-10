# SkillPass Market Validation Playbook

This document prevents the project from confusing **technical novelty** with **market validation**.

## Product thesis

SkillPass should be tested as:

> **portable service ownership across independent providers on CKB**

not as a generic replacement for API keys, OAuth, x402, ordinary SaaS subscriptions, or an agent platform.

The strongest question is:

> Can independent providers rely on the same live CKB-owned Service Bundle so one ownership transfer changes authorization everywhere without synchronizing provider entitlement databases?

Agents, digital assets, and Capability v2 bindings remain optional extensions of that core ownership model.

## Best-fit customer hypotheses

Prioritize interviews/pilots in this order:

1. Independent model/data/compute/API providers that need to honor the same project or bundle entitlement without sharing a customer database.
2. Teams transferring a project, deployment, device, or commercial service package between owners/organizations and currently rotating accounts, API keys, billing ownership, or ACLs provider-by-provider.
3. Model/data/API bundles where a license needs portable ownership and auditable temporary delegation to developers, contractors, CI, or automation.
4. CKB games, DOB/device assets, or memberships whose associated service rights should follow asset ownership.
5. Automated clients that need temporary, scoped, budget-limited authority without receiving the owner's private key.

Do **not** begin by targeting ordinary monthly SaaS subscriptions unless the provider explicitly needs ownership portability.

## Flagship pilot architecture

Use three independent provider identities:

```text
                    live CKB Capability Cell
                         current owner
                              |
             +----------------+----------------+
             |                |                |
             v                v                v
      Model Provider     Data Provider    Compute Provider
       own policy         own policy        own policy
       own process        own process       own process

Alice owns Service Bundle -> all three accept Alice
Alice transfers Cell to Bob
old Alice/outpoint access -> rejected
Bob/new live outpoint     -> accepted by all three
provider entitlement DB ownership updates -> 0
```

The important proof is **not** that three buttons exist behind one backend. Each provider must run as an independent identity/process and derive current ownership from live CKB state. Use `deploy/compose.multi-provider-pilot.yaml` and `scripts/pilot-check.mjs` for the reference pilot.

## Minimum useful pilot

A credible first pilot should collect:

- 3 independent service-provider identities;
- at least 1 external provider or external developer integrating a real endpoint;
- 5-10 unrelated users (not project contributors), if available;
- 100+ protected service calls;
- at least 10 owner-to-owner Capability transfers;
- at least 3 transfer events that invalidate an existing bounded contractor/CI delegation;
- authorization latency p50/p95;
- CKB RPC lookup latency p50/p95;
- transfer confirmation-to-provider-convergence latency;
- provider integration time and lines of integration code;
- number of provider entitlement/account updates required per transfer;
- duplicate quota consumption/duplicate payment on retries (target: zero);
- user completion/failure rate for issue, use, delegate, and transfer.

Agent-specific delegation is optional; the core pilot must succeed without an agent narrative.

## Market-pain questions

Ask providers **before** showing the architecture:

1. How do you represent service entitlement today?
2. Have you had a project/customer/service package change owner or organization?
3. What had to change: account ownership, API keys, billing account, ACLs, secrets, or provider database rows?
4. If another provider must honor the same entitlement, how do you synchronize state today?
5. What happens to contractor/CI credentials after ownership changes?
6. Do you need provider-side revocation for abuse/compliance, or should ownership be stronger than provider revocation?
7. Would you accept a public-chain lookup/cache strategy in the authorization path? What latency/SLA is acceptable?
8. What would make this materially better than a signed receipt, OAuth token, API key, or normal database row?

Do not ask "would you use blockchain subscriptions?" as the opening question. A provider saying "blockchain is interesting" is not validation. A stronger signal is: "we currently perform this migration/synchronization work and would integrate if SkillPass removes it or enables a product we cannot offer cleanly today."

## Success gates

### Gate A — problem evidence

Proceed only if at least 3 independent providers/users report a concrete ownership-migration, delegation, or cross-provider coordination problem.

### Gate B — integration evidence

At least 2 external providers configure their own service/issuer policy and successfully protect a real endpoint. The reference three-provider pilot does not count as external validation by itself.

### Gate C — behavior evidence

Unrelated users transfer rights for a reason other than demonstrating the feature, and old owner/delegation access is reliably invalidated.

### Gate D — strategic value

At least one provider is willing to sponsor infrastructure, commit engineering time, pay, or make the integration part of a real product roadmap.

## Kill / pivot criteria

Narrow or pivot if:

- providers consistently prefer conventional non-transferable account licenses;
- ownership migration is too rare to justify a chain-backed entitlement;
- no external service needs cross-provider entitlement coordination;
- signed receipts/Biscuit/OAuth solve the same workflow with materially less complexity;
- CKB lookup latency/reliability is unacceptable for the target service;
- users do not value transferability enough to tolerate wallet/chain UX.

In that case, retain the strongest reusable components: live CKB ownership verification, scoped delegation, evidence receipts, provider-policy enforcement, and Fiber adapters.

## Evidence to publish

For grant/research credibility, publish a small reproducible dataset rather than only screenshots:

```text
pilot/results.csv
pilot/provider-notes-anonymized.md
pilot/latency-summary.json
pilot/transfer-invalidation-evidence/
pilot/retry-and-quota-evidence/
```

Do not claim product-market fit from test counts. Automated tests establish software correctness; external repeated use establishes market evidence.
