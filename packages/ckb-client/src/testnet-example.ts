/**
 * Copy this into a wallet-connected CCC environment (CCC Playground or React)
 * and supply the signer + SkillPass deployment. No private key is accepted.
 */
import { ccc } from "@ckb-ccc/connector-react";
import { FLAG_DELEGATABLE, FLAG_TRANSFERABLE } from "@skillpass/capability-codec";
import { SERVICE_BUNDLE_V1_ENTITLEMENT_ID } from "@skillpass/capability-codec/service-ids";
import { buildIssueCapabilityTx, sendAndWait, type Deployment } from "./live.js";

/** Issue the default portable Service Bundle right used by Model/Data/Compute providers. */
export async function issueServiceBundlePass(
  signer: ccc.Signer,
  deployment: Deployment,
  recipientAddress: string,
  expiresAtUnix: bigint,
) {
  const built = await buildIssueCapabilityTx({
    signer,
    deployment,
    recipientAddress,
    serviceId: SERVICE_BUNDLE_V1_ENTITLEMENT_ID,
    expiry: expiresAtUnix,
    flags: FLAG_TRANSFERABLE | FLAG_DELEGATABLE,
  });
  return sendAndWait(signer, built.tx);
}
