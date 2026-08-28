# HOW TO VERIFY — SkillPass v0.3

## A. One-command verification

```bash
chmod +x run_all.sh
./run_all.sh
```

For the local JS path only:

```bash
./run_all.sh --no-rust
```

The script installs missing developer tooling locally under `.tooling/`; it does not require global Node/Rust installation.

## B. Deterministic protocol tests

```bash
npm test
npm run smoke:http
npm run smoke:fiber
npm run smoke:paid
```

The combined paid smoke must prove:

1. resource returns HTTP 402 without payment;
2. unpaid quote is rejected;
3. paid quote + current owner succeeds;
4. replaying the consumed payment is rejected;
5. capability transfers A -> B;
6. A creates/pays a fresh quote but is rejected as `NOT_OWNER`;
7. B creates/pays a fresh quote and succeeds.

## C. Human-clickable local demo

```bash
npm run dev
```

Open `http://127.0.0.1:8787/` and exercise both ordinary and **Paid use** buttons.

This is simulation evidence only.

## D. CKB contract verification

```bash
npm run verify:contract
```

or:

```bash
npm run verify:contract:docker
```

Required cases include valid creation/transfer and rejection of malformed data, unsupported version/flags, forged creation ID, changed immutable fields, non-transferable owner change, unauthorized issue, and burn.

## E. CCC client/frontend

```bash
npm install --prefix packages/ckb-client
npm install --prefix apps/web
npm run typecheck:ckb
npm run build:web
```

CCC remains the wallet/transaction SDK used by the real CKB path.

## F. Real CKB testnet

```bash
npm run bootstrap:live
# edit .env.live using real deployment metadata
npm run doctor:live
docker compose -f compose.live.yaml up --build
```

Record real deployment, issue, and transfer transaction hashes.

## G. Real Fiber adapter

Install FNN using the project's wrapper around the official installer:

```bash
./run_all.sh --no-rust --with-fiber
```

Then point the facilitator at a receiver FNN RPC endpoint:

```bash
FIBER_BACKEND=fnn \
FIBER_RPC_URL=http://127.0.0.1:8227 \
FACILITATOR_STATE_FILE=.runtime/fiber-settled.json \
npm run facilitator
```

A real payment test additionally needs a funded payer node/channel and should record the payment hash, status, and (where supported by the FNN version) successful payment preimage/receipt evidence.

## H. Funding-ready evidence checklist

Do not mark the system externally verified until all are public/reproducible:

- CKB deployment tx hash;
- issue tx hash;
- transfer tx hash;
- owner succeeds before transfer;
- old owner rejected after transfer;
- new owner succeeds;
- real Fiber payment evidence;
- payment replay rejection;
- public URL;
- passing CI;
- unrelated tester report;
- measured real network latency/error rates.
