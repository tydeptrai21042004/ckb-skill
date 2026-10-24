/** Pure shape and provenance guards for GitHub Actions read-only Testnet recovery. */
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();
const hash32 = (value) => /^0x[0-9a-fA-F]{64}$/.test(String(value || ''));

export function reconstructManifest({stage, deployment, preCell, postCell, capability, currentBinaryHash}) {
  for (const name of ['deployTxHash', 'issueTxHash', 'transferTxHash', 'codeHash', 'capabilityId']) {
    if (!hash32(stage?.[name])) throw new Error(`Prior Actions stage is missing real ${name}`);
  }
  if (stage?.status !== 'transferred' && stage?.status !== 'PASSED') {
    throw new Error(`Prior run did not record a confirmed transfer (stage=${stage?.status})`);
  }
  if (stage.network !== 'ckb_testnet' || deployment.network !== 'testnet' || deployment.hashType !== 'data2' || deployment.depIndex !== 0) {
    throw new Error('Prior evidence is not a standard CKB Pudge Testnet Capability deployment');
  }
  if (!same(stage.deployTxHash, deployment.depTxHash) || !same(stage.codeHash, deployment.codeHash)) {
    throw new Error('Prior deployment descriptor does not match the failed Actions stage');
  }
  if (!/^sha256:[0-9a-f]{64}$/i.test(String(stage.contractBinarySha256 || '')) || !same(stage.contractBinarySha256, currentBinaryHash)) {
    throw new Error('Current compiled contract ELF differs from the binary pinned by the prior Actions run');
  }
  if (!same(stage.capabilityId, capability.capabilityId)) {
    throw new Error('Issued on-chain Capability ID does not match previous run');
  }
  if (!hash32(capability.issuerId) || !hash32(capability.serviceId) || !hash32(preCell?.lockHash) || !hash32(postCell?.lockHash)) {
    throw new Error('Cannot reconstruct valid issuer, service or ownership identity from confirmed transactions');
  }
  return {
    network: 'testnet', sourceCommit: stage.sourceCommit, verifierCommit: process.env.GITHUB_SHA || 'local',
    protocolVersion: '1.8.0', contractBinarySha256: stage.contractBinarySha256,
    codeHash: deployment.codeHash, hashType: 'data2', depTxHash: deployment.depTxHash, depIndex: 0,
    issuerId: capability.issuerId, serviceId: capability.serviceId, capabilityId: capability.capabilityId,
    issueTxHash: stage.issueTxHash, preTransferOutpoint: {txHash: stage.issueTxHash, index: 0},
    transferTxHash: stage.transferTxHash, postTransferOutpoint: {txHash: stage.transferTxHash, index: 0},
    aliceLockHash: preCell.lockHash, bobLockHash: postCell.lockHash, minConfirmations: 1,
  };
}

