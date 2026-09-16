# SkillPass Authorization Evidence

SkillPass v1.8 can turn a successful authorization decision into an exportable proof artifact without storing or publishing the protected request body.

## What is bound

The evidence record includes the SHA-256 request hash, Capability ID and outpoint, provider/service identity, policy fingerprint, current owner lock hash, CKB finality evidence, optional subject binding, optional delegation ID, optional payment-proof hash, durable invocation key, decision, timestamps, and bounded retention metadata.

The plaintext request body, wallet private key, Fiber preimage, protected provider result, and evidence access token are not persisted in the evidence record.

## Integrity

The canonical evidence payload is hashed with SHA-256. If `SKILLPASS_EVIDENCE_SIGNING_PRIVATE_KEY` is configured, the provider also signs an Ed25519 attestation over the evidence hash, request ID, key ID, and issue time. When a dedicated evidence key is not supplied the reference gateway falls back to the provider-manifest key.

The provider manifest advertises the evidence public key and key ID so a client can inspect it. A real trust decision should pin the public key or its SHA-256 fingerprint through an independent channel.

## Retrieval privacy

A successful invocation receipt contains:

- `requestId`;
- an evidence endpoint;
- a random opaque evidence token;
- whether the evidence is provider-signed.

Only `SHA256(token)` is persisted. Retrieval requires both the unguessable UUID request ID and the opaque token:

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

## Funding / audit use

For a public Alice → Bob test, export at least:

1. Alice authorization evidence before transfer;
2. the CKB transfer transaction;
3. the old-owner denial result after confirmation;
4. Bob authorization evidence after transfer;
5. equivalent evidence from a second independently operated provider.

That package is substantially stronger than screenshots because the successful authorization records are hash-stable and independently verifiable.
