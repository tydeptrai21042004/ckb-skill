const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const POSITIVE_INTEGER = /^(0|[1-9][0-9]*)$/;

export const X402_VERSION = 2;
export const FIBER_SCHEME = "exact";
export const FIBER_TESTNET = "ckb:fiber-testnet";
export const FIBER_MAINNET = "ckb:fiber-mainnet";
export const FIBER_TRANSFER_METHOD = "fiber-invoice";

export function normalizeNetwork(network) {
  if (![FIBER_TESTNET, FIBER_MAINNET].includes(network)) {
    throw new Error(`unsupported Fiber x402 network: ${network}`);
  }
  return network;
}

export function validateRequirements(req) {
  if (!req || typeof req !== "object") throw new Error("paymentRequirements must be an object");
  if (req.scheme !== FIBER_SCHEME) throw new Error(`unsupported scheme: ${req.scheme}`);
  normalizeNetwork(req.network);
  if (typeof req.amount !== "string" || !POSITIVE_INTEGER.test(req.amount) || BigInt(req.amount) <= 0n) {
    throw new Error("paymentRequirements.amount must be a positive atomic-unit integer string");
  }
  if (typeof req.asset !== "string" || req.asset.length === 0) throw new Error("paymentRequirements.asset is required");
  if (typeof req.payTo !== "string" || req.payTo.length === 0) throw new Error("paymentRequirements.payTo is required");
  if (!Number.isSafeInteger(req.maxTimeoutSeconds) || req.maxTimeoutSeconds <= 0 || req.maxTimeoutSeconds > 3600) {
    throw new Error("paymentRequirements.maxTimeoutSeconds must be 1..3600");
  }
  if (!req.extra || typeof req.extra !== "object") throw new Error("paymentRequirements.extra is required");
  if (req.extra.assetTransferMethod !== FIBER_TRANSFER_METHOD) throw new Error("unsupported Fiber assetTransferMethod");
  if ((req.extra.paymentFlow ?? "authorization") !== "authorization") throw new Error("only authorization flow is supported by this prototype");
  if (typeof req.extra.invoice !== "string" || req.extra.invoice.length < 16) throw new Error("paymentRequirements.extra.invoice is required");
  if (!HEX32.test(String(req.extra.paymentHash || ""))) throw new Error("paymentRequirements.extra.paymentHash must be 32-byte hex");
  return req;
}

export function validatePayload(payload, requirements) {
  if (!payload || typeof payload !== "object") throw new Error("paymentPayload must be an object");
  if (payload.x402Version !== X402_VERSION) throw new Error("paymentPayload.x402Version must be 2");
  validateRequirements(payload.accepted);
  validateRequirements(requirements);
  for (const field of ["scheme", "network", "amount", "asset", "payTo"]) {
    if (String(payload.accepted[field]) !== String(requirements[field])) throw new Error(`payment accepted.${field} does not match requirements`);
  }
  if (payload.accepted.extra.invoice !== requirements.extra.invoice) throw new Error("payment invoice does not match requirements");
  if (String(payload.accepted.extra.paymentHash).toLowerCase() !== String(requirements.extra.paymentHash).toLowerCase()) {
    throw new Error("payment hash does not match requirements");
  }
  const p = payload.payload;
  if (!p || typeof p !== "object") throw new Error("paymentPayload.payload is required");
  if (!HEX32.test(String(p.paymentHash || ""))) throw new Error("payload.paymentHash must be 32-byte hex");
  if (String(p.paymentHash).toLowerCase() !== String(requirements.extra.paymentHash).toLowerCase()) throw new Error("payload payment hash mismatch");
  if (p.invoice !== requirements.extra.invoice) throw new Error("payload invoice mismatch");
  if (p.payer != null && (typeof p.payer !== "string" || p.payer.length > 256)) throw new Error("payload.payer is invalid");
  return payload;
}

export function makePaymentRequired({ resource, requirement, error = "PAYMENT-SIGNATURE header is required" }) {
  validateRequirements(requirement);
  if (!resource || typeof resource.url !== "string" || typeof resource.mimeType !== "string") throw new Error("resource url/mimeType required");
  return {
    x402Version: X402_VERSION,
    error,
    resource,
    accepts: [requirement],
    extensions: {
      "io.nervos.skillpass": {
        info: {
          status: "experimental",
          note: "Fiber exact/invoice scheme prototype; scheme-network registration is not yet standardized."
        },
        schema: { type: "object" }
      }
    }
  };
}

export function makePaymentPayload({ resource, requirement, payer = "fiber-payer" }) {
  validateRequirements(requirement);
  return {
    x402Version: X402_VERSION,
    resource,
    accepted: requirement,
    payload: {
      invoice: requirement.extra.invoice,
      paymentHash: requirement.extra.paymentHash,
      payer
    },
    extensions: {}
  };
}
