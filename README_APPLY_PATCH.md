# SkillPass real CKB testnet GitHub Actions — no-secret demo patch

This patch is for **disposable public Pudge testnet funds only**. Add its `.github/`, `scripts/`, `tests/`, and `docs/` files to your existing repository. It does not overwrite your existing contract or services.

No GitHub Environments, GitHub Secrets, or repository variables are required. After pushing the patch, fund the *Alice* address documented in `docs/REAL_CKB_TESTNET_GITHUB_ACTIONS.md` using testnet CKB and run **Actions → Real CKB Testnet — Deploy + Lifecycle → Run workflow**. The workflow stays manual to avoid wasting funds.

**SECURITY WARNING:** Alice's **private signing key is hardcoded** in `scripts/testnet-wallets.mjs` and will become publicly accessible when you push the file to a public repo. Anyone can spend all testnet funds deposited to that address, possibly before your Action runs. Never deposit real money or mainnet CKB. Never treat this as a secure deployment pattern. Bob's key is *not* included in this patch.

**Verification status:** offline workflow/configuration checks and TypeScript syntax compilation only. Live RPC transactions were not tested here.
