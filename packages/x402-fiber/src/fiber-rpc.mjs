export class FiberRpcError extends Error {
  constructor(message, { code, data, method } = {}) {
    super(message);
    this.name = "FiberRpcError";
    this.code = code;
    this.data = data;
    this.method = method;
  }
}

export class FiberRpcClient {
  #id = 0;
  constructor({ url = "http://127.0.0.1:8227", token = "", fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
    if (!fetchImpl) throw new Error("fetch implementation is required");
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async call(method, params = []) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers = { "content-type": "application/json" };
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      const response = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.#id, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new FiberRpcError(`Fiber RPC HTTP ${response.status}`, { method });
      const body = await response.json();
      if (body.error) throw new FiberRpcError(body.error.message || `Fiber RPC ${method} failed`, { ...body.error, method });
      return body.result;
    } catch (error) {
      if (error?.name === "AbortError") throw new FiberRpcError(`Fiber RPC ${method} timed out`, { method });
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  newInvoice(params) { return this.call("new_invoice", [params]); }
  parseInvoice(invoice) { return this.call("parse_invoice", [{ invoice }]); }
  getInvoice(paymentHash) { return this.call("get_invoice", [{ payment_hash: paymentHash }]); }
  settleInvoice(paymentHash, paymentPreimage) { return this.call("settle_invoice", [{ payment_hash: paymentHash, payment_preimage: paymentPreimage }]); }
  sendPayment(params) { return this.call("send_payment", [params]); }
  getPayment(paymentHash) { return this.call("get_payment", [{ payment_hash: paymentHash }]); }
  nodeInfo() { return this.call("node_info", []); }
}

export function normalizeFiberInvoiceStatus(result) {
  const candidate = result?.status ?? result?.invoice_status ?? result?.state ?? result?.invoice?.status ?? result?.invoice?.state;
  return String(candidate ?? "unknown").toLowerCase();
}

export function isFiberInvoicePaid(result) {
  const status = normalizeFiberInvoiceStatus(result);
  return ["paid", "received", "settled", "succeeded", "success"].includes(status);
}
