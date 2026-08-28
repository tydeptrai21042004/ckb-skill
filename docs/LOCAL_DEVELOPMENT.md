# Local development and handoff

## Choose one path

### Path A — native Node.js (best for contributors)

Prerequisite: Node.js 22+.

```bash
git clone <repo-url>
cd ckb-skill
npm run setup
npm run dev
```

Open <http://127.0.0.1:8787>.

`npm run setup` is idempotent: it creates missing config files and installs dependencies, but it does not overwrite an existing `.env` or deployment file.

### Path B — Docker only (best for reviewers and reproducibility)

Prerequisite: Docker Desktop/Engine with Compose v2.

```bash
git clone <repo-url>
cd ckb-skill
docker compose -f deploy/compose.demo.yaml up --build
```

Open <http://127.0.0.1:8787>.

This path does not require a host Node/Rust install.

## Development modes

| Goal | Command | Notes |
|---|---|---|
| Clickable deterministic demo | `npm run dev` | No real chain or funds |
| React/CCC frontend | `npm run dev:web` | Vite on port 5173 |
| Fiber compatibility service | `npm run dev:facilitator` | Mock by default |
| Live CKB service | `npm run dev:live` | Needs real deployment metadata |
| Full Docker demo | `npm run docker:demo` | Most reproducible |
| Readiness report | `npm run doctor` | Never mutates keys/funds |
| Contributor gate | `npm run check` | Tests + typecheck + web build |

## Real CKB testnet

```bash
./deploy.sh init-testnet
# edit .env.testnet and/or deployments/testnet.json
./deploy.sh doctor
./deploy.sh testnet
```

The checked-in `.env.testnet.example` is documentation, not a real secret file. `init-testnet` creates `.env.testnet` and generates the facilitator authentication token when needed.

## Real Fiber

Real Fiber is intentionally separate from the zero-risk developer bootstrap because it may involve a wallet, funding, and channels.

```bash
./deploy.sh fiber-init /secure/path/to/ckb-private-key
./deploy.sh testnet-fiber
```

The setup command does not fund a wallet or open channels automatically.

## Handoff checklist

A release/ZIP intended for another developer should contain:

- source code;
- `package.json`;
- `.nvmrc`;
- `.env.example` and `.env.testnet.example`;
- Dockerfiles and Compose files;
- `CONTRIBUTING.md`;
- this local-development guide;
- tests and CI configuration;
- example deployment metadata only.

It should not contain:

- `.env`, `.env.testnet`, private keys, tokens, or wallet files;
- `.runtime/` Fiber state;
- `.tooling/` downloaded compilers/runtimes;
- `node_modules/`;
- generated frontend `dist/` output unless making a separate binary/static release artifact.

## Maintenance rule

If adding a new service or package changes how developers start or validate the project, update the root `npm` commands first. Internal paths may change; contributor commands should remain stable.
