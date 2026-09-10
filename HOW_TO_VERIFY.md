# HOW TO VERIFY — SkillPass v0.6

All verification can start from the extracted local project folder. None of these steps require connecting this project to GitHub.

## A. Fast dependency-free verification

```bash
npm test
npm run smoke:http
npm run smoke:fiber
npm run smoke:paid
npm run benchmark
npm run verify:deploy
```

Expected Node result for this bundle: **50 tests, 50 passed**.

The paid smoke proves:

1. protected resource returns HTTP 402 before payment;
2. unpaid payment proof is rejected;
3. after payment, changing the protected request cannot reuse the original quote;
4. paid current owner succeeds;
5. ordinary verification rejects the consumed payment replay;
6. capability transfers Alice -> Bob;
7. Alice can pay a new invoice but is still rejected after ownership moved;
8. Bob pays a fresh quote and succeeds.

## B. One-command development verification

On Linux, macOS, or WSL:

```bash
chmod +x run_all.sh
./run_all.sh
```

Useful variants:

```bash
./run_all.sh --no-rust
./run_all.sh --skip-install
./run_all.sh --with-offckb
./run_all.sh --with-fiber
```

`--with-fiber` pulls/checks the official Fiber Docker image. It does not import wallet keys, fund wallets, open channels, or spend assets.

## C. Human-clickable deterministic demo

Native:

```bash
npm run dev
```

or Docker:

```bash
./deploy.sh demo
```

Open `http://127.0.0.1:8787/`.

For Docker mode:

```bash
./deploy.sh status demo
./deploy.sh smoke demo
./deploy.sh stop demo
```

Windows equivalent:

```bat
deploy.cmd demo
deploy.cmd status demo
deploy.cmd smoke demo
deploy.cmd stop demo
```

This is deterministic simulation evidence only.

## D. CCC client and React frontend

Install the declared dependencies, then type-check/build:

```bash
npm run setup
npm run typecheck:ckb
npm run build:web
```

The real browser path uses CCC. `@ckb-ccc/connector-react` is pinned to `1.1.9` in this bundle.

## E. CKB Type Script

With the required Rust/CKB RISC-V toolchain:

```bash
npm run verify:contract
```

or with Docker available:

```bash
npm run verify:contract:docker
```

Required cases include valid creation/transfer and rejection of malformed data, unsupported version/flags, forged creation identity, changed immutable fields, non-transferable owner changes, unauthorized issuance, and burn.

## F. Real CKB testnet configuration

```bash
./deploy.sh init-testnet
# enter/import the real Capability Type Script deployment metadata
./deploy.sh doctor
./deploy.sh testnet
```

Use `FIBER_BACKEND=mock` only for staging payment behavior. For real payment evidence use a real FNN receiver endpoint.

The complete local-folder procedure is in `DEPLOY_STEP_BY_STEP.md`. Vietnamese deployment instructions are in `HUONG_DAN_TRIEN_KHAI.md`. Windows can use `deploy.cmd`/`deploy.ps1` with the same command names.

## G. Real Fiber backend

For an existing trusted FNN receiver, configure `.env.testnet`:

```dotenv
FIBER_BACKEND=fnn
FIBER_NETWORK=testnet
FIBER_RPC_URL=http://host.docker.internal:8227
FIBER_PAYMENT_PROOF=invoice-status
```

Then:

```bash
./deploy.sh doctor
./deploy.sh testnet
```

For the bundled official Fiber container profile:

```bash
./deploy.sh fiber-init /secure/path/to/ckb-private-key
./deploy.sh testnet-fiber
```

`fiber-init` is deliberately explicit about the operator key. It never funds the key or opens channels.

## H. Recovery checks worth running before public use

Test at least these operational cases on your deployment:

- restart SkillPass after a quote is issued and confirm the quote survives;
- settle a paid request, retry the exact semantic request, and confirm no second payment is required within receipt retention;
- verify a consumed payment is rejected by ordinary `/verify`;
- confirm idempotent `/settle` returns the existing settlement for the same validated payment;
- confirm changing text/capability/request identity rejects quote reuse;
- back up and restore the SkillPass/facilitator state volumes;
- for self-hosted Fiber, exercise the backup/restore process for the exact Fiber release you deploy.

## I. Evidence required before stronger public claims

Do not mark the system externally verified/mainnet-ready until you have real reproducible evidence for:

- Capability Type Script deployment transaction and code Cell index;
- real issue and transfer transactions;
- owner success before transfer and old-owner denial after transfer;
- new-owner success after transfer;
- real Fiber invoice/payment/settlement evidence;
- payment/request replay rejection;
- public HTTPS endpoint;
- production frontend build and contract tests;
- independent tester reproduction;
- measured real network latency/error rates and a soak period.

## Integrated no-pass demo flow

The primary web app now includes a wallet-free interactive demo so reviewers are not blocked by provider issuance.

1. Start the normal product with `npm run dev`.
2. Open the web UI and choose **Try interactive demo**.
3. Confirm the banner says **Demo mode** and clearly states that no wallet, funds, or blockchain transaction is used.
4. Run **Model API** as Alice and confirm **Access granted**.
5. Transfer **Service Bundle Pass** from Alice to Bob.
6. Test Alice again and confirm **Access denied**.
7. Test Bob and confirm **Access granted**.
8. Switch to **Private Data API** and **Compute API** to confirm that the same shared entitlement is presented across three independent provider examples.
9. Choose **Live Testnet** to return to JoyID-backed discovery.
10. If the connected wallet has no pass, confirm the UI offers **Try interactive demo**, **Refresh ownership**, and **Copy wallet address** rather than a dead end.

Live issuance remains provider-controlled. Demo Mode never creates a trusted Capability Cell and never bypasses live issuer checks.
