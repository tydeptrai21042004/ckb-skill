# Grant-ready verification snapshot — 2026-09-15

## Results

- Full repository Node test suite: **213 / 213 passed**.
- Grant-readiness suite: **8 / 8 passed**.
- Security preflight: **PASS**.
- Workspace dependency declaration check: **PASS** (13 local packages).
- Deployment syntax/runtime syntax check: **PASS**.
- Execution-lease evidence: **100 concurrent acquisition attempts -> 1 winner -> 1 protected side effect -> 0 duplicate executions**.

The execution evidence is stored in `reports/benchmarks/execution-lease-concurrency.json` and can be regenerated with:

```bash
npm run evidence:concurrency -- 100
```

## Important environment note

The verification environment available for this revision ran Node `v22.16.0`. The repository itself remains pinned to Node `24.x`, container images/tests require Node `24.20.0`, and CI is configured for Node `24.20.0`. A clean online Node 24 CI run should be used as the release gate before publishing a funding/mainnet candidate.

## npm transitive lock note

The repository has exact direct dependency versions and `dependency-versions.lock.json`, but a root npm `package-lock.json` could not be generated in the offline verification environment. Generate and commit it from an online Node 24 environment before a high-risk production/mainnet release; see `docs/NPM_LOCKFILE.md`.


## Recheck against latest uploaded baseline

Compared against `ckb-skill-main (2)(1).zip` on 2026-09-15. The baseline contains none of the grant-readiness additions and differs in 14 existing files; the corrected revision also adds 22 files (including `docs/FINAL_REQUIREMENTS_CHECKLIST.md`). No baseline file needs deletion.

A clean extracted ZIP without workspace installation reports missing local workspace packages for provider-verifier tests. After reproducing the workspace links that normal `npm install`/`npm ci` creates, the full suite passes **213/213**. This is a packaging/install-state distinction, not a runtime regression.

`npm run verify:grant-ready`, `npm run security:preflight`, `npm run verify:workspaces`, and `npm run verify:deploy` all pass. A fresh 100-way concurrency run again produced **1 lease winner, 1 protected side effect, 0 duplicate executions**.

The Rust contract build could not be executed in this verification container because `cargo` is not installed. Run the contract CI/Docker verification before claiming the Rust release gate complete.
