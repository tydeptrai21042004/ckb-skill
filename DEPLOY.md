# SkillPass v0.4 deployment

The v0.4 deployment goal is simple: **Docker for deployment, `run_all.sh` for development/verification**.

## 1. Fastest path — zero-config demo

Requirements: Docker + Docker Compose v2.

```bash
chmod +x deploy.sh
./deploy.sh demo
```

Open:

```text
http://127.0.0.1:8787
```

This starts the deterministic SkillPass demo plus a localhost-only mock facilitator. It does not use real CKB/Fiber state.

Useful operations:

```bash
./deploy.sh status demo
./deploy.sh logs demo
./deploy.sh stop demo
```

## 2. Real CKB testnet + staging payment

Create the environment file:

```bash
./deploy.sh init-testnet
```

The command:

- copies `.env.testnet.example` to `.env.testnet`;
- generates a random `FACILITATOR_AUTH_TOKEN`;
- automatically imports `deployments/testnet.json` when that file exists and contains real deployment metadata;
- never overwrites an existing `.env.testnet`.

Validate it:

```bash
./deploy.sh doctor
```

Then deploy:

```bash
./deploy.sh testnet
```

With `FIBER_BACKEND=mock`, CKB ownership is real but payment is staging-only. The command prints a warning so mock payment evidence cannot be confused with real Fiber evidence.

## 3. Real CKB testnet + an existing FNN

Set in `.env.testnet`:

```dotenv
FIBER_BACKEND=fnn
FIBER_RPC_URL=http://host.docker.internal:8227
FIBER_RPC_TOKEN=
```

Then:

```bash
./deploy.sh doctor
./deploy.sh testnet
```

The facilitator is kept private inside the Compose network. Only SkillPass port 8787 is published by default.

## 4. Self-host the official Fiber container

Fiber publishes official release-tagged images. SkillPass pins the default to `nervos/fiber:0.9.0`.

First export/copy the private key you explicitly want FNN to use, then initialize its local data directory:

```bash
./deploy.sh fiber-init /secure/path/to/ckb-private-key
```

This command:

1. pulls the official `nervos/fiber:0.9.0` image;
2. copies your supplied key to `.runtime/fiber-node/ckb/key` with restrictive permissions;
3. copies Fiber's bundled **testnet** configuration;
4. changes the FNN RPC listener from `127.0.0.1:8227` to `0.0.0.0:8227` **inside the private Compose network** so the facilitator can reach it;
5. generates `FIBER_SECRET_KEY_PASSWORD` in the gitignored `.env.testnet` if this is a first initialization;
6. sets `FIBER_BACKEND=fnn`.

It deliberately does **not** fund the wallet, connect peers, open channels, or transfer assets.

Start everything:

```bash
./deploy.sh testnet-fiber
```

Check FNN from inside the container:

```bash
docker compose --env-file .env.testnet \
  -f deploy/compose.testnet.yaml \
  -f deploy/compose.fiber.yaml \
  exec fiber fnn-cli info
```

The FNN RPC port is not published publicly in this profile. P2P port 8228 is published so Fiber can participate in the network.

## 5. Live paid request order

For `/api/analyze` with `PAYMENTS_REQUIRED=true`:

```text
request
  -> verify claimed capability is currently live/current-owner
  -> 402 + PAYMENT-REQUIRED/Fiber invoice
  -> payer pays invoice
  -> retry with PAYMENT-SIGNATURE
  -> facilitator verifies payment
  -> wallet challenge/signature verified
  -> live CKB capability checked again
  -> facilitator settles/consumes payment
  -> protected result + PAYMENT-RESPONSE
```

The pre-billing ownership check prevents obviously invalid owners from being asked to pay. The second ownership check protects the transfer race between quote creation and settlement.

## 6. Health endpoints

Live service:

```text
GET /livez     process is alive
GET /readyz    CKB RPC + facilitator dependencies are usable
GET /health    alias of readiness
```

Facilitator:

```text
GET /livez
GET /readyz    includes FNN `node_info` check when FIBER_BACKEND=fnn
GET /health
```

Docker health checks use readiness so a broken upstream dependency is visible immediately.

## 7. Production boundary

The deployment is much easier, but mainnet/multi-replica production still requires:

- external/shared nonce and replay state rather than process/file-local state;
- HTTPS/reverse proxy and request-size/rate policies appropriate to your deployment;
- FNN backup/restore procedures before upgrades;
- security review of the CKB Type Script and service;
- independent testnet soak/load testing;
- explicit crash/idempotency policy around payment settlement and service delivery.

Do not expose FNN RPC directly to the public internet. Fiber's official Docker documentation notes that its bundled configs bind RPC to localhost by default; SkillPass changes that only for the private Compose network in the self-hosted profile.
