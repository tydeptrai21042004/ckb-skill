# SkillPass v1.0 — Portable CKB Service Rights + Fiber/x402 Payments

SkillPass is a **multi-user CKB testnet service-right implementation**: a provider issues a capability as a CKB Cell, the current live Cell owner can use a protected service, and transfer moves that right to the next owner without a provider-owned entitlement table.

The production profile combines that authorization rule with Fiber/x402-style payment while keeping user signing in the user's wallet.

> **Production deploy:** start with [`HUONG_DAN_DEPLOY_MULTI_USER_VI.md`](HUONG_DAN_DEPLOY_MULTI_USER_VI.md), then run `./deploy-production.sh init`, `doctor`, and `up`.

> **Easy Vercel deploy:** open Git Bash/WSL in the repository root and run `bash setup-vercel.sh`. The script can fund/deploy the CKB Testnet contract when needed, extract the exact OffCKB metadata, generate Vercel ENV, connect Neon, upload ENV, and run `vercel --prod`. See [`VERCEL_DEPLOY_VI.md`](VERCEL_DEPLOY_VI.md). Redis is not required for this path.

> **Before publishing the URL:** run `npm run security:preflight`, configure `bash setup-vercel-firewall.sh`, and follow [`HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md`](HUONG_DAN_PUBLISH_AN_TOAN_VERCEL_VI.md). The hardened Vercel profile keeps real Fiber payments off initially, uses a 2-connection Postgres pool per instance, bounded request/upstream timeouts, and cheap public health/status endpoints.


## One-command Vercel quick start

Prerequisites: Node.js 22, Rust/Cargo, and Git Bash or WSL on Windows. No local PostgreSQL, Redis, Docker, or CKB node is required.

```bash
bash setup-vercel.sh
```

If a valid `deployments/testnet.json` already exists, the script reuses it and does **not** deploy the contract again. On a fresh setup it uses OffCKB Testnet tooling, calls the public faucet only when the deployer balance is low, deploys `capability-type`, reads OffCKB's `scripts.json`, and creates both:

```text
deployments/testnet.json
.env.vercel.generated
```

It then links Vercel, starts the Neon integration when `DATABASE_URL` is missing, uploads the generated SkillPass variables, validates the configuration, and deploys production. After deployment your PC can be turned off.

To stop after generating CKB metadata + Vercel ENV:

```bash
SKILLPASS_SKIP_VERCEL=1 bash setup-vercel.sh
```

## What v1.0 changes

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

The paid request flow is:

```text
request
  -> 402 + Fiber invoice
  -> user pays invoice
  -> retry with PAYMENT-SIGNATURE
  -> facilitator verifies payment
  -> wallet challenge is consumed + signature verified
  -> live Capability Cell is verified again
  -> protected work is computed
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

Current dependency-free Node suite:

```text
89 tests
88 passed
0 failed
```

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

The Fiber/x402 facilitator is not claimed as SkillPass novelty. The repository's core question is whether a provider-authorized service right can remain portable and independently verifiable from CKB state while payment is handled by Fiber/x402 without restoring a provider-owned entitlement database.

See [`docs/research-gap-and-funding.md`](docs/research-gap-and-funding.md).

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
