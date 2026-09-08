import { JsonRecordStore } from "../../packages/x402-fiber/src/record-store.mjs";

export class LiveServiceState {
  constructor({ file = "", store = null, now = () => Date.now() } = {}) {
    this.store = store || new JsonRecordStore({ file, now });
    this.now = now;
  }

  quoteKey(hash) { return `quote:${String(hash).toLowerCase()}`; }
  quoteBindingKey(binding) { return `quote-binding:${String(binding).toLowerCase()}`; }
  receiptKey(hash) { return `receipt:${String(hash).toLowerCase()}`; }

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
