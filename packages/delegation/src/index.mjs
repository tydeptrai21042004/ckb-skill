function hex64(value, field) {
  const v = String(value || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(v)) throw new Error(`${field} must be a 32-byte 0x-prefixed hex value`);
  return v;
}

function outPoint(value) {
  if (!value || typeof value !== "object") throw new Error("outPoint is required");
  const txHash = hex64(value.txHash, "outPoint.txHash");
  let index;
  try { index = BigInt(value.index); } catch { throw new Error("outPoint.index is invalid"); }
  if (index < 0n || index > 0xffff_ffffn) throw new Error("outPoint.index is invalid");
  return { txHash, index: index.toString() };
}

function normalizeSpendLimit(value) {
  const raw = String(value ?? "").trim();
  if (!/^[1-9][0-9]{0,77}$/.test(raw)) throw new Error("delegation maxSpendAtomic must be a positive atomic-unit integer string");
  return BigInt(raw).toString();
}

function normalizeLimits(value, { required = false } = {}) {
  if (value == null) {
    if (required) throw new Error("delegation v2 requires at least one usage limit");
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("delegation limits must be an object");
  const out = {};
  if (value.maxUses != null && value.maxUses !== "") {
    const maxUses = Number(value.maxUses);
    if (!Number.isSafeInteger(maxUses) || maxUses < 1 || maxUses > 10_000) throw new Error("delegation maxUses must be 1..10000");
    out.maxUses = maxUses;
  }
  if (value.maxSpendAtomic != null && value.maxSpendAtomic !== "") out.maxSpendAtomic = normalizeSpendLimit(value.maxSpendAtomic);
  if (!Object.keys(out).length) {
    if (required) throw new Error("delegation v2 requires at least one usage limit");
    return null;
  }
  return Object.freeze(out);
}

export function normalizeDelegationGrant(value, { now = Date.now(), maxLifetimeMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!value || typeof value !== "object") throw new Error("delegation grant is required");
  const version = Number(value.version ?? 1);
  if (![1, 2].includes(version)) throw new Error("delegation version is unsupported");
  const grantId = String(value.grantId || "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(grantId)) throw new Error("delegation grantId must be 16 random bytes in hex");
  const ownerAddress = String(value.ownerAddress || "").trim();
  const delegateAddress = String(value.delegateAddress || "").trim();
  if (ownerAddress.length < 8 || ownerAddress.length > 256) throw new Error("delegation ownerAddress is invalid");
  if (delegateAddress.length < 8 || delegateAddress.length > 256) throw new Error("delegation delegateAddress is invalid");
  if (ownerAddress === delegateAddress) throw new Error("delegation must target a different address");
  const serviceSlug = String(value.serviceSlug || "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(serviceSlug)) throw new Error("delegation serviceSlug is invalid");
  const serviceId = hex64(value.serviceId, "delegation.serviceId");
  const capabilityId = hex64(value.capabilityId, "delegation.capabilityId");
  const capabilityOutPoint = outPoint(value.capabilityOutPoint);
  const action = String(value.action || "invoke").trim().toLowerCase();
  if (!/^[a-z][a-z0-9:_-]{0,63}$/.test(action)) throw new Error("delegation action is invalid");
  const issuedAt = Number(value.issuedAt);
  const expiresAt = Number(value.expiresAt);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) throw new Error("delegation timestamps must be integer milliseconds");
  if (expiresAt <= issuedAt) throw new Error("delegation expiry must be after issuance");
  if (expiresAt - issuedAt > maxLifetimeMs) throw new Error("delegation lifetime exceeds policy maximum");
  if (issuedAt > now + 5 * 60_000) throw new Error("delegation issuance is too far in the future");
  const limits = version === 2 ? normalizeLimits(value.limits, { required: true }) : null;
  return Object.freeze({ version, grantId, ownerAddress, delegateAddress, serviceSlug, serviceId, capabilityId, capabilityOutPoint, action, issuedAt, expiresAt, ...(limits ? { limits } : {}) });
}

export function buildDelegationMessage(grant) {
  const g = normalizeDelegationGrant(grant, { now: Number(grant?.issuedAt || Date.now()), maxLifetimeMs: Number.MAX_SAFE_INTEGER });
  const lines = [
    "SkillPass delegated service access",
    `version=${g.version}`,
    `grant_id=${g.grantId}`,
    `owner=${g.ownerAddress}`,
    `delegate=${g.delegateAddress}`,
    `service=${g.serviceSlug}`,
    `service_id=${g.serviceId}`,
    `capability_id=${g.capabilityId}`,
    `capability_outpoint=${g.capabilityOutPoint.txHash}:${g.capabilityOutPoint.index}`,
    `action=${g.action}`,
    `issued_at=${g.issuedAt}`,
    `expires_at=${g.expiresAt}`,
  ];
  if (g.version >= 2) {
    lines.push(`max_uses=${g.limits?.maxUses ?? "unlimited"}`);
    lines.push(`max_spend_atomic=${g.limits?.maxSpendAtomic ?? "unlimited"}`);
  }
  return lines.join("\n");
}

export function assertDelegationScope(grant, { delegateAddress, serviceSlug, serviceId, capabilityId, outPoint: expectedOutPoint, action = "invoke", now = Date.now(), maxLifetimeMs } = {}) {
  const g = normalizeDelegationGrant(grant, { now, maxLifetimeMs });
  if (now >= g.expiresAt) throw new Error("delegation is expired");
  if (delegateAddress && g.delegateAddress !== delegateAddress) throw new Error("delegation is for a different delegate");
  if (serviceSlug && g.serviceSlug !== String(serviceSlug).toLowerCase()) throw new Error("delegation is for a different service");
  if (serviceId && g.serviceId !== String(serviceId).toLowerCase()) throw new Error("delegation service identity mismatch");
  if (capabilityId && g.capabilityId !== String(capabilityId).toLowerCase()) throw new Error("delegation capability identity mismatch");
  if (action && g.action !== String(action).toLowerCase()) throw new Error("delegation does not allow this action");
  if (expectedOutPoint) {
    const expected = outPoint(expectedOutPoint);
    if (g.capabilityOutPoint.txHash !== expected.txHash || g.capabilityOutPoint.index !== expected.index) throw new Error("delegation is bound to a different capability outpoint");
  }
  return g;
}
