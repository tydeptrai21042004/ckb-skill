# SkillPass funding-readiness patch

This patch restores the hidden release/configuration files that were missing from the supplied ZIP and adds release gates for funding evidence.

It intentionally does **not** contain fabricated Testnet transaction hashes, deployment identifiers, provider signatures, wallet/private keys, Vercel/Neon credentials, or a hand-written npm/Cargo lockfile.

## Apply

Extract this ZIP into the repository root, preserving paths and dotfiles.

For Testnet local setup:

```bash
./setup-funding-env.sh testnet
# edit the real CAPABILITY_* values
./deploy.sh doctor
```

For a final funding candidate on a networked Node 24 + Rust 1.95.0 machine:

```bash
./prepare-funding-release.sh
npm run evidence:testnet:require
npm run evidence:verify
```

For Vercel, use the existing hardened generator instead of manually creating secrets:

```bash
./generate-vercel-env-zero-input.sh
# or
./setup-vercel.sh
```
