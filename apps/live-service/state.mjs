import { JsonRecordStore } from "../../packages/x402-fiber/src/record-store.mjs";

export class LiveServiceState {
  constructor({ file = "", now = () => Date.now() } = {}) {
    this.store = new JsonRecordStore({ file, now });
    this.now = now;
  }

  quoteKey(hash) { return `quote:${String(hash).toLowerCase()}`; }
  receiptKey(hash) { return `receipt:${String(hash).toLowerCase()}`; }

  async setQuote(hash, quote) { return this.store.set(this.quoteKey(hash), quote); }
  async getQuote(hash) { return this.store.get(this.quoteKey(hash)); }
  async deleteQuote(hash) { return this.store.delete(this.quoteKey(hash)); }
  async setReceipt(hash, receipt) { return this.store.set(this.receiptKey(hash), receipt); }
  async getReceipt(hash) { return this.store.get(this.receiptKey(hash)); }

  async pruneExpiredQuotes() {
    const now = this.now();
    return this.store.prune((row, key) => key.startsWith("quote:") && Number(row.expiresAt || 0) <= now);
  }

  async pruneExpiredReceipts(ttlMs) {
    const now = this.now();
    return this.store.prune((row, key) => key.startsWith("receipt:") && Number(row.updatedAt || 0) + ttlMs <= now);
  }
}
