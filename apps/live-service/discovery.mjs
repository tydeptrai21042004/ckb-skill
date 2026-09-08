export function buildDiscovery({ deployment, serviceId, trustedIssuerId, trustedIssuerIds, policy, payments, maxInputChars = 20_000 } = {}) {
  const issuers = Array.isArray(trustedIssuerIds) && trustedIssuerIds.length ? trustedIssuerIds : (trustedIssuerId ? [trustedIssuerId] : []);
  return Object.freeze({
    schemaVersion: "1.1",
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
      trustedIssuerId: issuers[0] || null,
      trustedIssuerIds: issuers,
      issuerRotationSupported: issuers.length > 1,
      providerPolicy: policy ? {
        id: policy.id,
        fingerprint: policy.fingerprint || null,
        transferableRequired: Boolean(policy.transferableRequired),
        termsHash: policy.termsHash || null,
        url: policy.url || null,
      } : undefined,
    },
    authentication: {
      scheme: "ckb-wallet-one-time-intent-challenge",
      challengeEndpoint: "/api/challenge",
      signatureRequired: true,
      intentBinding: ["action", "capability_outpoint", "request_hash", "policy_fingerprint"],
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
      quoteReuse: "same-bound-request-until-expiry",
    } : { required: false },
    health: {
      liveness: "/livez",
      readiness: "/readyz",
      status: "/api/status",
      capabilityStatus: "/api/capability/status",
    },
    api: {
      openapi: "/api/openapi.json",
      runtimeConfig: "/api/config",
    },
  });
}

export function buildOpenApi({ paymentsRequired = false, maxInputChars = 20_000 } = {}) {
  const outPointSchema = { type: "object", required: ["txHash", "index"], properties: { txHash: { type: "string", pattern: "^0x[0-9a-fA-F]{64}$" }, index: { type: "string" } } };
  return Object.freeze({
    openapi: "3.1.0",
    info: {
      title: "SkillPass protected service API",
      version: "0.8.0",
      description: "Provider-issued portable service-right authorization on live CKB Cells with intent-bound wallet authentication and optional Fiber/x402 per-use payment.",
    },
    paths: {
      "/api/status": {
        get: { summary: "Read sanitized service status", responses: { "200": { description: "Service alive" } } },
      },
      "/api/capability/status": {
        post: {
          summary: "Inspect a SkillPass capability from fresh CKB state",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["outPoint"], properties: { outPoint: outPointSchema } } } } },
          responses: { "200": { description: "Capability is live and satisfies provider policy" }, "403": { description: "Capability is consumed or violates service policy" } },
        },
      },
      "/api/challenge": {
        post: {
          summary: "Create a one-time wallet intent-signature challenge",
          requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["address", "outPoint", "requestHash"], properties: { address: { type: "string", description: "CKB testnet address" }, outPoint: outPointSchema, requestHash: { type: "string", pattern: "^[0-9a-fA-F]{64}$", description: "SHA-256 of the exact analysis text" } } } } } },
          responses: { "200": { description: "Intent-bound challenge created" } },
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
                    outPoint: outPointSchema,
                    text: { type: "string", minLength: 1, maxLength: maxInputChars },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Authorized protected result" },
            ...(paymentsRequired ? { "402": { description: "Fiber/x402 payment required" } } : {}),
            "401": { description: "Wallet challenge/signature or signed intent rejected" },
            "403": { description: "Capability missing, expired, wrong service, untrusted issuer, non-portable, or not owned by requester" },
          },
        },
      },
    },
  });
}
