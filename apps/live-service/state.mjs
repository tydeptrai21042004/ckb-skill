import { JsonRecordStore } from "../../packages/x402-fiber/src/record-store.mjs";

export const INVOCATION_STATES = Object.freeze([
  "AUTHORIZED",
  "PAYMENT_VERIFIED",
  "EXECUTION_RESERVED",
  "EXECUTED",
  "PAYMENT_SETTLED",
  "DELIVERED",
]);

const INVOCATION_STATE_RANK = Object.freeze(Object.fromEntries(INVOCATION_STATES.map((state, index) => [state, index])));

function stateError(message, code = "INVOCATION_STATE_CONFLICT") {
  return Object.assign(new Error(message), { status: 409, code });
}

export class LiveServiceState {
  constructor({ file = "", store = null, now = () => Date.now() } = {}) {
    this.store = store || new JsonRecordStore({ file, now });
    this.now = now;
  }

  quoteKey(hash) { return `quote:${String(hash).toLowerCase()}`; }
  quoteBindingKey(binding) { return `quote-binding:${String(binding).toLowerCase()}`; }
  receiptKey(hash) { return `receipt:${String(hash).toLowerCase()}`; }
  revocationKey(serviceSlug, capabilityId) {
    const service = String(serviceSlug || "").trim().toLowerCase();
    const capability = String(capabilityId || "").trim().toLowerCase();
    return `revocation:${service}:${capability}`;
  }
  revocationPrefix(serviceSlug) { return `revocation:${String(serviceSlug || "").trim().toLowerCase()}:`; }
  invocationKey(key) { return `invocation:${String(key || "").trim().toLowerCase()}`; }
  operationBindingKey(serviceSlug, capabilityId, operationId) {
    return `operation-binding:${String(serviceSlug || "").trim().toLowerCase()}:${String(capabilityId || "").trim().toLowerCase()}:${encodeURIComponent(String(operationId || "").trim())}`;
  }
  authorizationEvidenceKey(requestId) { return `authorization-evidence:${String(requestId || "").trim().toLowerCase()}`; }

  async setQuote(hash, quote) {
    const normalizedHash = String(hash).toLowerCase();
    const saved = await this.store.set(this.quoteKey(normalizedHash), quote);
    if (quote?.binding) {
      await this.store.set(this.quoteBindingKey(quote.binding), {
        paymentHash: normalizedHash,
        expiresAt: Number(quote.expiresAt || 0),
      });
    }
    return saved;
  }

  async getQuote(hash) { return this.store.get(this.quoteKey(hash)); }

  async getQuoteByBinding(binding) {
    const key = this.quoteBindingKey(binding);
    const pointer = await this.store.get(key);
    if (!pointer) return null;
    if (Number(pointer.expiresAt || 0) <= this.now()) {
      await this.store.delete(key);
      return null;
    }
    const quote = await this.getQuote(pointer.paymentHash);
    if (!quote || quote.binding !== binding || Number(quote.expiresAt || 0) <= this.now()) {
      await this.store.delete(key);
      return null;
    }
    return quote;
  }

  async deleteQuote(hash) {
    const normalizedHash = String(hash).toLowerCase();
    const quote = await this.getQuote(normalizedHash);
    const removed = await this.store.delete(this.quoteKey(normalizedHash));
    if (quote?.binding) {
      const pointerKey = this.quoteBindingKey(quote.binding);
      const pointer = await this.store.get(pointerKey);
      if (String(pointer?.paymentHash || "").toLowerCase() === normalizedHash) {
        await this.store.delete(pointerKey);
      }
    }
    return removed;
  }

  async setReceipt(hash, receipt) { return this.store.set(this.receiptKey(hash), receipt); }
  async getReceipt(hash) { return this.store.get(this.receiptKey(hash)); }

  async setRevocation(serviceSlug, capabilityId, record = {}) {
    const key = this.revocationKey(serviceSlug, capabilityId);
    return this.store.set(key, {
      service: String(serviceSlug || "").trim().toLowerCase(),
      capabilityId: String(capabilityId || "").trim().toLowerCase(),
      revokedAt: Number(record.revokedAt || this.now()),
      ...record,
    });
  }

  async getRevocation(serviceSlug, capabilityId) {
    return this.store.get(this.revocationKey(serviceSlug, capabilityId));
  }

  async deleteRevocation(serviceSlug, capabilityId) {
    return this.store.delete(this.revocationKey(serviceSlug, capabilityId));
  }

  async listRevocations(serviceSlug, { limit = 100 } = {}) {
    if (typeof this.store.listPrefix !== "function") throw new Error("record store does not support prefix listing");
    return this.store.listPrefix(this.revocationPrefix(serviceSlug), { limit });
  }

  async beginInvocation({
    invocationKey, serviceSlug, capabilityId, capabilityOutPoint, operationId = "", requestHash,
    ownerLockHash = "", principalAddress = "", paymentRequired = false, expiresAt = 0,
  } = {}) {
    const key = String(invocationKey || "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("invocationKey must be a SHA-256 hex digest");
    const request = String(requestHash || "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(request)) throw new Error("requestHash must be a SHA-256 hex digest");
    const service = String(serviceSlug || "").trim().toLowerCase();
    const capability = String(capabilityId || "").trim().toLowerCase();
    if (!service || !capability) throw new Error("serviceSlug and capabilityId are required");

    if (operationId) {
      const bindingKey = this.operationBindingKey(service, capability, operationId);
      const binding = { service, capabilityId: capability, operationId: String(operationId), requestHash: request, invocationKey: key, ...(expiresAt ? { expiresAt } : {}) };
      const result = typeof this.store.setIfAbsent === "function"
        ? await this.store.setIfAbsent(bindingKey, binding)
        : { inserted: !(await this.store.get(bindingKey)), record: null };
      const current = result.record || await this.store.get(bindingKey);
      if (!result.inserted && current && (current.requestHash !== request || current.invocationKey !== key)) {
        throw stateError("operationId was already bound to a different request", "IDEMPOTENCY_KEY_REUSE");
      }
      if (!current && !result.inserted) await this.store.set(bindingKey, binding);
    }

    const invocationRecord = {
      state: "AUTHORIZED", service, capabilityId: capability, capabilityOutPoint, operationId: String(operationId || ""),
      requestHash: request, ownerLockHash: String(ownerLockHash || ""), principalAddress: String(principalAddress || ""),
      paymentRequired: Boolean(paymentRequired), createdAt: this.now(), ...(expiresAt ? { expiresAt } : {}),
    };
    const recordKey = this.invocationKey(key);
    const result = typeof this.store.setIfAbsent === "function"
      ? await this.store.setIfAbsent(recordKey, invocationRecord)
      : { inserted: !(await this.store.get(recordKey)), record: null };
    if (!result.inserted && !result.record) return this.store.get(recordKey);
    const current = result.record;
    if (current && (current.requestHash !== request || current.capabilityId !== capability || current.service !== service)) {
      throw stateError("invocation key collision detected", "INVOCATION_KEY_COLLISION");
    }
    return current;
  }

  async getInvocation(invocationKey) { return this.store.get(this.invocationKey(invocationKey)); }

  async advanceInvocation(invocationKey, { expectedStates, state, patch = {} } = {}) {
    if (!Object.hasOwn(INVOCATION_STATE_RANK, state)) throw new Error(`unknown invocation state: ${state}`);
    const key = this.invocationKey(invocationKey);
    const current = await this.store.get(key);
    if (!current) throw stateError("invocation record not found", "INVOCATION_NOT_FOUND");
    const currentRank = INVOCATION_STATE_RANK[current.state];
    const targetRank = INVOCATION_STATE_RANK[state];
    if (current.state === state || currentRank > targetRank) return current;
    const allowed = Array.isArray(expectedStates) ? expectedStates : [expectedStates];
    if (!allowed.includes(current.state)) throw stateError(`cannot transition invocation from ${current.state} to ${state}`);
    const next = { ...current, ...patch, state };
    if (typeof this.store.compareAndSetState === "function") {
      const result = await this.store.compareAndSetState(key, allowed, next);
      if (result.updated) return result.record;
      const latest = result.record || await this.store.get(key);
      if (latest && INVOCATION_STATE_RANK[latest.state] >= targetRank) return latest;
      throw stateError(`concurrent invocation transition prevented ${state}`);
    }
    return this.store.set(key, next);
  }

  async setAuthorizationEvidence(requestId, evidence) {
    const key = this.authorizationEvidenceKey(requestId);
    if (typeof this.store.setIfAbsent === "function") {
      const result = await this.store.setIfAbsent(key, evidence);
      if (!result.inserted && result.record?.evidenceHash !== evidence?.evidenceHash) {
        throw stateError("authorization evidence requestId collision detected", "AUTHORIZATION_EVIDENCE_COLLISION");
      }
      return result.record;
    }
    const current = await this.store.get(key);
    if (current && current.evidenceHash !== evidence?.evidenceHash) throw stateError("authorization evidence requestId collision detected", "AUTHORIZATION_EVIDENCE_COLLISION");
    return current || this.store.set(key, evidence);
  }

  async getAuthorizationEvidence(requestId) { return this.store.get(this.authorizationEvidenceKey(requestId)); }

  async pruneExpiredInvocations() {
    const now = this.now();
    if (typeof this.store.pruneExpiredByExpiresAt === "function") {
      const prefixes = ["invocation:", "operation-binding:", "authorization-evidence:"];
      const counts = await Promise.all(prefixes.map((prefix) => this.store.pruneExpiredByExpiresAt(prefix, now)));
      return counts.reduce((sum, value) => sum + Number(value || 0), 0);
    }
    return this.store.prune((row, key) => (key.startsWith("invocation:") || key.startsWith("operation-binding:") || key.startsWith("authorization-evidence:")) && Number(row.expiresAt || 0) > 0 && Number(row.expiresAt) <= now);
  }

  async pruneExpiredQuotes() {
    const now = this.now();
    if (typeof this.store.pruneExpiredByExpiresAt === "function") {
      const [quotes, pointers] = await Promise.all([
        this.store.pruneExpiredByExpiresAt("quote:", now),
        this.store.pruneExpiredByExpiresAt("quote-binding:", now),
      ]);
      return Number(quotes || 0) + Number(pointers || 0);
    }
    return this.store.prune((row, key) =>
      (key.startsWith("quote:") || key.startsWith("quote-binding:")) && Number(row.expiresAt || 0) <= now,
    );
  }

  async pruneExpiredReceipts(ttlMs) {
    const before = this.now() - ttlMs;
    if (typeof this.store.pruneUpdatedBefore === "function") {
      return this.store.pruneUpdatedBefore("receipt:", before);
    }
    return this.store.prune((row, key) => key.startsWith("receipt:") && Number(row.updatedAt || 0) <= before);
  }
}
