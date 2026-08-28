export class FacilitatorHttpError extends Error {
  constructor(message, { status = 0, body = null, endpoint = "" } = {}) {
    super(message);
    this.name = "FacilitatorHttpError";
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

export class FacilitatorHttpClient {
  constructor({ baseUrl = "http://127.0.0.1:8790", token = "", fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
    if (!fetchImpl) throw new Error("fetch implementation is required");
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async request(path, { method = "GET", body = undefined } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const endpoint = `${this.baseUrl}${path}`;
    try {
      const headers = { accept: "application/json" };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (this.token) headers.authorization = `Bearer ${this.token}`;
      const response = await this.fetchImpl(endpoint, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await response.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
      if (!response.ok) {
        throw new FacilitatorHttpError(parsed?.message || `facilitator HTTP ${response.status}`, {
          status: response.status,
          body: parsed,
          endpoint,
        });
      }
      return parsed;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new FacilitatorHttpError(`facilitator request timed out: ${path}`, { endpoint });
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  health() { return this.request("/health"); }
  ready() { return this.request("/readyz"); }
  supported() { return this.request("/supported"); }
  invoice(input) { return this.request("/invoice", { method: "POST", body: input }); }
  verify(input) { return this.request("/verify", { method: "POST", body: input }); }
  settle(input) { return this.request("/settle", { method: "POST", body: input }); }
}
