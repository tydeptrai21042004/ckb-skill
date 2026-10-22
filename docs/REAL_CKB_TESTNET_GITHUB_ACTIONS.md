# Real CKB Testnet GitHub Action — SkillPass

This patch adds **real, paid-by-testnet-CKB** deployment and lifecycle verification. No mocks are accepted as on-chain proof. The workflow is **manual** (`workflow_dispatch`) and exclusively connects to **Pudge Testnet** (`chain=ckb_testnet`).

## Dedicated testnet wallets — PUBLIC testnet signing key

| Role | Public testnet address |
| --- | --- |
| **Issuer / Alice / CI funding** | `ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqd8xp30mcsysa6psxaxzzugf2tlntyg78cg0agsy` |
| **Bob / final capability holder and code-cell owner** | `ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqdtdfshkjmg5erflrg7yp4s37u38uhddls4fudnz` |

Both public addresses are in `scripts/testnet-wallets.mjs`, along with **Alice's deliberately hardcoded disposable testnet private key**. This meets the no-GitHub-Secrets request, but it is an **insecure public wallet**: anyone who sees this code can take all testnet CKB from Alice. This is a demo only. Bob's private key is not committed. **Never use this pattern on mainnet.**

## Run once the funding is available

1. Copy the patch files into the root of the existing GitHub `ckb-skill` repository, retaining all existing source files.
2. **No Environment or GitHub Secret configuration is needed.** The public disposable testnet key is already part of the script. Do not deposit any real-value funds to its address.
3. Request faucet/testnet CKB for the **Issuer / Alice** address only: https://faucet.nervos.org/ . A typical Rust contract ELF can be tens to hundreds of KB, and CKB must reserve capacity for bytes stored on-chain. Start by requesting enough for compiled ELF bytes + approximately 2,000 CKB overhead; more may be needed if the binary is unusually large. Check the faucet's own limits before retrying. **Do not fund with mainnet CKB.**
4. Open GitHub **Actions → Real CKB Testnet — Deploy + Lifecycle → Run workflow**. This intentionally does not run on push or pull requests.
5. Inspect **Actions → run → Artifacts** and the job summary. `manifest.json`, `deployment.json`, and `providers/lifecycle-{before,after}.json` are published as **public on-chain evidence**. Check their hashes in the [Pudge explorer](https://pudge.explorer.nervos.org/).

## Exact acceptance gates

1. Offline provider/protocol tests and CKB client typecheck pass.
2. The actual Rust RISC-V Capability Type Script binary is built using pinned Rust `1.95.0`.
3. Before spending, both RPCs identify their network as `ckb_testnet`, and the hardcoded public testnet signer derives exactly the hardcoded funding address.
4. A real transaction deploys the **contract ELF Cell**, under Bob's separate lock so Alice's fee selector will not spend the dep cell. The returned on-chain Cell data must hash to the compiled binary's code hash. Uses `data2` and Cell dep `tx:0`.
5. A real on-chain issuance transaction creates a transferable Capability for Alice, with the existing Service Bundle service ID and current Type-ID derivation rule.
6. Two independently configured provider instances check **Alice allow / Bob deny** against live testnet Cells *before* the transfer.
7. A real transaction transfers the same typed Capability Cell from Alice to Bob. Both RPC-confirmed live/spent states and the inherited type/data are checked.
8. Both providers check **Alice deny / Bob allow** *after* transfer. The existing `scripts/testnet-evidence.mjs` independently verifies the generated evidence manifest using CKB RPC.
9. The job is green only when real confirmations and both phases pass. Wrong key/address match, wrong network, insufficient funds, RPC errors and incorrect on-chain states are hard failures.

## Output files

- `evidence/testnet/deployment.json` — on-chain contract code hash and dep outpoint
- `evidence/testnet/manifest.json` — deploy/issue/transfer tx hashes and pre/post Cell proofs
- `evidence/testnet/providers/lifecycle-before.json` — two provider decisions prior to transfer
- `evidence/testnet/providers/lifecycle-after.json` — two provider decisions after transfer
- `evidence/testnet/onchain-verification.json` — independent RPC evidence verification
- `evidence/testnet/run-summary.json` — only written on verified success
- `evidence/testnet/ci-stage.json` — incremental progress even on partial failure

These files are read-only blockchain evidence, not account credentials. The key is not written to the evidence files or CI logs, but it IS already public in the committed source file. Logs and evidence are not a security boundary.

## Important limitations

- **Not yet live-tested:** This patch was statically validated in an offline environment with no npm registry or public CKB RPC access. It cannot claim a deployed transaction or CI green status before the wallet is funded and the workflow has been run.
- The originally supplied repository snapshot omitted `.github/`, `package-lock.json`, and Rust `Cargo.lock` (although some project references expect lockfiles). This patch adds `.github/workflows/real-ckb-testnet.yml`; preserve other workflows and lockfiles already present in your own GitHub repository. If lockfiles are missing, generate and commit them for reproducibility. `npm install` is used here because the provided snapshot had no `package-lock.json`.
- The workflow deploys a **new contract instance on every manual run**, which locks testnet CKB capacity in Bob's code cell; avoid repeated runs without need. Bob's separate secret key is not included in this patch or CI. For a production pipeline, add a controlled redeploy/reuse mode with a pinned deployment hash and binary digest.
- Two independent provider **configurations** use two public RPC endpoints. They are still on the same CKB testnet, and both can be affected by network/RPC outages. This checks integration behavior, not proof of organizational or node ownership independence.
- This validates the on-chain SkillPass protocol, not a real Fiber payment or a production SaaS deployment. Those require distinct acceptance pipelines.

## Public-testnet key risk and run behavior

- The `TESTNET_FUNDING_PRIVATE_KEY` constant in `scripts/testnet-wallets.mjs` is visible to EVERYONE with repository read access. Public CI deployments can race with bots or other users spending the same funds. A `WAITING_FOR_FUNDS`/insufficient-balance failure does not prove contract failure.
- Only fund this disposable address with free testnet CKB, preferably immediately before a manual run. Anyone can take it.
- For any persistent funding or production code, replace the hardcoded key with a protected signer such as GitHub Actions secrets or an external key service.
