import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// These source-level guards deliberately run without network or signing keys.
const worker=readFileSync('scripts/ci-provider-worker.mjs','utf8');
const runner=readFileSync('scripts/ci-testnet-lifecycle.ts','utf8');
test('each CI provider has its own fresh process and RPC configuration',()=>{
  assert.match(runner,/exec\(process\.execPath/);
  assert.match(runner,/ci-provider-worker\.mjs/);
  assert.match(runner,/independentOrganizationsVerified: false/);
  assert.match(worker,/getLiveCell\(localRpc,item\.outPoint\)/);
  assert.match(worker,/verifySkillPassAuthorization/);
  assert.match(worker,/assessProviderDecision/);
});
test('provider process explicitly does not claim requester-signed authorization',()=>{
  assert.match(worker,/requesterProof:'lock-hash-policy-only'/);
  assert.match(worker,/ownerSourceOfTruth:'live-ckb-cell'/);
  assert.match(worker,/chain\?\.chain !== 'ckb_testnet'/);
});
