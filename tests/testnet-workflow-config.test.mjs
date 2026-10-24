import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 TESTNET_FUNDING_ADDRESS, TESTNET_BOB_ADDRESS, TESTNET_NETWORK, TESTNET_FUNDING_PRIVATE_KEY,
} from '../scripts/testnet-wallets.mjs';

const workflow = await readFile('.github/workflows/real-ckb-testnet.yml','utf8');
const runner = await readFile('scripts/ci-testnet-lifecycle.ts','utf8');
const providerWorker = await readFile('scripts/ci-provider-worker.mjs','utf8');

test('public addresses are distinct CKB testnet addresses', () => {
 assert.equal(TESTNET_NETWORK, 'ckb_testnet');
 assert.match(TESTNET_FUNDING_ADDRESS,/^ckt1[a-z0-9]{30,}$/);
 assert.match(TESTNET_BOB_ADDRESS,/^ckt1[a-z0-9]{30,}$/);
 assert.notEqual(TESTNET_FUNDING_ADDRESS, TESTNET_BOB_ADDRESS);
});
test('on-chain CI is dispatch-only and needs no GitHub environment or secret', () => {
 assert.match(workflow,/workflow_dispatch:/);
 assert.match(workflow,/concurrency:/);
 assert.doesNotMatch(workflow,/environment: ckb-testnet/);
 assert.doesNotMatch(workflow,/secrets\./);
 assert.doesNotMatch(workflow,/CKB_TESTNET_PRIVATE_KEY/);
 assert.match(workflow,/make -C contracts\/capability-type build/);
 assert.match(workflow,/evidence:testnet:require/);
 assert.doesNotMatch(workflow,/schedule:|push:/);
});
test('lifecycle cannot claim success without verified on-chain evidence',()=>{
 for(const item of [
  'get_blockchain_info', 'TESTNET_FUNDING_PRIVATE_KEY', 'derivedAddress !== TESTNET_FUNDING_ADDRESS',
  'buildIssueCapabilityTx', 'buildTransferCapabilityTx', 'verifyManifestAgainstCkb',
  'ci-provider-worker.mjs', 'status: "PASSED"',
 ]) assert.ok(runner.includes(item), `missing ${item}`);
 assert.match(providerWorker, /verifySkillPassAuthorization/);
 assert.match(TESTNET_FUNDING_PRIVATE_KEY, /^0x[0-9a-f]{64}$/i);
 assert.doesNotMatch(runner, /process\.env\.CKB_TESTNET_PRIVATE_KEY/);
});

test('spent outpoint checks verify a committed exact-input proof, never the deprecated dead-only status', () => {
 assert.match(runner, /awaitConsumed\(primary, pre, transferHash\)/);
 assert.match(runner, /awaitConsumed\(providerRpc, pre, transferHash\)/);
 assert.match(runner, /assessConsumptionProof/);
 assert.doesNotMatch(runner, /status === \(expected \? "live" : "dead"\)/);
});

test('failed transfer guard can be recovered read-only from a previous Actions run', () => {
 assert.match(workflow, /resume_run_id:/);
 assert.match(workflow, /actions\/download-artifact@v4/);
 assert.match(workflow, /ci-recover-testnet-lifecycle\.mjs/);
 assert.match(workflow, /github-token: \$\{\{ github\.token \}\}/);
 assert.match(workflow, /recovery-rpc-verification\.json/);
});
