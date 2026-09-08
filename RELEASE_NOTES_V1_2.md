# SkillPass v1.2 — Funding-ready platform release

Date: 2026-09-08

## What changed

- Added **delegation v2** with owner-signed `maxUses` and `maxSpendAtomic` limits while preserving v1 credentials.
- Added a **multi-replica-safe PostgreSQL delegation usage ledger** with atomic use/spend accounting and idempotent paid retries.
- Added **multi-upstream protected services** through an operator-controlled service catalog.
- Hardened the generic gateway with production hostname allowlisting, HTTPS enforcement, private/loopback literal blocking, bounded inputs/responses, timeouts, disabled redirects, and server-only bearer credentials.
- Kept generic upstream operations intentionally **read/idempotent only**. Side-effecting services require an explicit idempotency/outbox contract before enablement.
- Extended the **Agent SDK** with service discovery, agent-spec discovery, owner/delegated invocation, and an x402 payment-adapter retry flow that always obtains a fresh challenge.
- Added `/.well-known/skillpass-agent.txt` as a compact LLM/agent integration guide.
- Extended machine-readable discovery/OpenAPI metadata for delegation v2, service registry and per-service payment behavior.
- Extended the web UI for delegation limits, service-aware passes, evidence export and authorization receipts.
- Preserved the existing CKB transfer lifecycle, live-owner verification, Fiber/x402 integration, payment replay protection and legacy `/api/analyze` compatibility.
- Restored and updated deployment dotfiles/templates so ZIP exports retain production configuration examples.

## Verification performed

- `npm test`: **158/158 passed**
- `npm run security:preflight`: **PASS**
- `npm run verify:production`: **15/15 passed**
- `npm run verify:deploy`: **PASS**, with the lockfile warning below
- Direct `node --check` validation completed for modified runtime modules.

## Remaining production release item

The source archive does not contain a root `package-lock.json`. Direct dependency versions are pinned, but transitive dependency resolution is therefore not fully reproducible. In a networked development environment, generate and commit the lockfile and run `npm audit` before a high-risk/mainnet production release.

## Security boundary

The generic upstream gateway is designed for read/idempotent JSON services. Do not simply switch it to arbitrary write operations. A side-effecting provider must first implement stable invocation idempotency and an outbox/reconciliation contract so payment settlement, retries and upstream effects cannot diverge.
