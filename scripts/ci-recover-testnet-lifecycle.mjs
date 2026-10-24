#!/usr/bin/env node
/**
 * Read-only recovery of a prior Actions run which broadcast and confirmed a
 * real transfer but failed at a post-transfer verification guard. No wallet,
 * private key, or transaction broadcast is used in this program.
 *
 * Usage: download the previous Actions evidence archive into evidence/testnet,
 * then run `node scripts/ci-recover-testnet-lifecycle.mjs`.
 */
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {decodeCapability} from '../packages/capability-codec/src/index.mjs';
import {createCkbRpc, getHistoricalCell} from './ckb-rpc.mjs';
import {verifyManifestAgainstCkb, validateManifestShape} from './testnet-evidence.mjs';
import {assessProviderDecision} from './lifecycle-assertions.mjs';
import {reconstructManifest} from './recover-manifest.mjs';

const evidenceDir = resolve(process.env.TESTNET_EVIDENCE_DIR || 'evidence/testnet');
const file = (name) => resolve(evidenceDir, name);
const readJSON = async (name) => JSON.parse(await readFile(file(name), 'utf8'));
const saveJSON = async (name, value) => writeFile(file(name), JSON.stringify(value, null, 2) + '\n');
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();


function checkPreviousProviderResults({before, manifest}) {
  if (before.phase !== 'before' || before.passed !== true || !Array.isArray(before.providers) || before.providers.length !== 2) {
    throw new Error('Previous Actions archive does not include two passing pre-transfer provider checks');
  }
  const seen = new Set();
  for (const report of before.providers) {
    const id = report.provider?.id;
    if (!['provider-a', 'provider-b'].includes(id) || seen.has(id) || !report.passed || report.phase !== 'before') {
      throw new Error('Invalid previous independent-process provider report');
    }
    seen.add(id);
    if (!Array.isArray(report.results) || report.results.length !== 2) throw new Error('Incomplete pre-transfer provider results');
    const actualCaseIds = new Set(report.results.map(x => x.id));
    if (actualCaseIds.size !== 2 || !actualCaseIds.has('before-alice-allow') || !actualCaseIds.has('before-bob-deny')) {
      throw new Error(`Prior ${id} has duplicate or missing authorization checks`);
    }
    for (const entry of report.results) {
      const requiredExpected = entry.id === 'before-alice-allow';
      if (entry.expected !== requiredExpected) throw new Error(`Prior ${id} has an invalid expected result for ${entry.id}`);
      const check = assessProviderDecision({id: entry.id, expected: requiredExpected, authorized: entry.actual, code: entry.code});
      if (!check.passed || !entry.passed) throw new Error(`Prior ${id} failed ${entry.id}`);
    }
  }
}

async function main() {
  const [stage, deployment, priorBefore] = await Promise.all([
    readJSON('ci-stage.json'), readJSON('deployment.json'), readJSON('providers/lifecycle-before.json'),
  ]);
  const binary = await readFile('contracts/capability-type/build/release/capability-type');
  const currentBinaryHash = `sha256:${createHash('sha256').update(binary).digest('hex')}`;
  const primaryUrl = process.env.CKB_RPC_URL || 'https://testnet.ckb.dev';
  const secondaryUrl = process.env.CKB_SECONDARY_RPC_URL || 'https://testnet.ckbapp.dev';
  if (!primaryUrl.startsWith('https://') || !secondaryUrl.startsWith('https://') || new URL(primaryUrl).host === new URL(secondaryUrl).host) {
    throw new Error('Recovery requires distinct HTTPS CKB Testnet RPC endpoints');
  }
  const primary = createCkbRpc(primaryUrl);
  const preOutpoint = {txHash: stage.issueTxHash, index: 0};
  const postOutpoint = {txHash: stage.transferTxHash, index: 0};
  const [preCell, postCell] = await Promise.all([getHistoricalCell(primary, preOutpoint), getHistoricalCell(primary, postOutpoint)]);
  const capability = decodeCapability(preCell.outputData);
  const manifest = reconstructManifest({stage, deployment, preCell, postCell, capability, currentBinaryHash});
  const failures = validateManifestShape(manifest);
  if (failures.length) throw new Error(`Recovery manifest is invalid: ${failures.join('; ')}`);
  checkPreviousProviderResults({before: priorBefore, manifest});

  // The previous run's completed transfer must pass independently on BOTH nodes.
  const [primaryProof, secondaryProof] = await Promise.all([
    verifyManifestAgainstCkb({manifest, rpcUrl: primaryUrl}),
    verifyManifestAgainstCkb({manifest, rpcUrl: secondaryUrl}),
  ]);
  await saveJSON('recovery-rpc-verification.json', {primaryProof, secondaryProof});
  if (!primaryProof.passed || !secondaryProof.passed) {
    throw new Error(`Read-only recovery failed: ${JSON.stringify({primary: primaryProof.failures, secondary: secondaryProof.failures})}`);
  }
  // After-phase: fresh processes and separate provider RPC configurations.
  const beforeContext = await readJSON('providers/ci-context-before.json');
  for (const [name, expected] of [
    ['codeHash', manifest.codeHash], ['hashType', manifest.hashType],
    ['serviceId', manifest.serviceId], ['issuerId', manifest.issuerId],
    ['capabilityId', manifest.capabilityId], ['aliceLockHash', manifest.aliceLockHash], ['bobLockHash', manifest.bobLockHash],
  ]) {
    if (!same(beforeContext[name], expected)) throw new Error(`Previous provider context ${name} disagrees with chain evidence`);
  }
  if (!same(beforeContext.pre?.txHash, manifest.issueTxHash) || beforeContext.pre?.index !== 0) {
    throw new Error('Previous provider context has unexpected issuance outpoint');
  }
  const afterContext = {...beforeContext, post: postOutpoint};
  await saveJSON('providers/ci-context-after.json', afterContext);
  const exec = promisify(execFile);
  const reports = [];
  for (const id of ['provider-a', 'provider-b']) {
    const config = await readJSON(`providers/ci-${id}.json`);
    if (config.id !== id || !same(config.codeHash, manifest.codeHash) || !same(config.trustedIssuerId, manifest.issuerId) ||
        !same(config.serviceId, manifest.serviceId) || config.hashType !== manifest.hashType) {
      throw new Error(`Prior ${id} pinned config does not match chain evidence`);
    }
    const {stdout} = await exec(process.execPath, ['scripts/ci-provider-worker.mjs', 'after', file(`providers/ci-${id}.json`),
      file('providers/ci-context-after.json'), file(`providers/${id}-after.json`)], {timeout: 120_000});
    process.stdout.write(stdout);
    const report = await readJSON(`providers/${id}-after.json`);
    if (!report.passed || report.provider?.id !== id) throw new Error(`Recovered ${id} after-phase failed`);
    reports.push(report);
  }
  await saveJSON('providers/lifecycle-after.json', {
    schemaVersion: 2, kind: 'skillpass-real-testnet-separate-provider-processes', network: 'ckb_testnet',
    phase: 'after', checkedAt: new Date().toISOString(), providers: reports,
    passed: reports.length === 2 && reports.every(p => p.passed), independentOrganizationsVerified: false,
  });
  await saveJSON('manifest.json', manifest);
  await saveJSON('onchain-verification.json', primaryProof);
  const summary = {
    status: 'PASSED', recoveryMode: 'read-only-existing-transactions', realChain: true, network: 'ckb_testnet',
    originalSourceCommit: stage.sourceCommit, verifierSourceCommit: process.env.GITHUB_SHA || null,
    originalWorkflowRun: stage.workflowRun || null, workflowRun: process.env.GITHUB_RUN_ID || null,
    contractBinarySha256: stage.contractBinarySha256, codeHash: manifest.codeHash,
    deployTxHash: manifest.depTxHash, issueTxHash: manifest.issueTxHash,
    transferTxHash: manifest.transferTxHash, capabilityId: manifest.capabilityId,
    providerChecks: 'two independent CI processes x before (archived) and after (rechecked); no wallet-signed requester proof',
    checkedAt: new Date().toISOString(),
  };
  await saveJSON('run-summary.json', summary);
  await saveJSON('ci-stage.json', {...stage, status: 'PASSED', recoveredByWorkflowRun: process.env.GITHUB_RUN_ID || null,
    verifierCommit: process.env.GITHUB_SHA || null, checkedAt: new Date().toISOString()});
  if (process.env.GITHUB_STEP_SUMMARY) {
    const {appendFile} = await import('node:fs/promises');
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `## CKB Pudge Testnet — RECOVERED (read-only)\n\n` +
      `- Deployment: ${manifest.depTxHash}\n- Issue: ${manifest.issueTxHash}\n` +
      `- Transfer: ${manifest.transferTxHash}\n` +
      `- Verified on two RPCs; no new transactions broadcast.\n\n`);
  }
  console.log(`REAL TESTNET RECOVERY PASSED: confirmed transfer ${manifest.transferTxHash}; no wallet required and no new CKB spent.`);
}

if (process.argv[1]?.endsWith('/ci-recover-testnet-lifecycle.mjs')) {
  main().catch(error => {console.error('READ-ONLY TESTNET RECOVERY FAILED:', error.stack || error); process.exitCode = 1;});
}
