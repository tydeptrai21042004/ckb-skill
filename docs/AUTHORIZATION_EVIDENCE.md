# SkillPass Authorization Evidence

SkillPass can turn a successful authorization decision into an exportable proof artifact without persisting the protected request body. Phase-1 evidence is intended to make the Alice -> Bob lifecycle reviewable by someone who did not operate the provider.

## Authorization decision metadata

`@skillpass/provider-verifier` returns the verified current-owner decision together with finality information and, when supplied by the provider's resolver, chain-location metadata:

```text
chain.outPoint
chain.blockNumber
chain.blockHash
chain.confirmations
chain.requiredConfirmations
```

A resolver may omit outpoint/block metadata when its backend cannot expose it, but a real Testnet evidence run should retain those fields whenever available. If the resolver exposes a Cell status and it is anything other than `live`, the safe verifier rejects the Cell.

## What a persisted evidence record binds

The reference live gateway persists evidence containing the SHA-256 request hash, Capability identity/outpoint, provider/service identity, policy fingerprint, current owner lock hash, CKB finality evidence, optional subject binding, optional delegation/payment hashes, durable invocation key, decision, timestamps, and bounded retention metadata.

The plaintext request body, wallet private key, Fiber preimage, protected provider result, and evidence access token are not persisted in the evidence record.

## Integrity

The canonical evidence payload is hashed with SHA-256. If `SKILLPASS_EVIDENCE_SIGNING_PRIVATE_KEY` is configured, the provider also signs an Ed25519 attestation over the evidence hash, request ID, key ID, and issue time. When a dedicated evidence key is not supplied the reference gateway may use its configured provider evidence key.

The provider manifest advertises the evidence public key and key ID so a client can inspect it. A real trust decision should pin the public key or its SHA-256 fingerprint through an independent channel.

## Retrieval privacy

A successful invocation receipt contains:

- `requestId`;
- an evidence endpoint;
- a random opaque evidence token;
- whether the evidence is provider-signed.

Only `SHA256(token)` is persisted. Retrieval requires both the unguessable request ID and the opaque token:

```text
GET /api/evidence/{requestId}?token=...
```

Evidence expires according to `AUTHORIZATION_EVIDENCE_TTL_SECONDS`.

## Offline verification

```bash
npm run evidence:verify -- evidence.json
```

To pin trust instead of accepting the embedded transport key:

```bash
npm run evidence:verify -- evidence.json --fingerprint sha256:...
```

or:

```bash
npm run evidence:verify -- evidence.json --public-key provider-public.pem
```

A valid signature proves that the holder of the pinned provider key attested to that exact evidence record. It does not by itself prove that the provider's CKB RPC was honest; each provider remains responsible for its own chain/RPC trust policy.

## Phase-1 lifecycle evidence

For a public Alice -> Bob validation retain at least:

1. Alice authorization evidence before transfer from Provider A;
2. Alice authorization evidence before transfer from Provider B;
3. the CKB transfer transaction and consumed Alice outpoint;
4. old-owner denial results from both providers after the configured confirmation threshold;
5. Bob authorization evidence from both providers after transfer;
6. the deployed Capability script identity and source commit in `evidence/testnet/manifest.json`.

This package is stronger than screenshots because successful decisions are hash-stable/provider-attested and the canonical ownership transition can be checked independently against CKB.
