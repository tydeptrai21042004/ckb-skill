# SkillPass v0.3 Deployment Guide

SkillPass has three deliberately separated modes.

## Mode A — local deterministic research demo

```bash
./run_all.sh --no-rust --serve
```

or, after setup:

```bash
npm run dev
```

Open `http://127.0.0.1:8787/`.

This mode uses in-memory CKB/Fiber models. It is suitable for CI, protocol testing, demos, and adversarial-flow reproduction. It is **not** network evidence.

## Mode B — real CKB testnet capability

### 1. Verify/build the Type Script

```bash
npm run verify:contract
```

Expected binary:

```text
contracts/capability-type/build/release/capability-type
```

### 2. Deploy to CKB testnet

Use your CKB/OffCKB workflow. `run_all.sh --with-offckb` can install OffCKB locally, but does not deploy automatically.

Record:

- deployment transaction hash;
- code Cell output index;
- configured code/data hash;
- hash type.

Never place wallet private keys/seed phrases in this repository or service environment.

### 3. Configure the live application

```bash
npm run bootstrap:live
```

Fill `.env.live`, then:

```bash
npm run doctor:live
docker compose -f compose.live.yaml up --build
```

The live service verifies a fresh wallet challenge plus the current live Capability Cell. It does not hold a user wallet private key.

## Mode C — real Fiber payment integration

Install current official FNN locally if needed:

```bash
./run_all.sh --no-rust --with-fiber
```

Run the local compatibility facilitator against an FNN receiver RPC:

```bash
FIBER_BACKEND=fnn \
FIBER_NETWORK=testnet \
FIBER_RPC_URL=http://127.0.0.1:8227 \
npm run facilitator
```

The adapter creates/queries Fiber invoices through JSON-RPC. A complete real payment requires a separately configured payer/Fiber route/channel. Channel funding is intentionally left as an explicit operator action.

## Production hardening required before multi-replica/mainnet

- shared atomic replay/nonce store (Redis/DB or equivalent);
- authenticated/least-privilege FNN RPC access;
- TLS and reverse-proxy limits;
- structured logs/metrics/traces;
- dependency/SBOM/vulnerability scanning;
- contract and service security review;
- idempotent delivery/settlement design for crash boundaries;
- independent testnet soak/load tests;
- backup/recovery procedure for FNN and service state.

See `SECURITY.md` and `reports/limitations.md`.
