import test from 'node:test';
import assert from 'node:assert/strict';
import {createCareBridge, CareBridgeError} from '../src/index.mjs';
const h = (c) => `0x${c.repeat(64)}`;
const alice = h('a'), bob = h('b'), cap = h('c');
const pre = {txHash:h('1'), index:0}, post = {txHash:h('2'), index:0};
const request = (overrides = {}) => ({coverageId:'product-1',operationId:'operation-0001',providerId:'provider-a',serviceType:'repair', capabilityId:cap, requesterLockHash:alice, outPoint:pre,signatureProof:'signed', ...overrides});
function scenario({quota=2} = {}) {
  let live = pre;
  let owner = alice;
  let visits = 0;
  const op = new Map();
  let failNext = false;
  const bridge = createCareBridge({
    verifyRequesterProof: async ({signatureProof}) => signatureProof === 'signed',
    verifyCurrentOwner: async ({outPoint,requesterLockHash}) => {
      if (failNext) { failNext=false; return {authorized:false}; }
      if (outPoint.txHash !== live.txHash || requesterLockHash !== owner) return {authorized:false};
      return {authorized:true,capabilityId:cap,ownerLockHash:owner,outPoint:live,confirmations:2};
    },
    commitCoverageEvent: async ({operationId,providerId,serviceType,capabilityId,expectedOutPoint}) => {
      const hash = `${providerId}:${serviceType}:${capabilityId}:${expectedOutPoint.txHash}`;
      if (op.has(operationId)) {
        if (op.get(operationId) !== hash) throw new CareBridgeError('IDEMPOTENCY_CONFLICT','changed operation');
        return {status:'deduplicated',remaining:quota-visits};
      }
      if (visits >= quota) throw new CareBridgeError('QUOTA_EXHAUSTED','no coverage left');
      op.set(operationId,hash);
      visits++;
      return {status:'committed',remaining:quota-visits};
    },
  });
  return {bridge, transfer:()=>{live=post;owner=bob;}, rejectNext:()=>{failNext=true;}, getVisits:()=>visits};
}
test('Provider A Alice => Bob transfer => Provider B Bob, with shared coverage quota',async()=>{
  const s=scenario();
  const before=await s.bridge.redeem(request());
  assert.equal(before.remaining,1);
  s.transfer();
  await assert.rejects(s.bridge.redeem(request({operationId:'operation-0002'})),/canonical SkillPass ownership proof/);
  const after=await s.bridge.redeem(request({operationId:'operation-0002',providerId:'provider-b',requesterLockHash:bob,outPoint:post}));
  assert.equal(after.remaining,0);
  assert.equal(s.getVisits(),2);
});
test('missing requester proof or invalid signature is denied before quota change',async()=>{
  const s=scenario();
  await assert.rejects(s.bridge.redeem(request({signatureProof:''})), /fresh requester signature/);
  assert.throws(() => createCareBridge({verifyRequesterProof:async()=>true}),/verifyCurrentOwner/);
  assert.equal(s.getVisits(),0);
});
test('stale live-cell reads reject commit and preserve quota',async()=>{
  const s=scenario();s.rejectNext();
  await assert.rejects(s.bridge.redeem(request()), /canonical SkillPass ownership proof/);
  assert.equal(s.getVisits(),0);
});
test('same operation is idempotent and changed replay is rejected',async()=>{
  const s=scenario();
  await s.bridge.redeem(request());
  assert.equal((await s.bridge.redeem(request())).status,'deduplicated');
  await assert.rejects(s.bridge.redeem(request({serviceType:'replacement'})), /changed operation/);
  assert.equal(s.getVisits(),1);
});
test('concurrent redemptions cannot overrun coverage with transactional Care store',async()=>{
  const s=scenario({quota:1});
  const settled=await Promise.allSettled([s.bridge.redeem(request()),s.bridge.redeem(request({operationId:'operation-0002'}))]);
  assert.deepEqual(settled.map(i=>i.status).sort(),['fulfilled','rejected']);
  assert.equal(s.getVisits(),1);
});
test('unknown or mismatched current owner proof fails closed',async()=>{
  const bridge=createCareBridge({verifyRequesterProof:async()=>true,verifyCurrentOwner:async()=>({authorized:true,capabilityId:cap,ownerLockHash:bob,outPoint:post,confirmations:1}),commitCoverageEvent:async()=>({status:'committed'})});
  await assert.rejects(bridge.redeem(request()),/authorization is not bound/);
});

test('transfer detected between first and final owner verification blocks commit',async()=>{
  let reads=0;let committed=false;
  const bridge=createCareBridge({
    verifyRequesterProof:async()=>true,
    verifyCurrentOwner:async()=>{reads++;return reads===1
      ? {authorized:true,capabilityId:cap,ownerLockHash:alice,outPoint:pre,confirmations:2}
      : {authorized:false};},
    commitCoverageEvent:async()=>{committed=true;return {status:'committed'};},
  });
  await assert.rejects(bridge.redeem(request()),/canonical SkillPass ownership proof/);
  assert.equal(reads,2);assert.equal(committed,false);
});
