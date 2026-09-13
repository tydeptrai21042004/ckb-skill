import { ccc } from "@ckb-ccc/ccc";
import { formatAuthorizationIntent, type AuthorizationIntentInput } from "@skillpass/auth-protocol";

/**
 * Build the exact SkillPass authorization-intent message the browser signs.
 * This delegates to @skillpass/auth-protocol so browser SDKs and servers cannot
 * silently drift onto different field sets.
 */
export function formatChallengeMessage(input: AuthorizationIntentInput) {
  return formatAuthorizationIntent(input);
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
