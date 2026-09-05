# CKB / Fiber community research and SkillPass product direction

Research snapshot: **5 September 2026**.

This note separates current upstream facts from project-specific recommendations. It is not a claim that draft Fiber/x402 proposals are final standards.

## 1. What changed upstream

### Fiber v0.9.0: production reliability is the priority

The 6 August 2026 Fiber dev log reports v0.9.0 as live and emphasizes restart recovery, on-chain TLC reconciliation, deterministic reconnect behavior, bounded peer traffic, backup/restore, security hardening, and easier installation. The same update describes ongoing hosted-LSP, tenant-isolated Trampoline, remote-signing, browser/WASM/remote-node provider work.

Source: https://github.com/nervosnetwork/fiber/discussions/1610

**SkillPass implication:** payment state must survive restarts, raw FNN RPC should stay behind a provider/facilitator boundary, and deployment/backup UX matters as much as the protocol demo.

### Fiber + x402 for agent payments is active, but still evolving

The upstream Fiber work includes a draft x402 facilitator MVP that describes Fiber as an `exact` payment backend and exposing successful payment preimages so clients can prove invoice payment.

Source: https://github.com/nervosnetwork/fiber/pull/1301

**SkillPass implication:** keep the existing trusted receiver-side invoice-status mode for compatibility, but provide an optional payment-preimage mode so the architecture is ready for stronger payer-held proof without claiming the draft is finalized.

### x402 v2 uses an authorization-style lifecycle

The x402 v2 specification describes the server-side paid-resource lifecycle around verification, resource execution, settlement, and response.

Source: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md

**SkillPass implication:** protected work should be produced successfully before the payment is consumed. The previous settle-before-analysis ordering risked charging a user and then failing in the resource handler.

### CCC remains the right browser/CKB integration layer

CCC describes itself as the CKB JS/TS one-stop SDK, covering transaction composition, signing, wallet connectors, data analysis, and AI/LLM-friendly documentation/agent skills.

Source: https://github.com/ckb-devrel/ccc

As of this research snapshot, npm lists `@ckb-ccc/connector-react` 1.1.9 as the latest release.

Source: https://www.npmjs.com/package/@ckb-ccc/connector-react?activeTab=versions

**SkillPass implication:** stay on CCC rather than adding a custom wallet abstraction. Upgrade the connector conservatively and prove it with TypeScript + production build tests.

### CKB core continues to move

CKB's August 2026 development cycle follows the v0.209.0 line and continued core maintenance/development.

Source: https://github.com/nervosnetwork/ckb/discussions/5308

**SkillPass implication:** deployment metadata must be explicit and version-independent (`codeHash`, `hashType`, dep out point); do not bake a fragile node/deployment assumption into the ownership model.

## 2. Product position that fits the ecosystem

SkillPass is strongest when it does **not** try to make Fiber replace CKB ownership or CKB replace Fiber payments:

- **CKB Cell = durable, transferable right/capability.**
- **Wallet signature = proof that the current requester controls the address.**
- **Live-cell lookup = current authorization truth.**
- **Fiber = low-friction/high-frequency payment rail.**
- **x402-like headers = HTTP payment negotiation boundary.**
- **Facilitator = isolation boundary between public service and payment-node RPC.**

This gives the project a clearer community story: a portable on-chain service entitlement can move between users, while per-use or usage-based economics can occur over Fiber without giving an AI agent or server custody of the user's CKB wallet key.

## 3. Improvements implemented from this research

### P0 — reliability and security

- persisted payment quotes across SkillPass restarts;
- persisted successful delivery receipts so a dropped HTTP response can be retried safely;
- idempotent facilitator settlement for recovery after payment consumption;
- bounded receipt retention to limit long-lived protected-result storage;
- semantic payment binding includes capability/request content so a quote cannot pay for different work;
- fixed a first-load race in the persisted replay store;
- changed paid lifecycle to verify → execute resource → settle → respond;
- made mock `/dev/pay` disabled by default outside the explicit demo profile;
- startup validation for facilitator backend/network/proof mode;
- constant-time facilitator bearer-token comparison;
- request/header timeouts and header-count limits;
- public Compose bind defaults to loopback;
- safer trusted-proxy handling and canonical `PUBLIC_BASE_URL`;
- read-only/no-new-privileges/cap-drop container hardening where applicable.

### P0 — deployment UX

- restored missing `.env.example` and `.env.testnet.example` templates;
- `./deploy.sh init-testnet` now works from a clean ZIP;
- stronger `./deploy.sh doctor` checks;
- `./deploy.sh smoke` HTTP verification;
- persistent volume for live-service payment state;
- local ZIP/folder instructions that do not require a source-host account;
- a full `DEPLOY_STEP_BY_STEP.md` runbook.

### P1 — payment-proof readiness

- default `invoice-status` proof remains compatible;
- optional `preimage` proof validates SHA-256(preimage) against the invoice payment hash and still checks receiver-side paid status;
- browser UI can accept the preimage when that deployment mode is selected.

## 4. Best next ecosystem features

These are recommendations, not implemented standards.

### A. Provider abstraction for local/remote/WASM Fiber

Fiber is moving toward a more consistent browser/WASM/remote-node provider surface. SkillPass should keep its payment logic behind a small interface so a future provider can replace manual invoice copy/paste without changing CKB capability logic.

### B. UDT/multi-asset pricing

Do not hard-code CKB forever. The requirement object already carries `asset` and `currency`; the next iteration should map a configured UDT asset identifier to Fiber invoice currency/amount and validate that mapping server-side.

### C. Delegated/session access distinct from ownership

A transferable Capability Cell represents the durable right. Short-lived agent sessions should be a separate layer: scoped service ID, expiry, spend ceiling, request count, and revocation. Do not weaken the base ownership Cell just to make agents convenient.

### D. Shared atomic state before horizontal scaling

The current JSON persistence is an appropriate simple deployment improvement, but it is single-process. Multiple SkillPass/facilitator replicas require an atomic shared datastore so the same payment cannot race across replicas.

### E. Operational observability

Add structured request IDs and metrics for challenge failures, capability failures, invoice creation, verify latency, settlement latency, replay rejection, and CKB/FNN dependency health. Do not log wallet signatures, private keys, bearer tokens, or payment preimages.

## 5. Research gap / community pitch

A useful project/research question is:

> How can a CKB Cell encode a portable service entitlement while Fiber provides per-use payment, with authorization and payment remaining recoverable, replay-safe, and non-custodial across transfers and service restarts?

The interesting gap is not another token-gated page. It is the **composition of stateful ownership and ephemeral payment**:

1. transfer must revoke the old owner immediately because the old Cell is consumed;
2. payment must be bound to the exact semantic request/capability to prevent cross-request reuse;
3. a service restart must not forget an already paid invoice;
4. a dropped response or single-process restart must not force a second payment for the same successfully settled request;
5. the service must not receive the user's wallet private key;
6. the Fiber node/provider boundary must remain replaceable as upstream browser/remote-node standards mature.

That framing is much closer to current Nervos/Fiber engineering priorities—recovery, provider UX, agent payments, and operational reliability—than a purely local mock payment demo.
