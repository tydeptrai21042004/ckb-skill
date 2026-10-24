#!/usr/bin/env node
/** Runs one provider's independent read-only authorization process. */
import { readFile, writeFile } from 'node:fs/promises';
import { createCkbRpc, getHistoricalCell, getLiveCell } from './ckb-rpc.mjs';
import { decodeCapability } from '@skillpass/capability-codec';
import { createServicePolicy } from '@skillpass/service-rights';
import { verifySkillPassAuthorization } from '@skillpass/provider-verifier';
import { assessProviderDecision } from './lifecycle-assertions.mjs';

const hex = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

export async function runProviderWorker({config, context, phase, rpc} = {}) {
  if (!['before', 'after'].includes(phase)) throw new Error('invalid lifecycle phase');
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(String(config?.id || ''))) throw new Error('invalid provider id');
  if (config?.ownerSourceOfTruth !== 'live-ckb-cell' || config?.entitlementDatabase !== null) throw new Error('provider must be independent of SkillPass ownership database');
  if (!hex(config.codeHash, context.codeHash) || config.hashType !== context.hashType || !hex(config.serviceId, context.serviceId) || !hex(config.trustedIssuerId, context.issuerId)) {
    throw new Error('provider policy/deployment does not match lifecycle context');
  }
  if (typeof config.rpcUrl !== 'string' || !config.rpcUrl.startsWith('https://') || new URL(config.rpcUrl).username || new URL(config.rpcUrl).password) {
    throw new Error('provider RPC must be a credential-free HTTPS URL');
  }
  const localRpc = rpc || createCkbRpc(config.rpcUrl);
  const chain = await localRpc.call('get_blockchain_info', []);
  if (chain?.chain !== 'ckb_testnet') throw new Error('provider RPC did not identify Pudge testnet');
  const policy = createServicePolicy({serviceId:config.serviceId, trustedIssuerIds:[config.trustedIssuerId],requireTransferable:true});
  const cases = phase === 'before' ? [
    {id:'before-alice-allow',outPoint:context.pre,requesterLockHash:context.aliceLockHash,expected:true},
    {id:'before-bob-deny',outPoint:context.pre,requesterLockHash:context.bobLockHash,expected:false},
  ] : [
    {id:'after-alice-deny',outPoint:context.pre,requesterLockHash:context.aliceLockHash,expected:false},
    {id:'after-bob-allow',outPoint:context.post,requesterLockHash:context.bobLockHash,expected:true},
  ];
  const results = [];
  for (const item of cases) {
    const historical = await getHistoricalCell(localRpc,item.outPoint);
    const capability = decodeCapability(historical.outputData);
    if (!hex(capability.capabilityId,context.capabilityId) || !hex(capability.issuerId,context.issuerId) || !hex(capability.serviceId,context.serviceId)) {
      throw new Error('provider received wrong on-chain capability identity');
    }
    let authorized = false, code = 'ALLOW';
    try {
      const decision = await verifySkillPassAuthorization({
        capability, policy, requesterLockHash:item.requesterLockHash,
        deployment: {codeHash:config.codeHash,hashType:config.hashType},
        minConfirmations: config.minConfirmations,
        resolveLiveCell: () => getLiveCell(localRpc,item.outPoint),
      });
      authorized = decision.authorized === true;
      if (!authorized) code = 'NOT_AUTHORIZED';
    } catch (error) {
      code = String(error?.code || error?.name || 'UNKNOWN_ERROR');
      if (!['NOT_OWNER', 'CELL_NOT_LIVE'].includes(code)) throw error;
    }
    results.push(assessProviderDecision({id:item.id,expected:item.expected,authorized,code}));
  }
  return {
    provider:{id:config.id}, phase, network:'ckb_testnet',
    rpcHost:new URL(config.rpcUrl).host, ownerSourceOfTruth:'live-ckb-cell',
    executionKind:'independent-ci-process', requesterProof:'lock-hash-policy-only',
    checkedAt:new Date().toISOString(), results, passed:results.every(r=>r.passed),
  };
}

async function main() {
  const [phase, configPath, contextPath, outPath] = process.argv.slice(2);
  if (!phase || !configPath || !contextPath || !outPath) throw new Error('usage: ci-provider-worker.mjs <phase> <config> <context> <report>');
  const [config, context] = await Promise.all([configPath,contextPath].map(async p=>JSON.parse(await readFile(p,'utf8'))));
  const report = await runProviderWorker({config,context,phase});
  await writeFile(outPath,JSON.stringify(report,null,2)+'\n');
  if (!report.passed) throw new Error(`${config.id} authorization checks failed`);
  console.log(`${config.id}: ${report.results.length} live-CKB authorization checks PASSED (${phase})`);
}
if (process.argv[1]?.endsWith('/ci-provider-worker.mjs')) {
  main().catch(error=>{console.error(error.stack || error);process.exitCode=1;});
}
