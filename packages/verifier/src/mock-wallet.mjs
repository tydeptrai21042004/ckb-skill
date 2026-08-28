import { createHmac, timingSafeEqual } from "node:crypto";

// TEST-ONLY authentication helper. This is deliberately not a CKB wallet.
export class TestWallet {
  constructor({ identity, lockHash, secret }) {
    this.identity = identity;
    this.lockHash = lockHash;
    this.secret = secret;
  }

  sign(message) {
    return createHmac("sha256", this.secret).update(message, "utf8").digest("hex");
  }
}

export class TestProofVerifier {
  constructor(wallets) {
    this.wallets = new Map(wallets.map((wallet) => [wallet.identity, wallet]));
  }

  verify({ identity, message, proof }) {
    const wallet = this.wallets.get(identity);
    if (!wallet) return false;
    const expected = Buffer.from(wallet.sign(message), "hex");
    let actual;
    try { actual = Buffer.from(proof, "hex"); } catch { return false; }
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  lockHashFor(identity) {
    return this.wallets.get(identity)?.lockHash;
  }
}
