# SkillPass — CKB Capability Protocol

SkillPass turns access to `paper-analyzer-v1` into a CKB-native capability: **the current owner of the live Capability Cell may use the service; after a valid transfer, the previous owner is rejected and the new owner is accepted.**

## v0.2 improvements

This version is designed to be easier for a new developer, reviewer, or external tester to run:

- dependency-free interactive local web application;
- browser-safe shared Capability codec (`Uint8Array`, no Node `Buffer` dependency);
- one-command environment bootstrap and doctor;
- automated HTTP/UI smoke test;
- local Docker deployment;
- Dockerized Rust/CKB contract verification path;
- React + CCC real-testnet frontend;
- live testnet service that verifies wallet proof + current CKB Cell;
- one-container testnet deployment path;
- runtime config through `.env.live`, not source edits;
- no user private key on the backend.

## Fastest start

Requires Node.js 22+ only:

```bash
npm run bootstrap
npm run verify
npm run dev
```

Open:

```text
http://127.0.0.1:8787/
```

Current dependency-free verification covers **31 automated Node tests** plus an HTTP/UI smoke test.

## Local Docker demo

```bash
docker compose up --build
```

Then open `http://127.0.0.1:8787/`.

## Real CKB testnet deployment

After the contract is deployed and its metadata is known:

```bash
npm run bootstrap:live
# edit .env.live
npm run doctor:live
docker compose -f compose.live.yaml up --build
```

See [`DEPLOY.md`](DEPLOY.md) for the complete workflow.

## Main architecture

```text
Browser / CCC wallet
        │
        ├── issue / transfer transaction ──► CKB Testnet
        │                                     │
        │                                     │ current live Capability Cell
        │                                     ▼
        └── signed one-time challenge ──► SkillPass service
                                              │
                                              ├── verify signature
                                              ├── query live Cell
                                              ├── verify service + expiry + owner
                                              └── return paper analysis
```

CKB remains authoritative for ownership. A database or cached entitlement flag is not required for authorization.

## Capability data

Fixed 106-byte v1 layout:

| Offset | Size | Field |
|---:|---:|---|
| 0 | 1 | version |
| 1 | 1 | flags |
| 2 | 32 | service ID |
| 34 | 32 | issuer lock-script hash |
| 66 | 32 | capability ID |
| 98 | 8 | expiry, unsigned LE Unix seconds |

Type Script args are:

```text
issuer_id || capability_id
```

Creation uses a Type-ID-style identity:

```text
CKB_HASH(serialized first CellInput || uint64_le(capability_output_index))
```

This prevents a fresh valid issuance from recreating the same singleton identity.

## Useful commands

| Command | Purpose |
|---|---|
| `npm run bootstrap` | create safe local config templates without overwriting files |
| `npm run doctor` | show local/testnet readiness |
| `npm test` | run Node protocol/service/E2E tests |
| `npm run smoke:http` | start the service temporarily and verify the clickable HTTP flow |
| `npm run verify` | tests + demo + HTTP/UI smoke verification |
| `npm run dev` | run interactive local app |
| `npm run verify:contract` | build/test CKB contract using local Rust |
| `npm run verify:contract:docker` | build/test CKB contract using Docker |
| `npm run bootstrap:live` | create `.env.live` safely |
| `npm run doctor:live` | validate real deployment metadata |
| `npm run setup:live` | install isolated CCC client dependencies |
| `npm run typecheck:ckb` | type-check the CCC transaction client |
| `npm run release` | create a source release ZIP |

## Repository layout

```text
apps/demo-service/          dependency-free local UI/API simulation
apps/web/                   React + CCC real-testnet frontend
apps/live-service/          live-chain protected-service backend
contracts/capability-type/  Rust CKB Type Script + ckb-testtool tests
packages/capability-codec/  browser/server shared 106-byte codec
packages/protocol-core/     deterministic transition rules
packages/verifier/          local verifier + nonce/test-wallet model
packages/ckb-client/        CCC issue/discovery/transfer/live-cell client
docs/                       protocol documentation
reports/                    verification status and limitations
```

## Verification boundary

The local protocol path is executed and green in this repository. A **funding-ready CKB testnet claim** still requires a real script deployment, real wallet transactions, public tx hashes, a public URL, and an unrelated tester. No placeholder hash or simulated Cell should be presented as testnet evidence.
