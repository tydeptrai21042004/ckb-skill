# SkillPass technical-debt patch (changed files only)

Apply the contents of this ZIP **over the repository root**, preserving every other file. This package is derived from `ckb-skill-main(3).zip` provided on 24 October 2026. It is not a standalone project.

## Implemented changes

- **SP-01:** stronger live Pudge lifecycle: wait for both configured RPC endpoints, optionally reuse a byte-verified deployed contract, require `dead` instead of merely `not live` for consumed Cells, verify committed transactions and their confirmation thresholds, confirm deployed ELF SHA-256 from real chain data, record source SHA and Actions run ID.
- **SP-02:** execute Provider A and Provider B's policy checks in distinct Node processes with separate RPC configs. A negative is a pass **only** when the reason is correct (`NOT_OWNER` before transfer, `CELL_NOT_LIVE` for spent Alice Cell after transfer). These checks still supply requester lock hashes; they do not prove wallet-key control or organizational independence.
- **SC-01/SC-02:** add reusable `@skillpass/care-bridge` and CKB owner adapter, with fail-closed authorization, signature-verification callback, repeated live Cell checks, conditional quota-commit interface, and tests for Alice → Bob continuity, replay and race rejection. **This code is not yet integrated into the external Care repository; tests use controlled in-memory state.**
- **REL-01:** add independent lightweight regression workflow for push/PR and expanded lifecycle CI gates. The real workflow uses `npm ci` if a lockfile exists and warns if one is missing. No fabricated `package-lock.json` or `Cargo.lock` is included because the uploaded archive omits them and the registry/toolchain was unavailable.
- **Evidence:** successful GitHub Actions runs/logs/artifacts count as evidence for the **checks they actually execute**. On-chain proof remains gated by successful real RPC verification; no new manual evidence document is mandatory.

## Verification in this patch's environment

```bash
node --test tests/lifecycle-assertions.test.mjs tests/ci-provider-worker.test.mjs tests/testnet-workflow-config.test.mjs packages/care-bridge/test/bridge.test.mjs
node scripts/dependency-lock.mjs --check
```

The targeted suite ran successfully (15/15). No real CKB transactions were submitted here and no new green GitHub Actions run can be claimed. Full npm/Rust CI requires the dependencies, toolchains and funded Pudge wallet.

## To complete the remaining work

1. Commit this patch. Check **SkillPass Provider + Care Regression Gates** on the resulting PR/push.
2. Generate and commit `package-lock.json` under Node 24 (`npm install --package-lock-only --ignore-scripts`) and `contracts/capability-type/Cargo.lock` under the project Rust toolchain; run the full funding verification gates. Preserve pre-existing lockfiles if they already exist in GitHub.
3. Manually run **Real CKB Testnet — Deploy + Lifecycle** using a funded disposable testnet wallet (optionally set `deployment_file` to a previously verified committed deployment descriptor); verify the exact expected conditions in the Actions summary and on-chain artifacts. Do **not** use the public testnet signing key for anything of value.
4. Wire `scripts/ckb-care-owner-adapter.mjs` and `@skillpass/care-bridge` into the separate SkillPass Care repo with Care's persistent quota transaction and actual wallet-signed nonce replay store; run a separate full Testnet Care lifecycle.
5. Complete wallet-signed Bob HTTP request proof and at least one genuinely **externally operated** provider test before marking SP-02/SP-07 fully closed.

**Not claimed:** independent external operator, production Care pilot, any Testnet run executed here, or atomicity between a Care database and CKB consensus.
