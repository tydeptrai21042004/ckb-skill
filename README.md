# SkillPass v1.3 — Portable Entitlements for CKB Services, Agents, and Digital Assets

SkillPass is a **multi-user CKB testnet entitlement gateway**. A provider issues a Capability as a CKB Cell and protected services authorize against the current live Cell state instead of trusting only a provider-owned entitlement row. Rights can be portable or non-transferable, owner-only or agent-delegatable, and either strongly owned or explicitly provider-revocable according to each service policy.

The strongest SkillPass use case is **service rights that should follow ownership of a CKB asset or AI agent, or be recognized by independent providers without synchronizing entitlement databases**. It is not positioned as a generic replacement for OAuth, API keys, x402, or ordinary SaaS subscriptions. Fiber/x402 remains an optional usage-payment layer; it never replaces entitlement authorization.

> **Production deploy:** start with [`HUONG_DAN_DEPLOY_MULTI_USER_VI.md`](HUONG_DAN_DEPLOY_MULTI_USER_VI.md), then run `./deploy-production.sh init`, `doctor`, and `up`.

> **Recommended Vercel GUI deploy:** run `bash collect-vercel-env.sh` locally to deploy/reuse the CKB Testnet contract and generate `.env.vercel.gui`, then do the rest from the Vercel Dashboard. The script never logs in to Vercel and never uploads secrets. See [`HUONG_DAN_VERCEL_GUI_VI.md`](HUONG_DAN_VERCEL_GUI_VI.md). Neon supplies `DATABASE_URL`; Redis is not required.

> **Optional CLI deploy:** `bash setup-vercel.sh` remains available for users who explicitly want Vercel CLI automation.

> **Before publishing the URL:** run `npm run security:preflight`, configure `bash setup-vercel-firewall.sh`, and follow [`HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md`](HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md). The hardened Vercel profile keeps real Fiber payments off initially, uses a 2-connection Postgres pool per instance, bounded request/upstream timeouts, and cheap public health/status endpoints.

> **Week 9 hardening:** see [`docs/WEEK_09_HARDENING_V2.md`](docs/WEEK_09_HARDENING_V2.md) for intent-bound wallet signatures, issuer rotation, live-owner verification, safer Capability transactions, Fiber quote reuse, and performance/security settings.

> **Product/market validation:** read [`docs/MARKET_VALIDATION_PLAYBOOK.md`](docs/MARKET_VALIDATION_PLAYBOOK.md), [`docs/MULTI_PROVIDER_PILOT.md`](docs/MULTI_PROVIDER_PILOT.md), and [`docs/PROVIDER_POLICY_MODES.md`](docs/PROVIDER_POLICY_MODES.md). These documents define the target customer, the strongest cross-provider demo, explicit kill/pivot criteria, and the owned-right vs revocable-license policy model.

> **Funding/product foundation:** see [`docs/FUNDING_READINESS_2026.md`](docs/FUNDING_READINESS_2026.md), [`docs/SERVICE_GATEWAY.md`](docs/SERVICE_GATEWAY.md), [`docs/AGENT_DELEGATION.md`](docs/AGENT_DELEGATION.md), [`docs/AGENT_PROTOCOL.md`](docs/AGENT_PROTOCOL.md), and [`docs/PRODUCTION_READINESS_V1_2.md`](docs/PRODUCTION_READINESS_V1_2.md).


## What v1.3 adds

- **Per-service provider trust** — each protected service can accept a different issuer allowlist instead of sharing one global trust decision.
- **Shared bundle entitlements** — multiple independent service policies can accept the same immutable Capability entitlement ID through `entitlementIds`, so one live Cell can unlock an opt-in provider bundle without entitlement-database synchronization.
- **Owned right vs revocable license** — `rightMode=owned` keeps provider revocation disabled; `rightMode=license` requires explicit `FLAG_REVOCABLE` opt-in and supports a provider deny/restore record.
- **Transferable or non-transferable products** — providers can require portable rights or issue conventional owner-bound licenses.
- **Provider-controlled agent delegation** — a service can require delegation, allow it optionally, or disable it entirely. A transferable Capability is no longer automatically delegatable.
- **Transfer-aware UI** — non-transferable licenses no longer show a misleading transfer action; delegation controls reflect both Cell flags and provider policy.
- **Provider operations CLI** — list, revoke, and restore revocable licenses with `npm run provider:admin`; admin secrets stay out of browser code.
- **Persistent revocation listing** — local and PostgreSQL record stores can enumerate current service revocations for provider operations.
- **Market-validation artifacts** — a multi-provider pilot plan, customer hypotheses, success gates, measurements, and kill/pivot criteria are included in `docs/`.

### Best fit / poor fit

| Strong fit | Usually a poor default fit |
| --- | --- |
| AI agents or digital assets whose service rights should move with ownership | Ordinary account-bound monthly SaaS with no reason to transfer access |
| Multiple independent providers honoring a shared entitlement model | A single provider whose existing database already solves the whole workflow |
| Scoped, budgeted machine delegation tied to a live CKB outpoint | Pure pay-per-request APIs where x402 alone is sufficient |
| Transferable memberships, model/data/API bundles, CKB game/DOB/device rights | Workflows where OAuth/Biscuit/signed receipts are simpler and portability adds no value |

### Provider policy example

```dotenv
SERVICE_RIGHT_MODE=owned
SKILLPASS_SERVICE_POLICIES_JSON={"paper-analyzer-v1":{"entitlementIds":["0xSHARED_BUNDLE_ID"],"issuanceEntitlementId":"0xSHARED_BUNDLE_ID","bundleId":"research-agent-pack-v1","rightMode":"owned","requireTransferable":true,"delegationAllowed":true,"requireDelegatable":true,"trustedIssuerIds":["0xBUNDLE_ISSUER_LOCK_HASH"]},"research-insights-v1":{"entitlementIds":["0xSHARED_BUNDLE_ID"],"issuanceEntitlementId":"0xSHARED_BUNDLE_ID","bundleId":"research-agent-pack-v1","rightMode":"owned","requireTransferable":true,"delegationAllowed":true,"trustedIssuerIds":["0xBUNDLE_ISSUER_LOCK_HASH"]}}
```

For a shared bundle, every participating provider must explicitly trust the bundle issuer; providers remain independent service operators even though they opt into a common entitlement authority. When any service uses `rightMode=license`, configure a strong `SKILLPASS_ADMIN_TOKEN`. Provider revocation is a service-layer policy deny; it does **not** burn or seize the user's CKB Cell.

## Week 9 production UI / Vercel hotfix

The current Week 9 build includes a production UI cleanup and a Vercel API bootstrap guard. If a backend service fails before application startup, API callers now receive bounded JSON `503` responses and the browser shows a generic service-unavailable state instead of a raw JSON parser error. See `docs/VERCEL_UI_HOTFIX.md` before redeploying.


## Vercel GUI quick start

Prerequisites for the first CKB contract deployment: Node.js 24 LTS, Rust/Cargo, and Git Bash or WSL on Windows. No local PostgreSQL, Redis, Docker, CKB node, or Vercel CLI is required.

```bash
bash collect-vercel-env.sh
```

The script creates:

```text
deployments/testnet.json
.env.vercel.gui
```

Then use only the Vercel Dashboard: import the repository, paste `.env.vercel.gui` into Project Settings -> Environment Variables, connect Neon from Storage/Marketplace so `DATABASE_URL` is injected automatically, and Deploy/Redeploy. See [`HUONG_DAN_VERCEL_GUI_VI.md`](HUONG_DAN_VERCEL_GUI_VI.md).

If a valid `deployments/testnet.json` already exists, `collect-vercel-env.sh` reuses it and does not spend Testnet CKB again.

## v1.2 foundation retained

- **Multi-service Capability discovery** — a single deployment can recognize several protected service IDs.
- **Service Gateway** — protect operator-configured read/query APIs without changing the upstream application.
- **Multi-upstream catalog** — register up to 12 external protected services with independent IDs, bounds, timeouts, and prices.
- **SSRF/config hardening** — production upstream gateways require HTTPS + an exact hostname allowlist and reject private literal targets/redirects.
- **Research Insights** — a second built-in protected service with manuscript/readability/structure signals.
- **Agent delegation** — owner-signed, short-lived, service-scoped credentials bound to a live Capability outpoint.
- **Budgeted delegation v2** — optionally sign maximum call count and total Fiber atomic-unit spend; production counters are serialized in PostgreSQL.
- **Backward-compatible delegation v1** — existing unlimited short-lived grants keep their original signed-message format.
- **Automatic delegation invalidation on transfer** — old grants fail when the bound Cell is consumed.
- **Evidence export** — live-owner proof bundles + deterministic proof hash.
- **Authorization receipts** — UI exposes request/entitlement/payment verification evidence.
- **Dynamic OpenAPI/discovery** — service catalog and delegation model are machine-readable.
- **Agent SDK** — discover services and create signed owner/delegate invocations while surfacing x402/Fiber payment requirements.
- **Agent payment adapter** — optional SDK helper pays via a caller-supplied adapter and obtains a fresh one-time challenge before retrying.
- **LLM-friendly agent spec** — `/.well-known/skillpass-agent.txt` gives agents a compact protocol description.
- **Per-service Fiber pricing** — keep a global default while overriding atomic payment amounts by protected service slug.

### Existing production foundation

The public deployment path no longer relies on single-process JSON/Map state:

- **PostgreSQL 17** — durable quotes, receipts and payment replay/consumption state;
- **Redis 8** — one-time wallet challenges and distributed rate limits;
- **Caddy** — automatic HTTPS and load balancing across SkillPass replicas;
- **N SkillPass replicas** — scale with `./deploy-production.sh scale N`;
- **private facilitator** — no public facilitator port;
- **Docker secrets** — facilitator/DB/Redis/Fiber RPC credentials are file-mounted;
- **backup/restore/upgrade** — production operator commands are included;
- **correct Fiber amount UX** — atomic integer amount stays exact while UI shows human-readable CKB;
- **Fiber invoice QR** — users can scan/copy the invoice instead of manually handling a raw string.

The server still does **not** need users' CKB private keys.

## Production architecture

```text
Internet
   |
 HTTPS
   v
 Caddy
   |
   +----------+----------+
   |          |          |
SkillPass  SkillPass  SkillPass
   \          |          /
    \         |         /
     PostgreSQL + Redis
            |
       Facilitator
            |
       private FNN RPC

SkillPass replicas -> dedicated/self-hosted CKB RPC
```

PostgreSQL's `payment_hash` primary key plus atomic conflict handling prevents two replicas from consuming the same payment as a first use. Redis challenge consumption is one-time and shared across replicas, so Caddy does not need sticky sessions.

## Deploy for real concurrent users

Requirements:

- Linux VPS/server with Docker Engine + Compose v2;
- a real domain pointing to the server;
- a deployed Capability Type Script on CKB testnet;
- dedicated/self-hosted CKB testnet RPC recommended;
- an operator-managed Fiber/FNN receiver RPC;
- ports 80/443 open; database/app/facilitator/FNN RPC ports kept private.

Initialize:

```bash
chmod +x deploy-production.sh
./deploy-production.sh init
```

Edit `.env.production`, especially:

```dotenv
PUBLIC_DOMAIN=skillpass.example.com
ACME_EMAIL=admin@example.com
SKILLPASS_REPLICAS=2

CKB_RPC_URL=https://YOUR_DEDICATED_TESTNET_RPC
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=data2
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0

STATE_BACKEND=postgres-redis
PAYMENTS_REQUIRED=true
FIBER_BACKEND=fnn
FIBER_NETWORK=testnet
FIBER_RPC_URL=http://host.docker.internal:8227
```

Then:

```bash
./deploy-production.sh doctor
./deploy-production.sh up
./deploy-production.sh health
```

Scale application replicas:

```bash
./deploy-production.sh scale 4
```

Backup before upgrades:

```bash
./deploy-production.sh backup
./deploy-production.sh upgrade
```

Restore with an explicit confirmation flag:

```bash
./deploy-production.sh restore backups/production-.../skillpass.sql.gz --yes
```

Full Vietnamese runbook: [`HUONG_DAN_DEPLOY_MULTI_USER_VI.md`](HUONG_DAN_DEPLOY_MULTI_USER_VI.md).

## Security boundary

A successful protected request requires the relevant combination of:

1. fresh one-time challenge;
2. valid CKB-native wallet signature;
3. address/signature identity match;
4. live CKB Cell lookup;
5. correct Capability deployment/type args/service ID;
6. non-expired capability;
7. current Cell lock controlled by requester;
8. valid Fiber/x402 payment when payments are enabled;
9. payment not reused for a different semantic request.

Production additionally uses:

- CSP and XSS-oriented headers/tests;
- JSON-only mutation requests and Fetch-Metadata cross-site rejection;
- bounded body/header/request timeouts;
- generic server error responses + request IDs;
- distributed rate limiting;
- private backend/data networks;
- non-root/read-only app containers;
- dropped Linux capabilities;
- `no-new-privileges`;
- memory/PID limits;
- readiness/liveness checks;
- bounded delivery-receipt retention.

See [`SECURITY.md`](SECURITY.md) and [`BAO_MAT_XSS_VI.md`](BAO_MAT_XSS_VI.md).

## Payment semantics

`PAYMENT_AMOUNT` is an **atomic-unit integer**, not a floating-point value. For CKB, production defaults to:

```dotenv
PAYMENT_DECIMALS=8
PAYMENT_ATOMIC_UNIT=shannon
```

The browser converts that integer for display only. The protocol payload keeps the exact integer amount.

The paid request flow is deliberately **authorization-first** so SkillPass does not mint Fiber invoices for callers who do not currently hold (or validly delegate) the service right:

```text
request with fresh wallet challenge/signature
  -> consume challenge + verify signature/identity
  -> verify live Capability ownership or owner-signed delegation
  -> 402 + Fiber invoice when payment is still required
  -> user/agent pays invoice
  -> retry with PAYMENT-SIGNATURE + a fresh intent-bound challenge
  -> re-verify live Capability/delegation
  -> facilitator verifies payment proof
  -> protected idempotent work is computed
  -> settlement is idempotently recorded
  -> delivery receipt is persisted
  -> HTTP response
```

Payment does **not** replace capability ownership authorization.

## Local development

For contributors:

```bash
npm run setup
npm run dev
```

Open `http://127.0.0.1:8787/`.

The local/demo profiles intentionally keep simple JSON/in-memory fallbacks for deterministic development. Do not confuse those with the production `STATE_BACKEND=postgres-redis` profile.

For the complete local verification flow:

```bash
./run_all.sh
```

Useful variants:

```bash
./run_all.sh --no-rust
./run_all.sh --serve
./run_all.sh --with-offckb
./run_all.sh --with-fiber
```

`--with-fiber` never imports wallet keys, funds channels or moves assets automatically.

## Automated evidence

Current dependency-free Node suite is expected to be run from the repository rather than represented by a hard-coded count, because the suite grows with each feature revision.

Run:

```bash
npm test
npm run test:security
npm run verify:production
```

With npm dependencies/network available, also run:

```bash
npm run setup
npm run build:web
npm run typecheck:ckb
```

For Rust/contract verification:

```bash
npm run verify:contract
# or
npm run verify:full
```

## Agent/tool discovery

The live service publishes read-only machine-readable metadata:

- `GET /.well-known/skillpass.json`
- `GET /api/openapi.json`
- `GET /api/status`
- `GET /api/config`

These documents do not contain wallet keys or backend bearer/database secrets.

## Capability data v1

Fixed 106-byte layout:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | version |
| 1 | 1 | flags |
| 2 | 32 | service ID |
| 34 | 32 | issuer lock-script hash |
| 66 | 32 | capability ID |
| 98 | 8 | expiry, unsigned LE Unix seconds |

Type Script args:

```text
issuer_id || capability_id
```

Key invariants include issuer-authorized issue, singleton capability identity, immutable capability metadata during transfer, transferability policy, and live-owner authorization at service use time.

See [`docs/capability-format.md`](docs/capability-format.md), [`docs/state-machine.md`](docs/state-machine.md), and the Rust contract in `contracts/capability-type`.

## Research positioning

The Fiber/x402 facilitator is not claimed as SkillPass novelty. The repository's core question is whether a provider-authorized service right can remain independently verifiable from live CKB state while ownership, delegation, transfer, revocation policy, and optional payment stay cleanly separated.

The project deliberately treats **portable rights as a hypothesis to validate**, not as proof that every SaaS subscription should be transferable. See [`docs/research-gap-and-funding.md`](docs/research-gap-and-funding.md) and [`docs/MARKET_VALIDATION_PLAYBOOK.md`](docs/MARKET_VALIDATION_PLAYBOOK.md).

## Other documentation

### Vietnamese

- [`HUONG_DAN_DEPLOY_MULTI_USER_VI.md`](HUONG_DAN_DEPLOY_MULTI_USER_VI.md) — production multi-user deployment.
- [`HUONG_DAN_TRIEN_KHAI.md`](HUONG_DAN_TRIEN_KHAI.md) — development/testnet deployment.
- [`HUONG_DAN_SU_DUNG.md`](HUONG_DAN_SU_DUNG.md) — application use.
- [`KIEN_TRUC_VA_BAO_MAT_VI.md`](KIEN_TRUC_VA_BAO_MAT_VI.md) — architecture/security.
- [`XU_LY_LOI_VI.md`](XU_LY_LOI_VI.md) — troubleshooting.

### English/reference

- [`DEPLOY_STEP_BY_STEP.md`](DEPLOY_STEP_BY_STEP.md)
- [`DEPLOY.md`](DEPLOY.md)
- [`HOW_TO_VERIFY.md`](HOW_TO_VERIFY.md)
- [`SECURITY.md`](SECURITY.md)
- [`VALIDATION.md`](VALIDATION.md)
- [`reports/limitations.md`](reports/limitations.md)

## Production limitations

The bundled production Compose profile is **multi-replica but single-host**. One VPS is still one failure domain. For multi-host HA, use external/HA PostgreSQL and Redis plus a real load balancer/orchestrator and tested failover procedures.

The release deliberately remains CKB/Fiber **testnet-only**. Do not switch to mainnet merely by editing an environment variable. Independent contract/security review, operational HA, backup/restore drills, abuse protection and payment-economic review are required before using real-value mainnet assets.


## New platform documentation

- [`docs/SERVICE_GATEWAY.md`](docs/SERVICE_GATEWAY.md) — protect an existing idempotent JSON API.
- [`docs/AGENT_DELEGATION.md`](docs/AGENT_DELEGATION.md) — scoped agent credentials, transfer invalidation, and `@skillpass/agent-sdk`.
- [`docs/FUNDING_READINESS_2026.md`](docs/FUNDING_READINESS_2026.md) — ecosystem gap, grant milestone, production limitations, and next phase.
- [`docs/PROVIDER_POLICY_MODES.md`](docs/PROVIDER_POLICY_MODES.md) — owned rights, revocable licenses, transfer/delegation controls, and provider admin commands.
- [`docs/MULTI_PROVIDER_PILOT.md`](docs/MULTI_PROVIDER_PILOT.md) — recommended cross-provider proof-of-value demo.
- [`docs/MARKET_VALIDATION_PLAYBOOK.md`](docs/MARKET_VALIDATION_PLAYBOOK.md) — customer hypotheses, metrics, success gates, and pivot criteria.

## Capability v2: rights bound to agents and digital assets

SkillPass now includes an **experimental, backward-compatible Capability v2** for the narrower product problem where a provider-issued service right must be associated with a transferable AI agent, Spore/DOB, device, or other CKB asset. V2 commits to `subjectType`, `subjectId`, `bindingMode`, and `policyHash` while retaining the V1 issuer/capability identity model.

Provider code can require subject binding and verify that the live subject owner still matches the live Capability owner. The generic transfer helper refuses `ATOMIC` bindings unless a subject-aware transfer adapter is used; this prevents the SDK from silently transferring the right without its subject. See `docs/CAPABILITY_V2.md` and `MARKET_VALIDATION_PLAN.md`.

The product boundary is deliberate: SkillPass does **not** try to replace OAuth/OpenFGA-style SaaS authorization, DID/agent identity, or Fiber/x402 payment. It focuses on portable **service-right ownership + bounded delegation + independent payment**.
