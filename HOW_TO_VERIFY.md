# HOW TO VERIFY — SkillPass v0.2

## A. Zero-dependency local verification

```bash
npm run bootstrap
npm run doctor
npm run verify
```

Expected final messages include:

```text
31 tests
31 pass
0 fail
HTTP/UI SMOKE PASSED
LOCAL VERIFIED
```

## B. Human-clickable local acceptance test

```bash
npm run dev
```

Open `http://127.0.0.1:8787/` and perform:

1. **Use as Alice** → accepted.
2. **Transfer Alice → Bob** → successor Cell appears.
3. **Use as Alice** → rejected.
4. **Use as Bob** → accepted.

This is simulation evidence only.

## C. Contract verification

Local Rust:

```bash
npm run verify:contract
```

or Docker:

```bash
npm run verify:contract:docker
```

Required contract cases include valid creation/transfer and rejection of malformed data, unsupported version/flags, forged creation ID, changed immutable fields, non-transferable owner change, unauthorized issue, and burn.

## D. CCC client

```bash
npm run setup:live
npm run typecheck:ckb
```

This checks the browser/testnet transaction code against the installed CCC package.

## E. Real testnet deployment

Create config:

```bash
npm run bootstrap:live
```

Fill `.env.live` from the real contract deployment, then:

```bash
npm run doctor:live
docker compose -f compose.live.yaml up --build
```

The live application must report **CKB Testnet**.

## F. Real two-user test

### Actor A

1. connects a CCC-compatible CKB wallet;
2. owns or receives a `paper-analyzer-v1` capability;
3. uses the service successfully;
4. transfers the capability to Actor B and explicitly signs the transaction.

### Actor B

5. connects independently;
6. sees the successor live Capability Cell;
7. uses the service successfully.

### Actor A again

8. old consumed out point is rejected;
9. B's successor Cell is rejected because A no longer controls its lock.

Record the issue and transfer transaction hashes.

## G. Backend authorization checks

For every protected request the server must verify:

1. one-time nonce exists and is unexpired;
2. nonce cannot be reused;
3. wallet signature is valid;
4. MVP signature identity is bound to the claimed CKB address;
5. referenced Capability Cell is currently live;
6. Type Script matches configured SkillPass deployment;
7. Type Script args match capability data identity;
8. service ID is `paper-analyzer-v1`;
9. capability is unexpired;
10. current Cell lock equals requester address.

## H. Funding-ready status

Only mark the public MVP `VERIFIED` after publishing:

- testnet deployment tx hash;
- issue tx hash;
- transfer tx hash;
- public application URL;
- passing CI link;
- complete screen recording;
- unrelated external-user report;
- updated `reports/verification-matrix.md`.
