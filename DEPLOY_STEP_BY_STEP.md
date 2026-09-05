# SkillPass deployment — step by step

This guide is written for a **local ZIP/folder workflow**. You do not need to connect this project to GitHub, create a repository, or push any code.

## What the deployment contains

The live stack has three logical parts:

1. **SkillPass live service** — verifies wallet challenges and current CKB Capability Cells, serves the web UI, and protects the analysis endpoint.
2. **x402/Fiber facilitator** — creates Fiber invoices, verifies paid status, settles one-use payment receipts, and persists replay state.
3. **Fiber node** — optional in the Compose stack. You can point the facilitator at an existing trusted FNN node instead.

The application never needs a user's wallet private key. A self-hosted Fiber node has its own operator key; importing that key is an explicit operator action.

---


### Windows equivalent

Every `./deploy.sh ...` command in this guide has a native Windows equivalent through `deploy.cmd` (or `deploy.ps1`). For example:

```bat
deploy.cmd demo
deploy.cmd init-testnet
deploy.cmd doctor
deploy.cmd testnet
deploy.cmd backup-state testnet
```

No Bash/WSL layer is required for those deployment commands.

## A. Fastest path: deterministic local demo

### A1. Requirements

Install Docker with Compose v2, then from this project folder run. Node.js is optional for this Docker path; the helper uses it for an extra host-side smoke check when available.

```bash
./deploy.sh demo
```

### A2. Open the app

Open:

```text
http://127.0.0.1:8787
```

The mock facilitator is intentionally bound to localhost and its development payment endpoint is enabled only in this demo profile.

### A3. Check status

```bash
./deploy.sh status demo
./deploy.sh smoke demo
```

Stop it with:

```bash
./deploy.sh stop demo
```

---

## B. Prepare a CKB testnet deployment

### B1. Create private config

```bash
./deploy.sh init-testnet
```

This creates `.env.testnet` from the included template, sets restrictive file permissions when supported, and generates `FACILITATOR_AUTH_TOKEN` locally.

### B2. Deploy the Capability Type Script

The repository contains the contract source under:

```text
contracts/capability-type/
```

Build and verify it with the CKB/RISC-V toolchain you trust. Contract deployment itself is intentionally **not silently automated**, because the deployment transaction spends the operator's CKB and must be signed deliberately.

After the real testnet deployment, record these values:

```text
CAPABILITY_CODE_HASH
CAPABILITY_HASH_TYPE
CAPABILITY_DEP_TX_HASH
CAPABILITY_DEP_INDEX
```

You may put them in `deployments/testnet.json` and rerun `./deploy.sh init-testnet`, or edit `.env.testnet` directly.

### B3. Configure the public URL

For local-only use:

```dotenv
SKILLPASS_BIND=127.0.0.1
PUBLIC_BASE_URL=http://127.0.0.1:8787
TRUST_PROXY=false
```

For a public domain behind a trusted HTTPS reverse proxy:

```dotenv
SKILLPASS_BIND=127.0.0.1
PUBLIC_BASE_URL=https://skillpass.example.com
TRUST_PROXY=true
```

Only set `TRUST_PROXY=true` when requests really pass through a reverse proxy that you control and that overwrites forwarded headers.

### B4. CKB RPC

You can leave this blank to use CCC's public-testnet default:

```dotenv
CKB_RPC_URL=
```

Or set a trusted CKB testnet HTTP RPC endpoint:

```dotenv
CKB_RPC_URL=https://your-testnet-rpc.example
```

---

## C. Choose the Fiber payment backend

### C1. Staging mode — mock backend

Use this only to validate the product flow:

```dotenv
FIBER_BACKEND=mock
FIBER_NETWORK=testnet
FIBER_PAYMENT_PROOF=invoice-status
```

The testnet Compose profile does **not** enable `/dev/pay` by default. That shortcut exists only in the deterministic demo/smoke profile.

### C2. Real Fiber node — external FNN

Point the facilitator at an already running node:

```dotenv
FIBER_BACKEND=fnn
FIBER_NETWORK=testnet
FIBER_RPC_URL=http://host.docker.internal:8227
FIBER_RPC_TOKEN=
```

Keep the FNN RPC private. Do not expose the raw node RPC to the public internet just to make the browser work; the browser talks to SkillPass, and SkillPass talks to the private facilitator/FNN path.

### C3. Real Fiber node — bundled Docker profile

Initialize the local Fiber runtime explicitly:

```bash
./deploy.sh fiber-init /absolute/path/to/your/ckb-private-key
```

This copies the operator key to:

```text
.runtime/fiber-node/ckb/key
```

It does not create funds, transfer CKB, or open channels. Fund the Fiber operator wallet and open/manage channels explicitly with the official Fiber tooling.

Then run:

```bash
./deploy.sh testnet-fiber
```

The default image version in this package is Fiber `0.9.0`; change `FIBER_VERSION` deliberately when you have reviewed a newer release and its migration notes.

---

## D. Choose payment-proof mode

### Recommended compatibility mode

```dotenv
FIBER_PAYMENT_PROOF=invoice-status
```

The trusted receiver-side FNN checks whether the invoice is paid. This is the default and most compatible mode.

### Stronger optional mode

```dotenv
FIBER_PAYMENT_PROOF=preimage
```

The payer must additionally submit the 32-byte successful payment preimage (`0x` + 64 hex characters). The facilitator hashes it with SHA-256 and compares it to the invoice payment hash before consulting paid status.

This mode is intentionally opt-in because Fiber's upstream x402/preimage integration work is still evolving. Use it only when your payment tool can return the successful preimage safely.

---

## E. Validate configuration before deployment

Run:

```bash
./deploy.sh doctor
```

It checks:

- Capability script hashes and dep index;
- facilitator secret;
- amount, payment timeout, and delivery-receipt retention ranges;
- testnet network selection;
- Fiber backend and RPC URL;
- payment-proof mode;
- public URL and proxy mode;
- CKB RPC URL format;
- whether the application is being exposed beyond loopback.

Do not continue until all `[FAIL]` entries are fixed.

---

## F. Start the testnet application

With an external Fiber node or mock staging backend:

```bash
./deploy.sh testnet
```

With the bundled Fiber profile:

```bash
./deploy.sh testnet-fiber
```

The helper waits for container health and runs an HTTP smoke check automatically.

Useful commands:

```bash
./deploy.sh status testnet
./deploy.sh logs testnet
./deploy.sh logs testnet skillpass
./deploy.sh logs testnet facilitator
./deploy.sh smoke testnet
./deploy.sh stop testnet
```

For the bundled Fiber profile, replace `testnet` by `testnet-fiber`.

---

## G. Persistent state and backups

The hardened testnet Compose profile persists:

- facilitator replay/settlement state in `testnet_facilitator_state`;
- SkillPass payment quotes and successful delivery receipts in `testnet_skillpass_state`.

This fixes two important restart cases: a paid invoice is not forgotten after a service restart, and an already settled request whose HTTP response was lost can return the stored result after fresh wallet/capability authentication. The facilitator's `/settle` operation is idempotent, so the side-effect-free analyzer can also recover the narrow case where payment was consumed just before the service process stopped but before its delivery receipt was written.

Paid delivery receipts contain the protected result. They are automatically pruned after `SERVICE_RECEIPT_TTL_SECONDS` (default `86400`, 24 hours; supported range 60 seconds to 30 days). Secure this state volume and choose retention according to your privacy/retry requirements.

Before deleting Docker volumes or moving hosts, export SkillPass application state with:

```bash
./deploy.sh backup-state testnet
```

Windows:

```bat
deploy.cmd backup-state testnet
```

This writes a timestamped directory under `backups/` and intentionally excludes secrets and live Fiber channel storage. For a self-hosted Fiber node, use the official Fiber release's backup/restore procedure before upgrades rather than treating a hot directory copy as a safe channel backup.

The included JSON stores are deliberately **single-process**. Before horizontally scaling SkillPass/facilitator replicas, replace them with a shared datastore that provides atomic compare-and-set/unique-key semantics for replay consumption.

---

## H. Public production checklist

Before exposing SkillPass publicly:

- keep `ENABLE_PUBLIC_ISSUE=false` unless public issuance is a deliberate product feature;
- use a real Capability Type Script deployment and verify its code hash;
- use `FIBER_BACKEND=fnn` for real payment evidence;
- keep FNN/facilitator administration private;
- put HTTPS at a trusted reverse proxy;
- keep `SKILLPASS_BIND=127.0.0.1` when the proxy runs on the same host;
- set `PUBLIC_BASE_URL` to the canonical HTTPS origin;
- use `TRUST_PROXY=true` only behind that trusted proxy;
- preserve the generated facilitator secret;
- back up persistent state;
- run `npm test`, `npm run check`, `./deploy.sh doctor`, and the relevant smoke test before release;
- never place a user's wallet private key in the web or SkillPass service.

---

## I. Troubleshooting

### `.env.testnet` is missing

```bash
./deploy.sh init-testnet
```

### `CAPABILITY_CODE_HASH` fails doctor

The placeholder is still present. Enter the real 32-byte code hash from your deployed testnet Type Script.

### Facilitator is healthy but payment never verifies

Check:

```bash
./deploy.sh logs testnet facilitator
```

Then confirm `FIBER_BACKEND`, `FIBER_RPC_URL`, invoice paid status, and `FIBER_PAYMENT_PROOF`. With `preimage`, the client must provide the successful preimage.

### Browser can open the site but payment resource URL is wrong

Set the canonical external URL explicitly:

```dotenv
PUBLIC_BASE_URL=https://your-domain.example
```

Do not rely on arbitrary Host/X-Forwarded headers.

### Need a clean dependency reinstall

```bash
npm run clean
npm run setup
npm run check
```

This still works entirely from the local project folder; no GitHub repository connection is required.
