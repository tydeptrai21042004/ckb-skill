import { randomBytes } from "node:crypto";

export class ChallengeError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ChallengeError";
    this.code = code;
  }
}

export class ChallengeStore {
  #entries = new Map();

  constructor({ ttlMs = 60_000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  issue(identity) {
    if (typeof identity !== "string" || identity.length === 0) {
      throw new ChallengeError("INVALID_IDENTITY", "identity must be a non-empty string");
    }
    const nonce = randomBytes(24).toString("hex");
    const issuedAt = this.now();
    const expiresAt = issuedAt + this.ttlMs;
    const message = `SkillPass authentication\nidentity:${identity}\nnonce:${nonce}\nexpires:${expiresAt}`;
    this.#entries.set(nonce, { identity, message, expiresAt, used: false });
    return Object.freeze({ nonce, message, expiresAt });
  }

  consume({ nonce, identity }) {
    const entry = this.#entries.get(nonce);
    if (!entry) throw new ChallengeError("UNKNOWN_NONCE", "challenge nonce not found");
    if (entry.used) throw new ChallengeError("REPLAY", "challenge nonce was already used");
    if (this.now() >= entry.expiresAt) {
      entry.used = true;
      throw new ChallengeError("EXPIRED_NONCE", "challenge nonce expired");
    }
    if (entry.identity !== identity) {
      throw new ChallengeError("IDENTITY_MISMATCH", "challenge identity does not match requester");
    }
    entry.used = true;
    return Object.freeze({ message: entry.message, expiresAt: entry.expiresAt });
  }
}
