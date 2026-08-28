import { randomBytes } from "node:crypto";
import { decodeCapability, encodeTypeArgs, normalizeHex32 } from "../../capability-codec/src/index.mjs";
import { validateIssue, validateTransition } from "../../protocol-core/src/index.mjs";

function txHash(counter) {
  const suffix = counter.toString(16).padStart(64, "0");
  return `0x${suffix}`;
}

export class InMemoryChain {
  #cells = new Map();
  #issuedIdentities = new Set();
  #counter = 1;

  issue({ ownerLockHash, data, issuerInputLockHash }) {
    const cap = decodeCapability(data);
    const typeArgs = encodeTypeArgs({ issuerId: cap.issuerId, capabilityId: cap.capabilityId });
    validateIssue({
      outputData: data,
      typeArgs,
      transactionInputLockHashes: [issuerInputLockHash],
    });
    const identityKey = typeArgs.toLowerCase();
    if (this.#issuedIdentities.has(identityKey)) {
      throw new Error("capability identity was already issued");
    }
    this.#issuedIdentities.add(identityKey);
    const outPoint = `${txHash(this.#counter++)}:0`;
    const cell = Object.freeze({
      outPoint,
      lockHash: normalizeHex32(ownerLockHash, "ownerLockHash"),
      typeArgs,
      data,
      createdAt: Date.now(),
    });
    this.#cells.set(outPoint, { ...cell, live: true });
    return cell;
  }

  getLiveCell(outPoint) {
    const cell = this.#cells.get(outPoint);
    if (!cell || !cell.live) return undefined;
    return Object.freeze({
      outPoint: cell.outPoint,
      lockHash: cell.lockHash,
      typeArgs: cell.typeArgs,
      data: cell.data,
      createdAt: cell.createdAt,
    });
  }

  transfer({ outPoint, signerLockHash, recipientLockHash }) {
    const cell = this.#cells.get(outPoint);
    if (!cell || !cell.live) throw new Error("input capability cell is not live");
    const signer = normalizeHex32(signerLockHash, "signerLockHash");
    if (cell.lockHash.toLowerCase() !== signer.toLowerCase()) {
      throw new Error("signer does not control the live capability cell");
    }
    const recipient = normalizeHex32(recipientLockHash, "recipientLockHash");
    validateTransition({
      inputData: cell.data,
      outputData: cell.data,
      inputLockHash: cell.lockHash,
      outputLockHash: recipient,
      typeArgs: cell.typeArgs,
    });
    cell.live = false;
    const successorOutPoint = `${txHash(this.#counter++)}:0`;
    const successor = {
      outPoint: successorOutPoint,
      lockHash: recipient,
      typeArgs: cell.typeArgs,
      data: cell.data,
      createdAt: Date.now(),
      live: true,
    };
    this.#cells.set(successorOutPoint, successor);
    return Object.freeze({ ...successor, live: undefined });
  }

  consumeUnsafeForTest(outPoint) {
    const cell = this.#cells.get(outPoint);
    if (cell) cell.live = false;
  }

  findByOwner(ownerLockHash) {
    const owner = normalizeHex32(ownerLockHash, "ownerLockHash").toLowerCase();
    return [...this.#cells.values()]
      .filter((cell) => cell.live && cell.lockHash.toLowerCase() === owner)
      .map((cell) => Object.freeze({
        outPoint: cell.outPoint,
        lockHash: cell.lockHash,
        typeArgs: cell.typeArgs,
        data: cell.data,
        createdAt: cell.createdAt,
      }));
  }

  static randomLockHash() {
    return `0x${randomBytes(32).toString("hex")}`;
  }
}
