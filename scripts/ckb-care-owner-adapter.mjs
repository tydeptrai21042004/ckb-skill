/** Canonical SkillPass ownership adapter for a separate SkillPass Care deployment. */
import { decodeCapability } from '@skillpass/capability-codec';
import { verifySkillPassAuthorization } from '@skillpass/provider-verifier';
import { createCkbRpc, getLiveCell } from './ckb-rpc.mjs';

/**
 * Build the exact `verifyCurrentOwner` callback accepted by @skillpass/care-bridge.
 * Supply a trusted deployment and issuer-allowlisted Care policy, NEVER values
 * supplied by the requester. RPC state is fetched afresh for every call.
 */
export function createCkbCareOwnerAdapter({rpcUrl, deployment, policy, minConfirmations = 1} = {}) {
  if (!deployment || !/^0x[0-9a-f]{64}$/i.test(String(deployment.codeHash)) || !['data', 'data1', 'data2', 'type'].includes(deployment.hashType)) {
    throw new Error('Care adapter needs an independently pinned Capability deployment');
  }
  if (!policy?.serviceId || !policy?.trustedIssuerIds?.length) throw new Error('Care adapter requires a pinned service/issuer policy');
  if (!Number.isSafeInteger(minConfirmations) || minConfirmations < 1) throw new Error('Care confirmation threshold must be positive');
  const rpc = createCkbRpc(rpcUrl);
  return async function verifyCurrentOwner(request) {
    const cell = await getLiveCell(rpc, request.outPoint);
    if (!cell) return {authorized:false};
    const capability = decodeCapability(cell.outputData);
    if (capability.capabilityId?.toLowerCase() !== request.capabilityId.toLowerCase()) return {authorized:false};
    const verdict = await verifySkillPassAuthorization({
      capability, policy, requesterLockHash:request.requesterLockHash, deployment,
      minConfirmations, resolveLiveCell:async()=>cell,
    });
    return Object.freeze({
      authorized:verdict.authorized === true,
      capabilityId:capability.capabilityId,
      ownerLockHash:verdict.currentOwnerLockHash,
      outPoint:request.outPoint,
      confirmations:verdict.confirmations,
    });
  };
}
