# Contributing to SkillPass

The project keeps the contributor workflow intentionally small. A new developer should only need Node.js 22+ for native development, or Docker for the reproducible demo.

## First run

```bash
npm run setup
npm run dev
```

Open <http://127.0.0.1:8787>.

Windows PowerShell/cmd users can use the same npm commands. Linux/macOS/WSL users may also run `./dev.sh setup` and `./dev.sh demo`.

## Stable developer commands

| Command | Purpose |
|---|---|
| `npm run setup` | Create local config without overwriting existing files and install JS dependencies |
| `npm run dev` | Run the deterministic local product demo |
| `npm run dev:web` | Run the React + CCC frontend with Vite |
| `npm run dev:facilitator` | Run the local Fiber/x402 facilitator |
| `npm run dev:live` | Run the real CKB-backed service; requires valid testnet config |
| `npm test` | Fast protocol/unit tests |
| `npm run check` | Doctor + tests + typecheck + production web build |
| `npm run docker:demo` | Run the reproducible demo through Docker |
| `npm run clean` | Remove generated JS dependencies/build output |

Do not make developers memorize paths such as `apps/.../server.mjs`; add or preserve a stable root command instead.

## Configuration

- `.env.example` is safe local/demo configuration.
- `.env.testnet.example` documents every testnet/live variable.
- `.env`, `.env.testnet`, and `.env.live` are local and must never be committed.
- `deployments/*.example.json` are templates; real deployment JSON stays local.

## Before opening a pull request

Run:

```bash
npm run check
```

For contract changes also run:

```bash
npm run verify:contract
```

For the widest reproducibility check on Linux/macOS/WSL:

```bash
./run_all.sh
```

## Change boundaries

Keep these layers separate:

1. `packages/protocol-core` — deterministic capability transition rules.
2. `packages/capability-codec` — serialized capability format.
3. `packages/verifier` — ownership/challenge verification model.
4. `packages/ckb-client` — CCC/CKB integration.
5. `packages/x402-fiber` — payment compatibility layer.
6. `apps/*` — runnable products/services only.

Business/protocol logic should live in packages rather than being duplicated across app entry points.
