# SkillPass v1.2 production-readiness upgrade

This revision turns the Week 9 demonstration into a stronger developer-infrastructure product while preserving the original CKB Capability lifecycle.

## Added in v1.2

### Budgeted agent delegation

Delegation v2 adds owner-signed `maxUses` and optional `maxSpendAtomic` constraints. Production usage accounting uses PostgreSQL and serializes updates per grant so concurrent replicas cannot independently overspend the same delegated budget. Payment-hash replay is treated idempotently.

### Multi-upstream service catalog

`SKILLPASS_UPSTREAM_SERVICES_JSON` can register up to 12 operator-configured read/query APIs in addition to the built-in services and the backward-compatible single gateway variables. Each service gets its own slug, 32-byte service ID, input bound, response bound, timeout, and optional per-service Fiber price.

### Gateway SSRF/config hardening

When any upstream gateway is enabled in public production:

- HTTPS is required;
- `SKILLPASS_GATEWAY_ALLOWED_HOSTS` is required;
- the configured hostname must appear in that exact allowlist;
- literal loopback, RFC1918, link-local, multicast, and unspecified targets are rejected;
- credentials embedded in the URL are rejected;
- redirects are rejected;
- response size and timeout are bounded;
- upstream bearer secrets stay in server-side environment variables and are never returned by service discovery.

### Agent-native protocol surface

New machine-readable / LLM-friendly surface:

```text
/.well-known/skillpass-agent.txt
```

The Agent SDK now supports a pluggable x402 payment adapter and automatically obtains a fresh challenge before retrying a paid request.

## Production boundary that remains intentional

The generic HTTP gateway accepts only `operationMode: "read"`. A write API needs stronger recovery semantics because payment settlement, upstream side effects, and HTTP delivery can fail independently. A production write gateway should add:

1. a client-signed operation/idempotency key;
2. durable outbox/job state;
3. upstream idempotency acknowledgement;
4. retry/reconciliation states;
5. an operator-visible dead-letter/recovery workflow.

SkillPass does not pretend a generic POST becomes safe merely because it is authenticated and paid.

## Deployment state

- Testnet CKB remains the supported chain network in this revision.
- Fiber remains testnet-only in this application profile.
- PostgreSQL is required for public multi-replica production.
- Redis remains optional on Vercel and recommended for self-hosted distributed challenges/rate limits.
- Exact direct dependency versions remain pinned in package manifests.
- A root npm lockfile should be generated and committed from a networked development environment before a high-value release. The isolated build environment used for this revision could not complete npm registry resolution, so no fabricated lockfile is included.
