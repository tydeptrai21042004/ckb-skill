# SkillPass Market Validation Playbook

This document prevents the project from confusing **technical novelty** with **market validation**.

## Product thesis

SkillPass should be tested as:

> **portable entitlement infrastructure for AI agents, digital assets, and multi-provider services on CKB**

not as a generic replacement for API keys, OAuth, x402, or ordinary SaaS subscriptions.

The strongest question is:

> Can two or more independent providers rely on the same live CKB-owned entitlement so ownership transfer changes authorization without synchronizing provider entitlement databases?

## Best-fit customer hypotheses

Prioritize interviews/pilots in this order:

1. CKB-native AI agents or digital assets that are sold/transferred together with service rights.
2. Independent service providers that want to honor the same entitlement without sharing a customer database.
3. Model/data/API bundles where the license itself needs portable ownership and auditable delegation.
4. CKB games, DOB/device assets, or memberships whose associated service rights should follow asset ownership.
5. Agent operators that need temporary, scoped, budget-limited authority without giving agents owner private keys.

Do **not** begin by targeting ordinary monthly SaaS subscriptions unless the provider explicitly wants portability.

## Pilot architecture

Use at least two independent provider identities:

```text
Provider A issuer ---> Search/API service A --\
                                          \
                                           > CKB Capability ownership
                                          /
Provider B issuer ---> Model/data service B --

Alice owns pass -> delegates agent -> uses services
Alice transfers pass to Bob
old Alice/agent access fails
Bob access succeeds
```

The important proof is not that all services run behind one SkillPass process. The important proof is that **issuer/policy decisions can be independent per service while the same CKB ownership model coordinates entitlement**.

## Minimum useful pilot

A credible first pilot should collect:

- 2 independent service providers or provider identities;
- 5-10 unrelated users (not project contributors);
- 100+ protected service calls;
- at least 10 owner-to-owner Capability transfers;
- at least 10 agent delegations;
- at least 3 transfer events that invalidate an existing agent grant;
- at least one license-mode provider revocation and restoration drill;
- authorization latency p50/p95;
- CKB RPC lookup latency p50/p95;
- payment overhead when Fiber/x402 is enabled;
- provider integration time;
- user completion/failure rate for issue, use, delegate, transfer.

## Market-pain questions

Ask providers before showing the architecture:

1. How do you represent service entitlement today?
2. Does entitlement ever need to move between owners, organizations, agents, or assets?
3. If another provider must honor the same entitlement, how do you synchronize state today?
4. What happens when the owner changes?
5. What happens to previously delegated API credentials after ownership changes?
6. Do you need provider-side revocation for abuse/compliance?
7. Would you accept a public-chain lookup in the authorization path? What latency/SLA is acceptable?
8. What would make this better than a signed receipt or normal database row for you?

A provider saying "blockchain is interesting" is **not validation**. A stronger signal is: "we currently maintain/synchronize this entitlement state and would integrate if SkillPass removes that work or enables a product we cannot otherwise offer."

## Success gates

### Gate A — problem evidence

Proceed only if at least 3 independent providers report a concrete portability/delegation/coordination problem.

### Gate B — integration evidence

At least 2 external providers configure their own service/issuer policy and successfully protect a real endpoint.

### Gate C — behavior evidence

Unrelated users actually transfer/delegate rights for a reason other than demonstrating the feature.

### Gate D — willingness-to-pay / strategic value

At least one provider is willing to pay, sponsor infrastructure, commit engineering time, or make the integration part of a real product roadmap.

## Kill / pivot criteria

Consider narrowing or pivoting if:

- providers consistently prefer conventional non-transferable account licenses;
- no external service needs cross-provider entitlement coordination;
- signed receipts/Biscuit/OAuth solve the same workflow with materially less complexity;
- CKB lookup latency/reliability is unacceptable for the target service;
- users do not value transferability enough to tolerate wallet/chain UX.

In that case, retain the strongest reusable components: live CKB ownership verification, scoped delegation, evidence receipts, and payment adapters.

## Evidence to publish

For grant/research credibility, publish a small reproducible dataset rather than only screenshots:

```text
pilot/results.csv
pilot/provider-notes-anonymized.md
pilot/latency-summary.json
pilot/transfer-invalidation-evidence/
pilot/revocation-drill-evidence/
```

Do not claim product-market fit from test counts. Automated tests establish software correctness; external repeated use establishes market evidence.
