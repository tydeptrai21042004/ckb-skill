export function buildDiscovery({ deployment, serviceId, payments, maxInputChars = 20_000 } = {}) {
  return Object.freeze({
    schemaVersion: "1.0",
    product: "SkillPass",
    service: {
      id: serviceId,
      name: "paper-analyzer-v1",
      endpoint: "/api/analyze",
      method: "POST",
      maxInputChars,
    },
    chain: {
      network: "ckb-testnet",
      authorizationModel: "current-live-capability-cell-owner",
      capabilityTypeScript: deployment,
    },
    authentication: {
      scheme: "ckb-wallet-one-time-challenge",
      challengeEndpoint: "/api/challenge",
      signatureRequired: true,
      privateKeyLocation: "user-wallet-only",
    },
    payment: payments?.required ? {
      required: true,
      protocol: "x402",
      x402Version: 2,
      rail: "fiber",
      network: payments.network,
      amount: payments.amount,
      asset: payments.asset,
      proofMode: payments.proofMode,
    } : { required: false },
    health: {
      liveness: "/livez",
      readiness: "/readyz",
      status: "/api/status",
    },
    api: {
      openapi: "/api/openapi.json",
      runtimeConfig: "/api/config",
    },
  });
}

export function buildOpenApi({ paymentsRequired = false, maxInputChars = 20_000 } = {}) {
  return Object.freeze({
    openapi: "3.1.0",
    info: {
      title: "SkillPass protected service API",
      version: "0.7.0",
      description: "CKB live Capability Cell authorization with optional Fiber/x402 payment.",
    },
    paths: {
      "/api/status": {
        get: { summary: "Read sanitized deployment readiness", responses: { "200": { description: "Ready" }, "503": { description: "Required dependency unavailable" } } },
      },
      "/api/challenge": {
        post: {
          summary: "Create a one-time wallet-signature challenge",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["address"], properties: { address: { type: "string", description: "CKB testnet address" } } } } } },
          responses: { "200": { description: "Challenge created" } },
        },
      },
      "/api/analyze": {
        post: {
          summary: "Use paper-analyzer-v1 with current CKB capability ownership",
          description: paymentsRequired ? "May return HTTP 402 with PAYMENT-REQUIRED before protected execution." : "Payment is disabled in this deployment.",
          parameters: paymentsRequired ? [{ name: "PAYMENT-SIGNATURE", in: "header", required: false, schema: { type: "string" }, description: "Base64 JSON x402 v2 payment payload when retrying a 402 response." }] : [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["address", "nonce", "signature", "outPoint", "text"],
                  properties: {
                    address: { type: "string" },
                    nonce: { type: "string" },
                    signature: { type: "object" },
                    outPoint: { type: "object", required: ["txHash", "index"], properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, index: { type: "string" } } },
                    text: { type: "string", minLength: 1, maxLength: maxInputChars },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Authorized protected result" },
            ...(paymentsRequired ? { "402": { description: "Fiber/x402 payment required" } } : {}),
            "401": { description: "Wallet challenge/signature rejected" },
            "403": { description: "Capability missing, expired, wrong service, or not owned by requester" },
          },
        },
      },
    },
  });
}
