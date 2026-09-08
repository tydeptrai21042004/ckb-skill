import { decodeCapability } from "../../capability-codec/src/index.mjs";
import {
  ServiceRightError,
  createServicePolicy,
  verifyServiceRight,
} from "../../service-rights/src/index.mjs";

export class AccessDeniedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AccessDeniedError";
    this.code = code;
  }
}

export class CapabilityVerifier {
  constructor({
    chain,
    expectedServiceId,
    expectedIssuerId,
    requireTransferable = true,
    clock = () => BigInt(Math.floor(Date.now() / 1000)),
  }) {
    this.chain = chain;
    this.policy = createServicePolicy({
      serviceId: expectedServiceId,
      trustedIssuerId: expectedIssuerId,
      requireTransferable,
    });
    this.clock = clock;
  }

  verify({ outPoint, requesterLockHash }) {
    const cell = this.chain.getLiveCell(outPoint);
    if (!cell) throw new AccessDeniedError("CELL_NOT_LIVE", "capability cell is missing or already consumed");
    const capability = decodeCapability(cell.data);
    try {
      const verified = verifyServiceRight({
        cell,
        capability,
        requesterLockHash,
        policy: this.policy,
        nowUnixSeconds: this.clock(),
      });
      return Object.freeze({ capability, cell, currentOwnerLockHash: verified.currentOwnerLockHash });
    } catch (error) {
      if (error instanceof ServiceRightError) {
        throw new AccessDeniedError(error.code, error.message);
      }
      throw error;
    }
  }
}
