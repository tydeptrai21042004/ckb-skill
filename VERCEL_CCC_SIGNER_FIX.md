# Vercel CCC Signer build fix

## Failure

Vercel TypeScript reported that a `Signer` from the CCC connector tree was not assignable to a `Signer` from the direct CCC/core tree. CCC `Signer` contains protected state, so TypeScript treats two independently installed copies as nominally incompatible even when their public APIs look identical.

## Root cause

`apps/web/src/App.tsx` obtains its wallet signer from `@ckb-ccc/connector-react`, while `packages/ckb-client/src/live.ts` had been changed to import `ccc` from `@ckb-ccc/ccc`. The public functions in `live.ts` therefore required a different `ccc.Signer` class than the one returned by the React connector.

## Fix

- `packages/ckb-client/src/live.ts` again imports `ccc` from `@ckb-ccc/connector-react`.
- `packages/ckb-client/package.json` pins `@ckb-ccc/connector-react` to the exact same `1.1.9` version as the web app.
- Backend/server code can continue to use `@ckb-ccc/ccc`; only the browser-facing signer boundary must share the connector's class family.
- `allowScripts` was removed from `apps/web/package.json` because npm ignores it in workspaces and was centralized at the root for both esbuild versions observed in the Vercel install log.
- `tests/ccc-type-coherence.test.mjs` prevents the signer-family mismatch from being reintroduced.
- `dependency-versions.lock.json` was regenerated.

## Apply

Overlay the files in this ZIP at the repository root, commit, and redeploy. For a clean local verification use:

```bash
rm -rf node_modules apps/web/node_modules packages/ckb-client/node_modules
npm install
npm run verify:dependency-lock
node --test tests/ccc-type-coherence.test.mjs
npm run build:web
```

If Vercel still restores a stale dependency layout after the commit, redeploy once with **Clear build cache**. The source-level mismatch itself is fixed by this patch; clearing cache is only for an old cached `node_modules` tree.
