# SkillPass v1.7.0 — Funding Candidate

This release freezes the pre-funding product surface and focuses on reproducibility, provider independence, and safe verification.

## Key changes

- Restores all checked-in environment templates, `.gitignore`, `.dockerignore`, and security CI to release artifacts.
- Adds Node/Rust toolchain pins and Apache-2.0 licensing.
- Makes the provider verification dependency chain publishable (`capability-codec`, `service-rights`, `provider-verifier`).
- Adds a safe high-level provider verifier that validates the accepted Capability Type Script deployment, Capability data/type identity, and a provider confirmation threshold before authorization.
- Makes provider-manifest timestamps strict and bounded.
- Rejects reserved gateway claims that could alter assertion envelope fields.
- Uses one confirmation as the live/public default rather than zero-confirmation authorization.
- Makes the release script fail if critical hidden assets are missing and verifies them in the produced ZIP.
- Adds a single `verify:funding-candidate` gate for Node/security/workspace/build checks.

## Deliberately unchanged

Capability Cell binary layout and burn semantics are unchanged. Those are protocol-level decisions and should not be silently changed in a repository-hardening release.

## Remaining external gate

The registry-resolved `package-lock.json` and Rust `Cargo.lock` must be generated with registry access/toolchains and then committed before a production-grade tagged release.
