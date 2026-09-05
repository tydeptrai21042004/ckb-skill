import { createHash, timingSafeEqual } from "node:crypto";
import { ReplayStore } from "./replay-store.mjs";
import { hashPreimage } from "./backends.mjs";
import { FIBER_SCHEME, FIBER_TESTNET, validatePayload, validateRequirements } from "./scheme.mjs";

function settlementFingerprint(requirement, payer, proofMode) {
  const canonical = {
    scheme: requirement.scheme,
    network: requirement.network,
    amount: requirement.amount,
    asset: requirement.asset,
    payTo: requirement.payTo,
    maxTimeoutSeconds: requirement.maxTimeoutSeconds,
    invoice: requirement.extra.invoice,
    paymentHash: String(requirement.extra.paymentHash).toLowerCase(),
    assetTransferMethod: requirement.extra.assetTransferMethod,
    paymentFlow: requirement.extra.paymentFlow ?? "authorization",
    payer: payer ?? "",
    proofMode,
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function replayRecordMatches(record, requirement, payer, proofMode) {
  const current = settlementFingerprint(requirement, payer, proofMode);
  if (record?.fingerprint) return record.fingerprint === current;
  // Migration compatibility for replay rows written by earlier project
  // versions. Compare every field that those rows actually persisted.
  if (record?.payer != null && String(record.payer) !== String(payer ?? "")) return false;
  if (record?.amount != null && String(record.amount) !== String(requirement.amount)) return false;
  if (record?.network != null && String(record.network) !== String(requirement.network)) return false;
  if (record?.proofMode != null && String(record.proofMode) !== String(proofMode)) return false;
  return true;
}

function idempotentSettlement(record, requirement, payer, proofMode) {
  if (!replayRecordMatches(record, requirement, payer, proofMode)) {
    return { success: false, errorReason: "payment_already_consumed", payer, transaction: "", network: requirement.network };
  }
  return {
    success: true,
    payer: record.payer ?? payer,
    transaction: requirement.extra.paymentHash,
    network: record.network ?? requirement.network,
    amount: record.amount ?? requirement.amount,
    extensions: {
      "io.nervos.skillpass": {
        settlement: "fiber_invoice_already_consumed",
        paymentProof: record.proofMode ?? proofMode,
        idempotent: true,
      },
    },
  };
}

export class FiberFacilitator {
  constructor({ backend, replayStore = new ReplayStore(), network = FIBER_TESTNET, proofMode = "invoice-status" } = {}) {
    if (!backend) throw new Error("Fiber backend is required");
    if (!["invoice-status", "preimage"].includes(proofMode)) throw new Error("proofMode must be invoice-status or preimage");
    this.backend = backend;
    this.replayStore = replayStore;
    this.network = network;
    this.proofMode = proofMode;
  }

  supported() {
    return {
      kinds: [{ x402Version: 2, scheme: FIBER_SCHEME, network: this.network }],
      extensions: ["io.nervos.skillpass"],
      signers: {},
      extra: { paymentProof: this.proofMode },
    };
  }

  async verify({ x402Version, paymentPayload, paymentRequirements }) {
    try {
      if (x402Version !== 2) throw new Error("x402Version must be 2");
      validateRequirements(paymentRequirements);
      validatePayload(paymentPayload, paymentRequirements);
      const hash = paymentRequirements.extra.paymentHash;
      if (await this.replayStore.has(hash)) return { isValid: false, invalidReason: "payment_already_consumed", payer: paymentPayload.payload.payer };
      if (this.proofMode === "preimage") {
        const preimage = paymentPayload.payload.paymentPreimage;
        if (!preimage) return { isValid: false, invalidReason: "payment_preimage_required", payer: paymentPayload.payload.payer };
        const expected = Buffer.from(String(hash).slice(2).toLowerCase(), "hex");
        const actual = Buffer.from(hashPreimage(preimage).slice(2).toLowerCase(), "hex");
        if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
          return { isValid: false, invalidReason: "payment_preimage_mismatch", payer: paymentPayload.payload.payer };
        }
      }
      const paid = await this.backend.isPaid(hash);
      if (!paid) return { isValid: false, invalidReason: "fiber_invoice_not_paid", payer: paymentPayload.payload.payer };
      return { isValid: true, payer: paymentPayload.payload.payer, extra: { paymentHash: hash, paymentProof: this.proofMode } };
    } catch (error) {
      return { isValid: false, invalidReason: `invalid_fiber_payment:${error.message}` };
    }
  }

  async settle({ x402Version, paymentPayload, paymentRequirements }) {
    // Settlement is intentionally idempotent. If the facilitator successfully
    // consumed an invoice but the service crashed before persisting/delivering
    // its response, a retry should recover the same receipt rather than force a
    // second payment. verify() remains replay-strict for normal authorization.
    try {
      if (x402Version !== 2) throw new Error("x402Version must be 2");
      validateRequirements(paymentRequirements);
      validatePayload(paymentPayload, paymentRequirements);
    } catch (error) {
      return { success: false, errorReason: `invalid_fiber_payment:${error.message}`, payer: paymentPayload?.payload?.payer, transaction: "", network: paymentRequirements?.network ?? this.network };
    }

    const hash = paymentRequirements.extra.paymentHash;
    const payer = paymentPayload.payload.payer;
    const existing = await this.replayStore.get(hash);
    if (existing) return idempotentSettlement(existing, paymentRequirements, payer, this.proofMode);

    const verified = await this.verify({ x402Version, paymentPayload, paymentRequirements });
    if (!verified.isValid) {
      return { success: false, errorReason: verified.invalidReason, payer: verified.payer, transaction: "", network: paymentRequirements.network };
    }
    const consumed = await this.replayStore.consume(hash, {
      payer: verified.payer,
      amount: paymentRequirements.amount,
      network: paymentRequirements.network,
      proofMode: this.proofMode,
      fingerprint: settlementFingerprint(paymentRequirements, verified.payer, this.proofMode),
    });
    if (!consumed) {
      // A concurrent settle won the race after our initial lookup. Return the
      // persisted settlement only when it is the exact same requirement/payer.
      const raced = await this.replayStore.get(hash);
      return raced
        ? idempotentSettlement(raced, paymentRequirements, verified.payer, this.proofMode)
        : { success: false, errorReason: "payment_already_consumed", payer: verified.payer, transaction: "", network: paymentRequirements.network };
    }
    return {
      success: true,
      payer: verified.payer,
      transaction: hash,
      network: paymentRequirements.network,
      amount: paymentRequirements.amount,
      extensions: { "io.nervos.skillpass": { settlement: "fiber_invoice_consumed", paymentProof: this.proofMode, idempotent: false } },
    };
  }
}
