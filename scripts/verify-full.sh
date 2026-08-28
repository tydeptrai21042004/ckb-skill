#!/usr/bin/env bash
set -Eeuo pipefail
cd "$(dirname "$0")/.."

npm run verify
npm run smoke:http
npm run typecheck:ckb
npm run build:web
make -C contracts/capability-type test

echo "FULL LOCAL VERIFICATION PASSED (Node + HTTP + x402/Fiber mock + CCC typecheck/build + CKB contract)."
echo "Real CKB/Fiber network evidence is a separate acceptance stage; see HOW_TO_VERIFY.md."
