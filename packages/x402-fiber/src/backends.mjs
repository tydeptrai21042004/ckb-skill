import { createHash, randomBytes } from "node:crypto";
import { FiberRpcClient, isFiberInvoicePaid } from "./fiber-rpc.mjs";

function hashPreimage(preimage) {
  const hex = String(preimage || "").replace(/^0x/, "");
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("payment preimage must be 32-byte hex");
  return `0x${createHash("sha256").update(Buffer.from(hex, "hex")).digest("hex")}`;
}

export class MockFiberBackend {
  #invoices = new Map();
  async createInvoice({ amount, currency = "Fibt", description = "SkillPass API call", expiry = 3600 }) {
    const paymentPreimage = `0x${randomBytes(32).toString("hex")}`;
    const paymentHash = hashPreimage(paymentPreimage);
    const invoice = `${currency.toLowerCase()}-mock-${paymentHash.slice(2)}`;
    this.#invoices.set(paymentHash.toLowerCase(), { paymentHash, paymentPreimage, invoice, amount: String(amount), currency, status: "open", description, expiry });
    return { invoice, paymentHash, amount: String(amount), currency };
  }
  async getInvoice(paymentHash) { return this.#invoices.get(String(paymentHash).toLowerCase()) ?? null; }
  async markPaid(paymentHash, payer = "mock-payer") {
    const row = this.#invoices.get(String(paymentHash).toLowerCase());
    if (!row) throw new Error("mock invoice not found");
    row.status = "paid"; row.payer = payer; row.paidAt = Date.now(); return row;
  }
  async isPaid(paymentHash) { return (await this.getInvoice(paymentHash))?.status === "paid"; }
  async health() { return { ok: true, backend: "mock" }; }
}

export class FnnFiberBackend {
  constructor({ rpcUrl, token = "", client = null } = {}) {
    this.client = client ?? new FiberRpcClient({ url: rpcUrl, token });
  }
  async createInvoice({ amount, currency = "Fibt", description = "SkillPass API call", expiry = 3600 }) {
    const paymentPreimage = `0x${randomBytes(32).toString("hex")}`;
    const result = await this.client.newInvoice({
      amount: `0x${BigInt(amount).toString(16)}`,
      currency,
      description,
      expiry: `0x${BigInt(expiry).toString(16)}`,
      final_cltv: "0x28",
      payment_preimage: paymentPreimage,
      hash_algorithm: "sha256",
    });
    const paymentHash = result?.invoice?.data?.payment_hash;
    if (!result?.invoice_address || !paymentHash) throw new Error("Fiber new_invoice response lacks invoice_address/payment_hash");
    return { invoice: result.invoice_address, paymentHash, amount: String(amount), currency };
  }
  async getInvoice(paymentHash) { return this.client.getInvoice(paymentHash); }
  async isPaid(paymentHash) { return isFiberInvoicePaid(await this.getInvoice(paymentHash)); }
  async health() { const info = await this.client.nodeInfo(); return { ok: true, backend: "fnn", node: info }; }
}

export { hashPreimage };
