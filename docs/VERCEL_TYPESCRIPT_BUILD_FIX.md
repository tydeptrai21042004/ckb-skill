# Vercel TypeScript backend build fix

## Symptom

The Vite frontend builds successfully, then Vercel fails while type-checking the Node service entrypoint with errors such as:

```text
server.ts(1,18): error TS2307: Cannot find module 'node:http' or its corresponding type declarations.
server.ts(2,28): error TS2307: Cannot find module 'node:crypto' or its corresponding type declarations.
server.ts(...): error TS2580: Cannot find name 'Buffer'.
```

## Root cause

`apps/live-service/server.ts` and `apps/fiber-facilitator/server.ts` are TypeScript Node entrypoints, but the service workspaces did not declare Node type definitions. Vercel therefore type-checked the files without `@types/node`.

A second issue appears after adding Node types when strict TypeScript tries to infer the adjacent runtime-only `server.mjs` module. The wrapper now loads that module through a typed dynamic boundary so the TypeScript entrypoint stays strict without forcing the whole `.mjs` runtime to be converted to TypeScript.

## Fix applied

- Pin Vercel/Node to `24.x` in the root and service package manifests.
- Add exact `@types/node` and TypeScript build dependencies to both Node service workspaces.
- Add Node-specific `tsconfig.json` files using `NodeNext` resolution.
- Keep `server.mjs` as the runtime implementation and type only its exported HTTP server at the wrapper boundary.
- Apply the same fix to the Fiber facilitator so it does not fail immediately after the API service is fixed.

## Redeploy

Push the corrected files and trigger a fresh Vercel deployment. The relevant backend build stage should no longer report `TS2307`, `TS2580`, or `TS7016` for either service entrypoint.

The frontend chunk-size message from Vite is a performance warning and is not the cause of the failed deployment.

## npm install-script warning

The deployment log also reports `esbuild@0.25.12` as an install-script dependency not yet covered by `allowScripts`. The repository now explicitly approves only that exact esbuild version in the relevant package manifests. This is intentionally narrow; do not replace it with a global allow-all-scripts setting.

## Local pre-deploy check

After installing dependencies, run:

```bash
npm run typecheck:vercel
npm test
npm run build:web
npm run security:preflight
```
