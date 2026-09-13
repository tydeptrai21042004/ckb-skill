const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function text(value, field, { min = 1, max = 512 } = {}) {
  const out = String(value ?? "").trim();
  if (out.length < min || out.length > max || /[\r\n]/.test(out)) throw new Error(`${field} is invalid`);
  return out;
}

function hex32(value, field) {
  const out = String(value ?? "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(out)) throw new Error(`${field} must be a 32-byte 0x-prefixed hex value`);
  return out;
}

function sha256Hex(value, field) {
  const out = String(value ?? "").trim().toLowerCase().replace(/^sha256:/, "");
  if (!/^[0-9a-f]{64}$/.test(out)) throw new Error(`${field} must be a SHA-256 hex digest`);
  return out;
}

function outPointBinding(value) {
  if (typeof value === "string") {
    const match = value.trim().toLowerCase().match(/^(0x[0-9a-f]{64}):([0-9]+)$/);
    if (!match) throw new Error("capabilityOutPoint is invalid");
    const index = BigInt(match[2]);
    if (index < 0n || index > 0xffff_ffffn) throw new Error("capabilityOutPoint index is invalid");
    return `${match[1]}:${index}`;
  }
  if (!value || typeof value !== "object") throw new Error("capabilityOutPoint is required");
  const txHash = hex32(value.txHash, "capabilityOutPoint.txHash");
  let index;
  try { index = BigInt(value.index); } catch { throw new Error("capabilityOutPoint.index is invalid"); }
  if (index < 0n || index > 0xffff_ffffn) throw new Error("capabilityOutPoint.index is invalid");
  return `${txHash}:${index}`;
}

/**
 * Canonical wallet-signature message used by every SkillPass client/server.
 * Keep this function as the single serialization point for authorization intent.
 */
export function formatAuthorizationIntent(input = {}) {
  const action = text(input.action || "invoke", "action", { max: 64 }).toLowerCase();
  if (!/^[a-z][a-z0-9:_-]{0,63}$/.test(action)) throw new Error("action is invalid");
  const serviceSlug = text(input.serviceSlug, "serviceSlug", { max: 64 }).toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(serviceSlug)) throw new Error("serviceSlug is invalid");
  const serviceId = hex32(input.serviceId, "serviceId");
  const policyId = text(input.policyId, "policyId", { max: 128 });
  const policyFingerprint = sha256Hex(input.policyFingerprint, "policyFingerprint");
  const requestHash = sha256Hex(input.requestHash, "requestHash");
  const operationId = String(input.operationId || "").trim();
  if (operationId && (!SAFE_ID.test(operationId) || operationId.length < 8)) throw new Error("operationId is invalid");
  const delegationId = String(input.delegationId || "direct").trim().toLowerCase();
  if (delegationId !== "direct" && !/^[0-9a-f]{32}$/.test(delegationId)) throw new Error("delegationId is invalid");
  const address = text(input.address, "address", { max: 256 });
  const nonce = text(input.nonce, "nonce", { max: 256 });
  const expiresAt = Number(input.expiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) throw new Error("expiresAt must be a positive integer millisecond timestamp");

  const lines = [
    "SkillPass Authorization Intent v1",
    `action=${action}`,
    `service=${serviceSlug}`,
    `service_id=${serviceId}`,
    `policy_id=${policyId}`,
    `policy_fingerprint=${policyFingerprint}`,
    `capability_outpoint=${outPointBinding(input.capabilityOutPoint)}`,
    `request_hash=${requestHash}`,
  ];
  if (operationId) lines.push(`operation_id=${operationId}`);
  lines.push(
    `delegation_id=${delegationId}`,
    `address=${address}`,
    `nonce=${nonce}`,
    `expires_at=${expiresAt}`,
  );
  return lines.join("\n");
}

export function authorizationIntentFields(input = {}) {
  const message = formatAuthorizationIntent(input);
  return Object.freeze(Object.fromEntries(message.split("\n").slice(1).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1)];
  })));
}
