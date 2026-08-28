/**
 * Copy this into a wallet-connected CCC environment (CCC Playground or React)
 * and supply the signer + SkillPass deployment. No private key is accepted.
 */
import { ccc } from "@ckb-ccc/ccc";
import { FLAG_TRANSFERABLE } from "../../capability-codec/src/index.mjs";
import { PAPER_ANALYZER_V1_SERVICE_ID } from "../../capability-codec/src/service-ids.mjs";
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
