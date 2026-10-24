import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reconstructManifest} from '../scripts/recover-manifest.mjs';
const a = '0x'+'a'.repeat(64), b = '0x'+'b'.repeat(64), c = '0x'+'c'.repeat(64), d = '0x'+'d'.repeat(64);
const sha = 'sha256:'+'0'.repeat(64);
const stage = {status:'transferred',network:'ckb_testnet',deployTxHash:a,issueTxHash:b,transferTxHash:c,
  capabilityId:d,codeHash:d,contractBinarySha256:sha,sourceCommit:'old-source-sha'};
const deployment={network:'testnet',hashType:'data2',depTxHash:a,depIndex:0,codeHash:d};
const capability={capabilityId:d,issuerId:a,serviceId:b};
const preCell={lockHash:a}, postCell={lockHash:b};
const base={stage,deployment,capability,preCell,postCell,currentBinaryHash:sha};
test('read-only recovery reconstructs the exact old on-chain transaction outpoints',()=>{
 const manifest = reconstructManifest(base);
 assert.equal(manifest.preTransferOutpoint.txHash, b);
 assert.equal(manifest.postTransferOutpoint.txHash, c);
 assert.equal(manifest.contractBinarySha256,sha);
 assert.equal(manifest.sourceCommit,'old-source-sha');
});
test('cannot recover without confirmed transfer stage',()=>{
 for(const status of ['issue-broadcast','issued','transfer-broadcast',undefined]) {
   assert.throws(()=>reconstructManifest({...base,stage:{...stage,status}}));
 }
});
test('cannot recover changed contract bytecode or incorrect deployment descriptor',()=>{
 assert.throws(()=>reconstructManifest({...base,currentBinaryHash:'sha256:'+'1'.repeat(64)}));
 assert.throws(()=>reconstructManifest({...base,deployment:{...deployment,depTxHash:c}}));
 assert.throws(()=>reconstructManifest({...base,stage:{...stage,capabilityId:a}}));
});
test('cannot recover missing hashes or wrong network',()=>{
 for(const name of ['transferTxHash','issueTxHash','deployTxHash','capabilityId']) {
   assert.throws(()=>reconstructManifest({...base,stage:{...stage,[name]:undefined}}));
 }
 assert.throws(()=>reconstructManifest({...base,stage:{...stage,network:'ckb'}}));
});
