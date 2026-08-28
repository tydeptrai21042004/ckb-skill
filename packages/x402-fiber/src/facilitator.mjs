import { ReplayStore } from "./replay-store.mjs";
import { FIBER_SCHEME, FIBER_TESTNET, validatePayload, validateRequirements } from "./scheme.mjs";

export class FiberFacilitator {
  constructor({ backend, replayStore = new ReplayStore(), network = FIBER_TESTNET } = {}) {
    if (!backend) throw new Error("Fiber backend is required");
    this.backend = backend;
    this.replayStore = replayStore;
    this.network = network;
  }

  supported() {
    return { kinds: [{ x402Version: 2, scheme: FIBER_SCHEME, network: this.network }], extensions: ["io.nervos.skillpass"], signers: {} };
  }

  async verify({ x402Version, paymentPayload, paymentRequirements }) {
    try {
      if (x402Version !== 2) throw new Error("x402Version must be 2");
      validateRequirements(paymentRequirements);
      validatePayload(paymentPayload, paymentRequirements);
      const hash = paymentRequirements.extra.paymentHash;
      if (await this.replayStore.has(hash)) return { isValid: false, invalidReason: "payment_already_consumed", payer: paymentPayload.payload.payer };
      const paid = await this.backend.isPaid(hash);
      if (!paid) return { isValid: false, invalidReason: "fiber_invoice_not_paid", payer: paymentPayload.payload.payer };
      return { isValid: true, payer: paymentPayload.payload.payer, extra: { paymentHash: hash } };
    } catch (error) {
      return { isValid: false, invalidReason: `invalid_fiber_payment:${error.message}` };
    }
  }

  async settle({ x402Version, paymentPayload, paymentRequirements }) {
    const verified = await this.verify({ x402Version, paymentPayload, paymentRequirements });
    if (!verified.isValid) {
      return { success: false, errorReason: verified.invalidReason, payer: verified.payer, transaction: "", network: paymentRequirements?.network ?? this.network };
    }
    const hash = paymentRequirements.extra.paymentHash;
    const consumed = await this.replayStore.consume(hash, { payer: verified.payer, amount: paymentRequirements.amount, network: paymentRequirements.network });
    if (!consumed) {
      return { success: false, errorReason: "payment_already_consumed", payer: verified.payer, transaction: "", network: paymentRequirements.network };
    }
    return {
      success: true,
      payer: verified.payer,
      transaction: hash,
      network: paymentRequirements.network,
      amount: paymentRequirements.amount,
      extensions: { "io.nervos.skillpass": { settlement: "fiber_invoice_consumed" } },
    };
  }
}
