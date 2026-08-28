# SkillPass v0.4 — Portable CKB Service Rights + Fiber/x402 Payments

SkillPass is a research/product prototype for **portable digital service rights on CKB**.
A provider issues a capability as a CKB Cell. The current live Cell owner is authorized to use the protected service. A valid transfer moves that authorization to the new owner without updating a centralized entitlement row.

v0.4 keeps that second condition and makes the real CKB + x402/Fiber path deployable with one command: a service request may also require an **x402-v2-style payment completed over Fiber**. Payment never replaces authorization: the request must satisfy both the payment rule and the current CKB capability rule.

## Developer quick start

For most contributors, use the stable root commands instead of running files inside `apps/` directly:

```bash
npm run setup
npm run dev
```

Open `http://127.0.0.1:8787/`. Before committing, run `npm run check`.

For the most reproducible handoff, Docker is a second supported entry point:

```bash
docker compose -f deploy/compose.demo.yaml up --build
```

See [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) and [`CONTRIBUTING.md`](CONTRIBUTING.md).

```text
user / AI agent
     |
     | HTTP request
     v
x402-style 402 challenge ----> Fiber invoice/payment
     |                              |
     | PAYMENT-SIGNATURE            v
     +------------------------> payment verification
                                    |
                                    v
                            SkillPass verifier
                               |          |
                               |          +--> payment not replayed
                               v
                       current CKB live Cell
                               |
                         current owner?
                               |
                               v
                         protected service
```

## Important research positioning

The **Fiber x402 facilitator itself is not claimed as SkillPass novelty**. Nervos/Fiber has an official agent-payment design and an x402 facilitator MVP draft/PR. SkillPass uses a small compatibility harness so the repository is independently reproducible, while the actual research question is:

> Can a provider-authorized service right remain portable and independently verifiable from CKB state while high-frequency payment is handled by Fiber/x402, without restoring a provider-owned entitlement database?

See [`docs/research-gap-and-funding.md`](docs/research-gap-and-funding.md).

## Fastest deployment

If you only want a working reviewer/demo instance and already have Docker:

```bash
chmod +x deploy.sh
./deploy.sh demo
```

For real CKB testnet configuration:

```bash
./deploy.sh init-testnet
# fill/import real contract deployment metadata
./deploy.sh doctor
./deploy.sh testnet
```

For an optional self-hosted official Fiber node:

```bash
./deploy.sh fiber-init /secure/path/to/ckb-private-key
./deploy.sh testnet-fiber
```

`fiber-init` never funds the key or opens channels. See [`DEPLOY.md`](DEPLOY.md).

## One-command setup + verification

On Linux, macOS, or WSL:

```bash
chmod +x run_all.sh
./run_all.sh
```

`run_all.sh` detects the OS/CPU and then:

1. uses system Node.js when it is >=22, otherwise downloads a portable Node 22 into `.tooling/`;
2. installs a local Rust toolchain pinned by this project and the CKB RISC-V target;
3. installs the isolated npm dependencies for the CCC client, React app, and live service;
4. bootstraps safe config templates;
5. runs the complete Node test suite;
6. runs the basic HTTP smoke test;
7. runs the x402/Fiber facilitator smoke test;
8. runs the combined **payment + capability + transfer** smoke test;
9. type-checks the CCC client;
10. builds the React/CCC frontend;
11. writes a benchmark report;
12. builds/tests the CKB Type Script.

Useful variants:

```bash
./run_all.sh --no-rust        # fastest JS/local verification
./run_all.sh --serve          # verify everything, then open local demo on :8787
./run_all.sh --with-offckb    # also install OffCKB locally
./run_all.sh --with-fiber     # also install current official Fiber FNN locally
./run_all.sh --skip-install   # reuse already-installed dependencies
```

`--with-fiber` installs software only. It deliberately does **not** create/fund channels or move assets.

## Local product demo

```bash
npm run dev
```

Open `http://127.0.0.1:8787/`.

The UI supports both:

- capability-only access; and
- a local mock of `402 -> Fiber payment -> retry -> capability authorization`.

The deterministic combined smoke test proves:

```text
402 quote
  -> unpaid request rejected
  -> payment marked paid
  -> Alice paid access succeeds
  -> same payment replay rejected
  -> capability transferred Alice -> Bob
  -> Alice can pay but is still rejected as NOT_OWNER
  -> Bob pays with a fresh quote and succeeds
```

This is **simulation evidence**, not a claim of a real Fiber payment or CKB testnet deployment.

## Current automated evidence

The dependency-free Node path currently contains **38 tests** plus three HTTP/integration smoke paths. The local benchmark writes results to `reports/benchmarks/latest.md`.

Run:

```bash
npm test
npm run smoke:http
npm run smoke:fiber
npm run smoke:paid
npm run benchmark
```

For the complete environment:

```bash
npm run verify:full
```

## Real CKB/Fiber path

The live CKB path uses **CCC** for wallet/transaction integration and the Rust CKB Type Script for capability invariants. The Fiber adapter uses FNN JSON-RPC (`new_invoice`, `get_invoice`, etc.).

Start with `./deploy.sh init-testnet`, then `./deploy.sh doctor`. The live service now supports the real paid path directly: it preflights current capability ownership, returns an x402 v2 `402`, verifies Fiber payment through the facilitator, verifies the signed CKB challenge and live Cell again, then settles before returning the protected result.

For a local FNN receiver endpoint:

```bash
FIBER_BACKEND=fnn \
FIBER_RPC_URL=http://127.0.0.1:8227 \
npm run facilitator
```

A real paid E2E requires funded Fiber peers/channels. It is intentionally not auto-created by `run_all.sh` because that is a network/asset operation.

See [`DEPLOY.md`](DEPLOY.md) and [`HOW_TO_VERIFY.md`](HOW_TO_VERIFY.md).

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

Type Script args:

```text
issuer_id || capability_id
```

Creation uses a Type-ID-style identity:

```text
CKB_HASH(serialized first CellInput || uint64_le(capability_output_index))
```

The transfer keeps capability identity/service/issuer/expiry/flags immutable while ownership moves via the Cell lock.

## Repository layout

```text
apps/demo-service/           local clickable API/UI and combined paid-access demo
apps/fiber-facilitator/      small x402/Fiber compatibility server (mock or FNN RPC)
apps/web/                    React + CCC real-CKB frontend
apps/live-service/           live CKB + x402/Fiber protected-service backend
contracts/capability-type/   CKB Rust Type Script + ckb-testtool tests
packages/capability-codec/   browser/server 106-byte codec
packages/protocol-core/      deterministic capability transition rules
packages/verifier/           ownership + challenge/replay verification model
packages/ckb-client/         CCC issue/discovery/transfer/live-cell helpers
packages/x402-fiber/         experimental x402-v2/Fiber compatibility layer
deploy/                      Docker Compose demo/testnet/Fiber profiles
deploy.sh                     one-command deployment/doctor/log/status helper
scripts/                     bootstrap, smoke, benchmark, release, verification
docs/                        protocol + research documentation
reports/                     benchmark, limits, verification matrix
```

## External technical references

- CCC: https://github.com/ckb-devrel/ccc
- Fiber: https://github.com/nervosnetwork/fiber
- Fiber agent/x402 design: https://github.com/nervosnetwork/fiber/issues/1255
- Fiber x402 facilitator draft: https://github.com/nervosnetwork/fiber/pull/1301
- x402 v2 specification: https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md

## Claim boundary

This repository is a **funding/research-ready prototype**, not a production-security certification. Do not label it mainnet-ready until the Type Script is independently reviewed, real CKB/Fiber transactions are published, real replay/state storage is productionized, and unrelated users reproduce the flow.
