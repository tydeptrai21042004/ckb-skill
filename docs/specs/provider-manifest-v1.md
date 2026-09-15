# SkillPass Provider Manifest v1

A provider manifest is a public description of provider identity, accepted services, policies and verification endpoints. The manifest is Ed25519 signed for tamper evidence.

## Trust bootstrap

The manifest's embedded public key is not itself a trust anchor. A relying party must pin the provider public key or its `sha256:<hex>` SPKI fingerprint independently and call `verifyTrustedProviderManifest()`.

## Signature envelope

The signed envelope contains:

- `version`;
- `keyId`;
- `algorithm = Ed25519`;
- `manifestHash = sha256:<canonical-manifest-hash>`;
- `issuedAt`;
- optional `expiresAt`;
- signature value.

The signature covers the canonical envelope, while `manifestHash` commits to the unsigned manifest body.
