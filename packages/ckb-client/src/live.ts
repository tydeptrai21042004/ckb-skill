import { ccc } from "@ckb-ccc/connector-react";
import {
  decodeCapability,
  encodeCapabilityHex,
  encodeTypeArgs,
  isActive,
  normalizeHex32,
  hasFlag,
  FLAG_TRANSFERABLE,
  BINDING_ATOMIC,
} from "@skillpass/capability-codec";

export type Deployment = {
  network: "devnet" | "testnet";
  codeHash: `0x${string}`;
  hashType: "data" | "data1" | "data2" | "type";
  depTxHash: `0x${string}`;
  depIndex: number;
};

export type IssueParams = {
  /** Provider/issuer wallet. This signer funds and authorizes issuance. */
  signer: ccc.Signer;
  deployment: Deployment;
  /** Recipient that becomes the first service-right owner (for example Alice). */
  recipientAddress: string;
  serviceId: `0x${string}`;
  expiry: bigint;
  flags: number;
  /** Optional Capability v2 fields. Omit for the deployed v1 format. */
  version?: 1 | 2;
  subjectType?: number;
  bindingMode?: number;
  subjectId?: `0x${string}`;
  policyHash?: `0x${string}`;
};

const ZERO32 = `0x${"00".repeat(32)}` as `0x${string}`;

export function validateDeployment(deployment: Deployment): Deployment {
  normalizeHex32(deployment.codeHash, "deployment.codeHash");
  normalizeHex32(deployment.depTxHash, "deployment.depTxHash");
  if (!["data", "data1", "data2", "type"].includes(deployment.hashType)) {
    throw new Error(`unsupported deployment hashType ${deployment.hashType}`);
  }
  if (!Number.isSafeInteger(deployment.depIndex) || deployment.depIndex < 0) {
    throw new Error("deployment.depIndex must be a non-negative safe integer");
  }
  return deployment;
}

export function capabilityTypeScript(
  deployment: Deployment,
  issuerId: `0x${string}`,
  capabilityId: `0x${string}`,
): ccc.Script {
  validateDeployment(deployment);
  return ccc.Script.from({
    codeHash: deployment.codeHash,
    hashType: deployment.hashType,
    args: encodeTypeArgs({ issuerId, capabilityId }),
  });
}

/**
 * CKB Type-ID-style creation identifier:
 * CKB_HASH(serialized first CellInput || uint64_le(outputIndex)).
 */
export function deriveCapabilityId(firstInput: ccc.CellInput, outputIndex: number): `0x${string}` {
  if (!Number.isSafeInteger(outputIndex) || outputIndex < 0) {
    throw new Error("outputIndex must be a non-negative safe integer");
  }
  const inputBytes = firstInput.toBytes();
  const indexBytes = ccc.numToBytes(BigInt(outputIndex), 8);
  const material = new Uint8Array(inputBytes.length + indexBytes.length);
  material.set(inputBytes, 0);
  material.set(indexBytes, inputBytes.length);
  return normalizeHex32(ccc.hashCkb(material), "derived capabilityId");
}

function addCapabilityCellDep(tx: ccc.Transaction, deployment: Deployment): void {
  tx.cellDeps.push(
    ccc.CellDep.from({
      outPoint: {
        txHash: deployment.depTxHash,
        index: BigInt(deployment.depIndex),
      },
      depType: "code",
    }),
  );
}

function isCapabilityType(type: ccc.Script | undefined, deployment: Deployment): boolean {
  return Boolean(type && type.codeHash === deployment.codeHash && type.hashType === deployment.hashType);
}

function assertNoCapabilityFundingInputs(tx: ccc.Transaction, deployment: Deployment): void {
  for (const input of tx.inputs) {
    const type = input.cellOutput?.type;
    if (isCapabilityType(type, deployment)) {
      throw new Error("refusing to use an existing SkillPass capability Cell as a funding/fee input");
    }
  }
}

function normalizeTrustedIssuerSet(values?: Array<`0x${string}`> | `0x${string}`): Set<string> | null {
  if (values == null) return null;
  const list = Array.isArray(values) ? values : [values];
  const normalized = list
    .filter((value) => String(value || "").trim())
    .map((value) => normalizeHex32(value, "trustedIssuerId").toLowerCase());
  return normalized.length ? new Set(normalized) : null;
}

export async function buildIssueCapabilityTx(params: IssueParams) {
  validateDeployment(params.deployment);
  if (!String(params.recipientAddress || "").trim()) throw new Error("recipientAddress is required");
  if (!Number.isSafeInteger(params.flags) || params.flags < 0 || params.flags > 0xff) throw new Error("capability flags must be an unsigned byte");
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (params.expiry <= now) throw new Error("capability expiry must be in the future");

  const capabilityVersion = params.version ?? 1;
  if (![1, 2].includes(capabilityVersion)) throw new Error("capability version must be 1 or 2");
  const v2Fields = capabilityVersion === 2 ? {
    subjectType: params.subjectType,
    bindingMode: params.bindingMode,
    subjectId: params.subjectId,
    policyHash: params.policyHash,
  } : {};

  const issuerAddress = await params.signer.getRecommendedAddressObj();
  const issuerLock = issuerAddress.script;
  const issuerId = normalizeHex32(issuerLock.hash(), "issuerId");
  const recipient = await ccc.Address.fromString(params.recipientAddress.trim(), params.signer.client);
  const ownerLock = recipient.script;

  // First create an output with same-size placeholder args/data. This allows
  // CCC to select the first funding input. Once tx.inputs[0] exists, derive the
  // singleton capability ID from that input exactly like CKB Type ID.
  const placeholderType = capabilityTypeScript(params.deployment, issuerId, ZERO32);
  const placeholderData = encodeCapabilityHex({
    version: capabilityVersion,
    ...v2Fields,
    flags: params.flags,
    serviceId: params.serviceId,
    issuerId,
    capabilityId: ZERO32,
    expiry: params.expiry,
  });

  const tx = ccc.Transaction.from({
    outputs: [{ lock: ownerLock, type: placeholderType }],
    outputsData: [placeholderData],
  });
  addCapabilityCellDep(tx, params.deployment);
  await tx.completeInputsByCapacity(params.signer);
  if (!tx.inputs[0]) throw new Error("CCC did not select a funding input for capability issuance");
  assertNoCapabilityFundingInputs(tx, params.deployment);

  const capabilityId = deriveCapabilityId(tx.inputs[0], 0);
  const type = capabilityTypeScript(params.deployment, issuerId, capabilityId);
  const data = encodeCapabilityHex({
    version: capabilityVersion,
    ...v2Fields,
    flags: params.flags,
    serviceId: params.serviceId,
    issuerId,
    capabilityId,
    expiry: params.expiry,
  });

  // Same byte lengths as placeholders, so occupied capacity is unchanged.
  tx.outputs[0].type = type;
  tx.outputsData[0] = data;
  await tx.completeFeeBy(params.signer);
  assertNoCapabilityFundingInputs(tx, params.deployment);

  // completeFeeBy may append inputs, but it must not replace first input.
  const postFeeId = deriveCapabilityId(tx.inputs[0], 0);
  if (postFeeId.toLowerCase() !== capabilityId.toLowerCase()) {
    throw new Error("first transaction input changed while completing fee");
  }

  return {
    tx,
    issuerId,
    capabilityId,
    data,
    recipientAddress: params.recipientAddress.trim(),
    recipientLockHash: normalizeHex32(ownerLock.hash(), "recipientLockHash"),
  };
}

export async function buildTransferCapabilityTx(params: {
  signer: ccc.Signer;
  deployment: Deployment;
  outPoint: ccc.OutPointLike;
  recipientAddress: string;
}) {
  validateDeployment(params.deployment);
  const recipientAddress = String(params.recipientAddress || "").trim();
  if (!recipientAddress) throw new Error("recipientAddress is required");
  const cell = await params.signer.client.getCellLive(params.outPoint, true, true);
  if (!cell) throw new Error("Capability cell is not live (missing or consumed)");
  if (!cell.cellOutput.type) throw new Error("Cell has no Capability Type Script");
  if (
    cell.cellOutput.type.codeHash !== params.deployment.codeHash ||
    cell.cellOutput.type.hashType !== params.deployment.hashType
  ) {
    throw new Error("Cell is not from the configured SkillPass deployment");
  }

  const capability = decodeCapability(cell.outputData);
  if (cell.cellOutput.type.args.toLowerCase() !== encodeTypeArgs(capability).toLowerCase()) {
    throw new Error("Capability data does not match Type Script identity args");
  }
  const signerAddress = await params.signer.getRecommendedAddressObj();
  if (!cell.cellOutput.lock.eq(signerAddress.script)) {
    throw new Error("connected signer is not the current capability owner");
  }
  if (!hasFlag(capability, FLAG_TRANSFERABLE)) {
    throw new Error("Capability is non-transferable");
  }
  if (capability.version === 2 && capability.bindingMode === BINDING_ATOMIC) {
    throw new Error("atomic-bound Capability v2 must be transferred with its subject through a subject adapter");
  }
  if (!isActive(capability, BigInt(Math.floor(Date.now() / 1000)))) {
    throw new Error("refusing to transfer an expired capability");
  }
  const recipient = await ccc.Address.fromString(recipientAddress, params.signer.client);
  if (cell.cellOutput.lock.eq(recipient.script)) {
    throw new Error("recipient already owns this capability");
  }

  const tx = ccc.Transaction.default();
  addCapabilityCellDep(tx, params.deployment);
  tx.addInput(cell);
  tx.addOutput(
    {
      capacity: cell.cellOutput.capacity,
      lock: recipient.script,
      type: cell.cellOutput.type,
    },
    cell.outputData,
  );
  await tx.completeFeeBy(params.signer);

  // A transfer may legitimately consume the selected capability as input[0], but
  // fee completion must never consume a second SkillPass capability as capacity.
  for (const input of tx.inputs.slice(1)) {
    if (isCapabilityType(input.cellOutput?.type, params.deployment)) {
      throw new Error("refusing to use another SkillPass capability Cell as a transfer funding/fee input");
    }
  }

  // Safety postconditions: fee completion may append funding inputs/change, but
  // the capability transition itself must remain a one-to-one data/type-preserving
  // move whose only semantic change is the lock owner.
  if (!tx.inputs[0]?.previousOutput || tx.inputs[0].previousOutput.txHash !== cell.outPoint.txHash || tx.inputs[0].previousOutput.index !== cell.outPoint.index) {
    throw new Error("capability input changed while completing transfer fee");
  }
  const output = tx.outputs[0];
  if (!output?.type || output.type.codeHash !== cell.cellOutput.type.codeHash || output.type.hashType !== cell.cellOutput.type.hashType || output.type.args !== cell.cellOutput.type.args) {
    throw new Error("capability Type Script changed while completing transfer fee");
  }
  if (tx.outputsData[0] !== cell.outputData) throw new Error("capability data changed while completing transfer fee");
  if (!output.lock.eq(recipient.script)) throw new Error("capability recipient lock changed while completing transfer fee");
  return tx;
}

export async function sendAndWait(signer: ccc.Signer, tx: ccc.Transaction, timeoutMs = 120_000) {
  const txHash = await signer.sendTransaction(tx);
  const confirmed = await signer.client.waitTransaction(txHash, 1, timeoutMs, 2_000);
  if (!confirmed) throw new Error(`Transaction ${txHash} was not confirmed before timeout`);
  return { txHash, confirmed };
}

export async function discoverOwnedCapabilities(params: {
  signer: ccc.Signer;
  deployment: Deployment;
  expectedServiceId?: `0x${string}`;
  /** Preferred multi-service allowlist for gateway deployments. */
  expectedServiceIds?: Array<`0x${string}`>;
  /** Backward-compatible single issuer filter. */
  trustedIssuerId?: `0x${string}`;
  /** Preferred rotation-safe issuer allowlist. */
  trustedIssuerIds?: Array<`0x${string}`>;
  requireTransferable?: boolean;
}) {
  validateDeployment(params.deployment);
  const trustedIssuers = normalizeTrustedIssuerSet(params.trustedIssuerIds ?? params.trustedIssuerId);
  const expectedServices = params.expectedServiceIds?.length
    ? new Set(params.expectedServiceIds.map((value) => normalizeHex32(value, "expectedServiceId").toLowerCase()))
    : params.expectedServiceId
      ? new Set([normalizeHex32(params.expectedServiceId, "expectedServiceId").toLowerCase()])
      : null;
  const found: Array<{ cell: ccc.Cell; capability: ReturnType<typeof decodeCapability> }> = [];
  const owner = await params.signer.getRecommendedAddressObj();
  for await (const cell of params.signer.client.findCellsByLock(owner.script, undefined, true)) {
    const type = cell.cellOutput.type;
    if (!type) continue;
    if (type.codeHash !== params.deployment.codeHash || type.hashType !== params.deployment.hashType) {
      continue;
    }
    try {
      const capability = decodeCapability(cell.outputData);
      if (type.args.toLowerCase() !== encodeTypeArgs(capability).toLowerCase()) continue;
      if (expectedServices && !expectedServices.has(capability.serviceId.toLowerCase())) continue;
      if (trustedIssuers && !trustedIssuers.has(capability.issuerId.toLowerCase())) continue;
      if ((params.requireTransferable ?? false) && !hasFlag(capability, FLAG_TRANSFERABLE)) continue;
      found.push({ cell, capability });
    } catch {
      // Discovery stays robust even if a foreign malformed cell is indexed.
    }
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  found.sort((a, b) => {
    const activeDelta = Number(isActive(b.capability, now)) - Number(isActive(a.capability, now));
    if (activeDelta) return activeDelta;
    if (a.capability.expiry !== b.capability.expiry) return a.capability.expiry < b.capability.expiry ? -1 : 1;
    return a.capability.capabilityId.localeCompare(b.capability.capabilityId);
  });
  return found;
}

/** Resolve the current live owner without consulting a provider database. */
export async function findCurrentOwner(params: {
  client: ccc.Client;
  outPoint: ccc.OutPointLike;
}) {
  const cell = await params.client.getCellLive(params.outPoint, true, true);
  if (!cell) throw new Error("capability cell is missing or already consumed");
  return {
    cell,
    lock: cell.cellOutput.lock,
    lockHash: normalizeHex32(cell.cellOutput.lock.hash(), "currentOwnerLockHash"),
  };
}

/** Verify service authorization directly against the current live CKB cell. */
export async function verifyLiveCapability(params: {
  client: ccc.Client;
  deployment: Deployment;
  outPoint: ccc.OutPointLike;
  requesterAddress: string;
  expectedServiceId: `0x${string}`;
  trustedIssuerId?: `0x${string}`;
  trustedIssuerIds?: Array<`0x${string}`>;
  nowUnixSeconds: bigint;
  requireTransferable?: boolean;
}) {
  const cell = await params.client.getCellLive(params.outPoint, true, true);
  if (!cell) throw new Error("capability cell is missing or already consumed");

  const type = cell.cellOutput.type;
  if (!type) throw new Error("live cell has no Capability Type Script");
  if (type.codeHash !== params.deployment.codeHash || type.hashType !== params.deployment.hashType) {
    throw new Error("capability belongs to a different deployment");
  }

  const capability = decodeCapability(cell.outputData);
  if (type.args.toLowerCase() !== encodeTypeArgs(capability).toLowerCase()) {
    throw new Error("capability identity/data mismatch");
  }
  if (capability.serviceId.toLowerCase() !== normalizeHex32(params.expectedServiceId, "expectedServiceId").toLowerCase()) {
    throw new Error("capability is for a different service");
  }
  const trustedIssuers = normalizeTrustedIssuerSet(params.trustedIssuerIds ?? params.trustedIssuerId);
  if (!trustedIssuers || !trustedIssuers.has(capability.issuerId.toLowerCase())) {
    throw new Error("capability was not issued by a trusted service provider");
  }
  if ((params.requireTransferable ?? true) && !hasFlag(capability, FLAG_TRANSFERABLE)) {
    throw new Error("service policy requires a transferable capability");
  }
  if (!isActive(capability, params.nowUnixSeconds)) {
    throw new Error("capability is expired");
  }

  const requester = await ccc.Address.fromString(params.requesterAddress, params.client);
  if (!cell.cellOutput.lock.eq(requester.script)) {
    throw new Error("requester does not control the current capability cell");
  }

  return { cell, capability };
}
