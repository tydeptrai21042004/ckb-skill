/**
 * Copy this into a wallet-connected CCC environment (CCC Playground or React)
 * and supply the signer + SkillPass deployment. No private key is accepted.
 */
import { ccc } from "@ckb-ccc/connector-react";
import { FLAG_TRANSFERABLE } from "@skillpass/capability-codec";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "@skillpass/capability-codec/service-ids";
import { buildIssueCapabilityTx, sendAndWait, type Deployment } from "./live.js";

// SHA-256("paper-analyzer-v1"), fixed as the v1 application-level service ID.
export async function issuePaperAnalyzerPass(
  signer: ccc.Signer,
  deployment: Deployment,
  expiresAtUnix: bigint,
) {
  const built = await buildIssueCapabilityTx({
    signer,
    deployment,
    serviceId: PAPER_ANALYZER_V1_SERVICE_ID,
    expiry: expiresAtUnix,
    flags: FLAG_TRANSFERABLE,
  });
  return sendAndWait(signer, built.tx);
}
