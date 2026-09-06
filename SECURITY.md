# SkillPass Security Model — v1.0

## Scope

SkillPass v1.0 is designed for a public multi-user **CKB testnet** service. The production profile supports multiple application replicas with shared PostgreSQL/Redis state. This is not a claim that the Capability Type Script or Fiber integration has received an independent mainnet security audit.

## Trust boundaries

### User wallet

The user's CKB private key stays in the wallet. SkillPass receives only address, challenge signature and transaction/outpoint data needed for verification. The web/backend must never request, upload, log or persist a user's seed phrase/private key.

### CKB RPC

The live service treats the configured CKB RPC as an availability/data dependency and re-checks the live Cell when protected access is attempted. Production should use a dedicated/self-hosted RPC rather than treating a community endpoint as an SLA-backed dependency.

### Fiber/FNN

The facilitator talks to a private FNN RPC. FNN node/operator credentials are infrastructure secrets and are separate from user wallet keys. FNN RPC must not be exposed publicly just because the web service is public.

### Facilitator

The facilitator is private to the Docker/backend network and authenticated with a bearer secret. Production refuses the mock payment backend.

## Distributed production state

Production requires:

```text
STATE_BACKEND=postgres-redis
```

PostgreSQL stores durable quote/receipt/payment-consumption state. `payment_hash` is a primary key and first consumption uses `INSERT ... ON CONFLICT DO NOTHING`, which provides one winner under concurrent replicas.

Redis stores short-lived wallet challenge state and distributed IP rate-limit counters. Challenge consumption uses Redis `GETDEL`, so a nonce is removed atomically when consumed. Rate limiting uses an atomic Lua `INCR`/`PEXPIRE` operation.

The JSON record/replay stores remain only as local deterministic development fallbacks and are not used by `deploy/compose.production.yaml`.

## Authentication and authorization

A protected request requires all applicable checks:

1. a fresh wallet challenge;
2. one-time challenge consume;
3. valid CCC CKB-native wallet signature;
4. requester address matches the signature identity;
5. referenced Cell is still live;
6. Cell Type Script matches the configured deployment;
7. capability data/type args are internally consistent;
8. service ID matches the protected service;
9. capability is not expired;
10. current live Cell lock equals the requester lock;
11. if payments are enabled, x402/Fiber payment verification succeeds.

Authorization is therefore tied to current CKB state, not a provider-owned entitlement database.

## Payment replay and crash recovery

A payment quote is bound to the semantic protected request (requester, capability outpoint, input and service). Reusing it for a changed request is rejected.

The facilitator's durable payment-consumption record prevents replay across processes/restarts. Settlement is idempotent for the exact same requirement/payer. SkillPass stores the protected delivery receipt before returning the successful HTTP response so a client can retry safely after a dropped connection.

A narrow crash after facilitator consumption but before receipt persistence is recovered by the idempotent settlement path. The current protected paper analyzer is side-effect free, so recomputing the same bound result during recovery is safe.

## Browser and HTTP hardening

The repo includes:

- restrictive security headers and CSP;
- no intentional raw-HTML rendering sink in the application UI;
- adversarial XSS tests;
- JSON-only state-changing browser requests;
- cross-site request rejection using Fetch Metadata where available;
- body-size limits at edge and app;
- request/header/keepalive timeouts;
- bounded headers;
- generic 5xx public messages;
- request IDs;
- explicit removal of the application-specific `PAYMENT-SIGNATURE` header from Caddy access logs;
- no raw CKB/Fiber/database error strings in public readiness output;
- readiness caching so health polling does not continuously amplify CKB/Fiber RPC calls.

See `BAO_MAT_XSS_VI.md` for the browser-focused checklist.

## Infrastructure hardening

The production Compose profile exposes only Caddy on 80/443. SkillPass, facilitator, PostgreSQL and Redis have no host-published ports. The data backend network is marked internal; application/facilitator services also have a separate egress-capable network for CKB/Fiber dependencies.

Application containers use non-root Node, read-only root filesystems, `no-new-privileges`, dropped Linux capabilities, PID limits and memory limits. Secrets are mounted as Docker Compose secret files and excluded from Git/Docker build context.

Caddy terminates HTTPS, sets HSTS and security headers, enforces an edge request-body limit and dynamically discovers scaled SkillPass replicas.

## Secret handling

Do not commit or copy into a support bundle:

- `.env.production`;
- `.secrets/*`;
- wallet private keys/seed phrases;
- Fiber node private keys;
- payment preimages;
- bearer tokens;
- database/Redis passwords.

`deploy-production.sh init` generates service secrets locally. File permissions are tightened where supported.

## Privacy

Delivery receipts can contain protected results. They are retained for bounded retry/recovery (`SERVICE_RECEIPT_TTL_SECONDS`, default 24h). Operators should choose retention appropriate to the data, encrypt disks/backups as needed, restrict DB access, and avoid logging protected results.

## Availability and abuse resistance

The production stack has health checks, restart policies, distributed rate limiting, resource limits and multiple app replicas. Those controls do not replace upstream DDoS protection. A high-traffic public deployment should additionally use network/provider DDoS controls, external monitoring, disk/DB alerts and capacity/load testing.

## Backup and restore

`./deploy-production.sh backup` creates a PostgreSQL application-state dump. It deliberately does not back up Fiber node/channel state. Fiber/FNN must be backed up with the version-appropriate official mechanism. Test restore before relying on a backup policy.

## Mainnet boundary

The v1.0 live profile intentionally requires testnet. Before mainnet, obtain an independent contract/security review and validate at minimum: reproducible contract deployment, payment economics, Fiber version/migrations, incident response, secret rotation, HA/failover, backup restore, abuse protection, privacy retention and real load/chaos behavior.

## Reporting security issues

Do not include real private keys, bearer tokens, payment preimages or production database dumps in an issue. Provide minimal reproduction steps using testnet/mock credentials where possible.
