import { decodeCapability, isActive, normalizeHex32 } from "../../capability-codec/src/index.mjs";

export class AccessDeniedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AccessDeniedError";
    this.code = code;
  }
}

export class CapabilityVerifier {
  constructor({ chain, expectedServiceId, clock = () => BigInt(Math.floor(Date.now() / 1000)) }) {
    this.chain = chain;
    this.expectedServiceId = normalizeHex32(expectedServiceId, "expectedServiceId");
    this.clock = clock;
  }

  verify({ outPoint, requesterLockHash }) {
    const cell = this.chain.getLiveCell(outPoint);
    if (!cell) throw new AccessDeniedError("CELL_NOT_LIVE", "capability cell is missing or already consumed");
    const requester = normalizeHex32(requesterLockHash, "requesterLockHash");
    if (cell.lockHash.toLowerCase() !== requester.toLowerCase()) {
      throw new AccessDeniedError("NOT_OWNER", "requester does not control the current live capability cell");
    }
    const cap = decodeCapability(cell.data);
    if (cap.serviceId.toLowerCase() !== this.expectedServiceId.toLowerCase()) {
      throw new AccessDeniedError("WRONG_SERVICE", "capability is for a different service");
    }
    if (!isActive(cap, this.clock())) {
      throw new AccessDeniedError("EXPIRED", "capability is expired");
    }
    return Object.freeze({ capability: cap, cell });
  }
}
