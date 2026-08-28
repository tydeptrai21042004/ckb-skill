# SkillPass Deployment Guide

This repository has **two deployment modes**. Do not confuse them.

## Mode A — zero-dependency local product demo

Use this first. It exercises the complete product consequence without pretending that an in-memory Cell is CKB testnet evidence.

### Native Node.js

```bash
npm run bootstrap
npm run doctor
npm run verify
npm run dev
```

Open `http://127.0.0.1:8787/`.

The UI lets you demonstrate:

1. Alice owns a capability;
2. Alice can use `paper-analyzer-v1`;
3. Alice transfers the capability to Bob;
4. Alice is denied after the transfer;
5. Bob succeeds.

### Docker

```bash
docker compose up --build
```

Open `http://127.0.0.1:8787/`.

This image contains no npm runtime dependencies beyond Node itself.

---

## Mode B — real CKB testnet application

This mode uses:

- a real deployed `CapabilityType` script;
- a CCC wallet in the browser;
- CKB testnet live Cells;
- an API that verifies a one-time wallet message signature;
- a fresh CKB live-cell query on every protected-service use.

The live service has **no user private key**.

### 1. Verify/build the contract

With local Rust:

```bash
npm run verify:contract
```

Or with Docker only:

```bash
npm run verify:contract:docker
```

The expected binary is:

```text
contracts/capability-type/build/release/capability-type
```

### 2. Deploy the contract to CKB testnet

Deploy the compiled binary using your normal CKB/OffCKB deployment workflow. Record:

- deployment transaction hash;
- output index of the code cell;
- code/data hash used by the Type Script;
- hash type.

Do not put a wallet private key in this repository or in the SkillPass web/API container.

### 3. Create runtime configuration

```bash
npm run bootstrap:live
```

Edit `.env.live` and replace the two placeholder hashes:

```dotenv
CAPABILITY_CODE_HASH=0x...
CAPABILITY_HASH_TYPE=data1
CAPABILITY_DEP_TX_HASH=0x...
CAPABILITY_DEP_INDEX=0
ENABLE_PUBLIC_ISSUE=false
```

Then validate it:

```bash
npm run doctor:live
```

### 4. Build and run the real testnet app

```bash
docker compose -f compose.live.yaml up --build
```

Open `http://127.0.0.1:8787/`.

The live image builds the React/CCC browser application and serves it from the same Node service. The same-origin design avoids a separate CORS configuration and keeps deployment to one container.

### 5. Provider issuance

For a public demo in which any connected testnet user may issue a pass from their own wallet, set:

```dotenv
ENABLE_PUBLIC_ISSUE=true
```

For a normal demo, keep it `false` and have the provider issue/transfer test passes separately.

Issuance always requires an explicit wallet transaction signature in the browser.

### 6. Public hosting

`Dockerfile.live` is suitable for a single-container host such as a Docker VM or a container PaaS. Configure the values from `.env.live` as service environment variables and expose port `8787`.

For the MVP, run **one live-service instance**. The nonce replay store is intentionally in process memory. Horizontal scaling requires replacing that store with a shared atomic TTL store such as Redis before running multiple replicas.

### 7. Funding-ready verification

Do not call the project testnet-verified until all of these exist:

- real deployment tx hash;
- real issue tx hash;
- real transfer tx hash;
- Actor A succeeds before transfer;
- Actor A is rejected after transfer;
- Actor B succeeds after transfer;
- public app URL;
- CI/test evidence;
- unrelated external-user reproduction.

See `HOW_TO_VERIFY.md` and `reports/verification-matrix.md`.
