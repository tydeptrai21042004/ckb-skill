# Vercel CCC type-identity fix

Vercel can install more than one physical copy of `@ckb-ccc/core` because the React connector and `@ckb-ccc/ccc` have independent dependency graphs. CCC signer/transaction classes then become incompatible to TypeScript even when their APIs look identical.

For browser code, SkillPass now uses `ccc` from `@ckb-ccc/connector-react` consistently in both `apps/web` and `packages/ckb-client/src/live.ts`. `@ckb-ccc/ccc` remains available only for framework-independent helpers such as `challenge.ts`.

Do not change `live.ts` back to `@ckb-ccc/ccc` unless all CCC packages are proven to resolve to one identical `@ckb-ccc/core` version.
