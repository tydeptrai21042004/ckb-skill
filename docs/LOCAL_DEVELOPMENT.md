# Local development — ZIP/folder workflow

SkillPass does **not** require a GitHub checkout. Work directly from the project folder you received.

## 1. Extract and enter the folder

```bash
unzip ckb-skill-main.zip
cd ckb-skill-main
```

If the folder is already extracted, just open a terminal in it.

## 2. Check Node

```bash
node --version
npm --version
```

Use Node.js 22 or newer. The repository includes `.nvmrc` with `22` for version managers that support it.

## 3. One-time setup

```bash
npm run setup
```

This creates local configuration from the included templates and installs the JavaScript dependencies from npm. It does not clone or push source code anywhere.

## 4. Run the deterministic demo

```bash
npm run dev
```

Open `http://127.0.0.1:8787`.

The deterministic demo requires no wallet, no testnet CKB, and no real Fiber funds. It is intended for fast feature verification.

## 5. Run quality checks

```bash
npm run check
```

This runs the environment report, Node tests, CKB client type checking, and a production frontend build.

## 6. Docker-only demo

If you prefer not to install npm dependencies on the host:

```bash
./deploy.sh demo
```

The published HTTP port binds to `127.0.0.1` by default.

## 7. Live CKB testnet development

For live verification, copy real testnet deployment metadata into `deployments/testnet.json` or `.env.testnet`, then follow `DEPLOY_STEP_BY_STEP.md`.

Important: the live service verifies the **current live Capability Cell** and a fresh wallet challenge. Never add a server-side user private key to make testing easier.

## Common commands

| Command | Purpose |
|---|---|
| `npm run setup` | Create safe local config and install dependencies |
| `npm run dev` | Deterministic local demo |
| `npm test` | Node test suite |
| `npm run check` | Tests + type checks + production web build |
| `npm run dev:web` | Vite/CCC frontend development |
| `npm run dev:facilitator` | Standalone local facilitator |
| `./deploy.sh demo` | Docker demo |
| `./deploy.sh init-testnet` | Create private testnet config |
| `./deploy.sh doctor` | Validate testnet config |
| `./deploy.sh testnet` | Start CKB testnet profile |

## Cleanup

```bash
npm run clean
```

This removes installed JavaScript dependencies and generated frontend output. It deliberately preserves local configuration and runtime state.
