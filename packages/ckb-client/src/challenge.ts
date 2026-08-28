import { ccc } from "@ckb-ccc/ccc";

/** Build the exact message the browser signs. */
export function formatChallengeMessage(input: {
  nonce: string;
  address: string;
  service: string;
  expiresAt: number;
}) {
  return [
    "SkillPass capability access",
    `service=${input.service}`,
    `address=${input.address}`,
    `nonce=${input.nonce}`,
    `expires_at=${input.expiresAt}`,
  ].join("\n");
}

/** Browser/client side: wallet remains the only key custodian. */
export async function signChallenge(signer: ccc.Signer, message: string) {
  return signer.signMessage(message);
}

/** Server side: CCC verifies the cryptographic proof without a private key. */
export async function verifyChallengeSignature(input: {
  client: ccc.Client;
  address: string;
  message: string;
  signature: ccc.Signature;
}) {
  if (input.signature.identity !== input.address) return false;
  const valid = await ccc.Signer.verifyMessage(input.message, input.signature);
  if (!valid) return false;
  // Address parsing also rejects a mainnet/testnet prefix mismatch.
  await ccc.Address.fromString(input.address, input.client);
  return true;
}

export async function addressLockHash(client: ccc.Client, address: string) {
  const parsed = await ccc.Address.fromString(address, client);
  return parsed.script.hash();
}
