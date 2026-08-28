#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

npm run verify
make -C contracts/capability-type test

echo "FULL LOCAL VERIFICATION PASSED (Node + CKB contract)."
echo "Testnet/public-user evidence is still required before funding-ready VERIFIED status."
