import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assessConsumptionProof} from '../scripts/spend-proof.mjs';
const good = {cellStatus: 'unknown', spendingTxStatus: 'committed', spendingConfirmations: 3, spendingTxConsumesOutpoint: true, minConfirmations: 1};
test('modern CKB unknown cell + exact confirmed spender proves consumption', () => {
  assert.equal(assessConsumptionProof(good).passed, true);
});
test('legacy deprecated dead status is accepted with independent spend proof', () => {
  assert.equal(assessConsumptionProof({...good, cellStatus: 'dead'}).passed, true);
});
test('never accept unknown as consumption without committed spending transaction', () => {
  for (const spendingTxStatus of ['pending', 'proposed', 'unknown', '', 'rejected']) {
    const proof = assessConsumptionProof({...good, spendingTxStatus});
    assert.equal(proof.passed, false, spendingTxStatus);
    assert.ok(proof.failed.includes('spenderCommitted'));
  }
});
test('never accept unrelated transfer or missing input', () => {
  for (const spendingTxConsumesOutpoint of [false, null, undefined]) {
    assert.equal(assessConsumptionProof({...good, spendingTxConsumesOutpoint}).passed, false);
  }
});
test('never treat still-live or invalid cell state as spent', () => {
  for (const cellStatus of ['live', '', 'missing', 'pending', null]) {
    assert.equal(assessConsumptionProof({...good, cellStatus}).passed, false);
  }
});
test('must satisfy confirmation threshold', () => {
  for (const spendingConfirmations of [0, -1, null, undefined, 1.5]) {
    assert.equal(assessConsumptionProof({...good, spendingConfirmations}).passed, false);
  }
  assert.equal(assessConsumptionProof({...good, spendingConfirmations: 1, minConfirmations: 2}).passed, false);
  assert.equal(assessConsumptionProof({...good, spendingConfirmations: 2, minConfirmations: 2}).passed, true);
});
test('invalid confirmation requirements fail closed', () => {
  for (const minConfirmations of [0, -1, 1.5, null, undefined]) {
    if (minConfirmations === undefined) continue;
    assert.equal(assessConsumptionProof({...good, minConfirmations}).passed, false);
  }
});
test('both signed and unsigned transaction inputs must be explicitly committed', () => {
  assert.equal(assessConsumptionProof({...good, spendingTxStatus: 'committed', spendingTxConsumesOutpoint: true}).passed, true);
  assert.equal(assessConsumptionProof({...good, spendingTxStatus: 'committed', spendingTxConsumesOutpoint: false}).passed, false);
});
