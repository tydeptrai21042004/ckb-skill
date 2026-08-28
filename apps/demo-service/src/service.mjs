import { AccessDeniedError } from "../../../packages/verifier/src/verifier.mjs";
import { ChallengeError } from "../../../packages/verifier/src/challenge-store.mjs";
import { analyzePaper } from "./paper-analyzer.mjs";

export class AuthenticationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthenticationError";
    this.code = code;
  }
}

export class SkillPassService {
  constructor({ challengeStore, proofVerifier, capabilityVerifier, lockHashResolver }) {
    this.challengeStore = challengeStore;
    this.proofVerifier = proofVerifier;
    this.capabilityVerifier = capabilityVerifier;
    this.lockHashResolver = lockHashResolver;
  }

  challenge(identity) {
    return this.challengeStore.issue(identity);
  }

  analyze({ identity, nonce, proof, outPoint, text }) {
    let challenge;
    try {
      challenge = this.challengeStore.consume({ nonce, identity });
    } catch (error) {
      if (error instanceof ChallengeError) {
        throw new AuthenticationError(error.code, error.message);
      }
      throw error;
    }

    if (!this.proofVerifier.verify({ identity, message: challenge.message, proof })) {
      throw new AuthenticationError("INVALID_PROOF", "signature/proof did not verify");
    }
    const requesterLockHash = this.lockHashResolver(identity);
    if (!requesterLockHash) {
      throw new AuthenticationError("UNKNOWN_IDENTITY", "no lock hash is registered for this identity");
    }

    try {
      this.capabilityVerifier.verify({ outPoint, requesterLockHash });
    } catch (error) {
      if (error instanceof AccessDeniedError) throw error;
      throw error;
    }
    return analyzePaper(text);
  }
}
