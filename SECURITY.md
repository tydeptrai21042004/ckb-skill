# Security Notes

## Key custody

- The live API never needs or accepts the user's wallet private key or seed phrase.
- Issue and transfer transactions are signed in the browser through the connected CCC wallet.
- The local `TestWallet` is HMAC-based test code and exists only in `local-test-only` simulation mode.

## Authorization

A protected service request requires both:

1. a one-time wallet message proof; and
2. successful verification of the current live Capability Cell on CKB.

A valid signature alone is not an entitlement. A cached database ownership row alone is not an entitlement.

## Replay protection

The live MVP nonce store:

- generates cryptographically random nonces;
- has a 60-second expiry;
- marks a nonce used before expensive verification completes;
- rejects replay;
- prunes stale records;
- is intentionally process-local.

Run one backend replica for the MVP. Before horizontal scaling, replace it with a shared atomic TTL store.

## Browser wallet scope

The first public MVP intentionally requires a CKB-native message-signing identity that can be directly bound to the connected CKB address. Do not silently enable BTC/EVM/Nostr/JoyID identity modes until a tested identity-to-CKB-lock binding rule exists for each signer class.

## Input and HTTP controls

- request body size is bounded;
- paper input size is bounded;
- demo/live APIs include basic per-IP rate limiting;
- security response headers are set;
- live frontend/API use same origin by default;
- deployment config exposes only public chain metadata.

## Mainnet

Mainnet is not supported by this MVP. Keep the React provider and backend on CKB testnet until independent contract/security review and explicit mainnet configuration are added.
