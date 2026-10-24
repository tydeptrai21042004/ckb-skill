/**
 * Pure verification of a CKB Cell consumption proof.
 *
 * Modern CKB nodes return "unknown" for both never-created and spent Cells;
 * "dead" is deprecated. Therefore an unknown status by itself is NOT proof
 * of consumption. We additionally require a committed consuming transaction,
 * sufficient confirmations, and an exact reference to the source outpoint.
 *
 * This module is intentionally dependency-free so CI can exercise the safety
 * policy without a signer, node, or @ckb-ccc/ccc installed.
 */
export function assessConsumptionProof({
  cellStatus,
  spendingTxStatus,
  spendingConfirmations,
  spendingTxConsumesOutpoint,
  minConfirmations = 1,
}) {
  const status = String(cellStatus ?? '').toLowerCase();
  const txStatus = String(spendingTxStatus ?? '').toLowerCase();
  const thresholdOK = Number.isSafeInteger(minConfirmations) && minConfirmations >= 1;
  const confirmationsOK = Number.isSafeInteger(spendingConfirmations) && spendingConfirmations >= minConfirmations;
  const checks = {
    spentCellNotLive: status === 'unknown' || status === 'dead',
    spenderCommitted: txStatus === 'committed',
    spenderConsumesExactOutpoint: spendingTxConsumesOutpoint === true,
    spenderConfirmed: thresholdOK && confirmationsOK,
  };
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  return {
    passed: failed.length === 0,
    checks,
    failed,
    cellStatus: status,
    spendingTxStatus: txStatus,
    spendingConfirmations,
    minConfirmations,
  };
}
