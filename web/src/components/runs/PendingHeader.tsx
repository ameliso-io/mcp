"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

interface Props {
  runId: string;
}

export default function PendingHeader({ runId }: Props) {
  const { pendingCases, pollFailCount, confirmingBulkPass, setConfirmingBulkPass, bulkPassing, handleBulkPass, confirmingFinalize, setConfirmingFinalize, handleFinalize } =
    useRunsTabContext();

  return (
    <div className={styles.pendingHeader}>
      <h3 className={styles.pendingLabel}>
        {pendingCases.length} pending
        {pollFailCount >= 2
          ? <span className={styles.staleWarning} role="status" aria-live="polite">data may be stale</span>
          : <span className={styles.refreshHint}>auto-refresh 30s</span>}
      </h3>
      <div className={styles.pendingActions}>
        {pendingCases.length > 0 && (
          confirmingBulkPass === runId ? (
            <>
              <span className={styles.confirmText}>Pass all?</span>
              <button type="button" aria-label={`Confirm pass all ${pendingCases.length} pending case${pendingCases.length !== 1 ? "s" : ""}`} onClick={() => handleBulkPass(runId)} disabled={bulkPassing} className={styles.btnBlueSm}>Yes</button>
              <button type="button" aria-label="Cancel bulk pass" onClick={() => { setConfirmingBulkPass(null); }} className={styles.btnOutlineSm} autoFocus>No</button>
            </>
          ) : (
            <button type="button" onClick={() => { setConfirmingBulkPass(runId); }} disabled={bulkPassing} className={styles.btnBlueSm}>
              {bulkPassing ? "Marking…" : `All Passed (${pendingCases.length})`}
            </button>
          )
        )}
        {confirmingFinalize?.runId === runId ? (
          <>
            <span className={styles.confirmText}>{confirmingFinalize.status === RunStatus.COMPLETED ? "Complete?" : "Abort?"}</span>
            <button type="button" aria-label={`Confirm ${confirmingFinalize.status === RunStatus.COMPLETED ? "complete" : "abort"} run ${runId}`} onClick={() => handleFinalize(runId, confirmingFinalize.status)} className={confirmingFinalize.status === RunStatus.COMPLETED ? styles.btnGreenSm : styles.btnRedSm}>Yes</button>
            <button type="button" aria-label="Cancel" onClick={() => { setConfirmingFinalize(null); }} className={styles.btnOutlineSm} autoFocus>No</button>
          </>
        ) : (
          <>
            <button type="button" aria-label={`Complete run ${runId}`} onClick={() => { setConfirmingFinalize({ runId, status: RunStatus.COMPLETED }); }} className={styles.btnGreenSm}>Complete Run</button>
            <button type="button" aria-label={`Abort run ${runId}`} onClick={() => { setConfirmingFinalize({ runId, status: RunStatus.ABORTED }); }} className={styles.btnRedSm}>Abort Run</button>
          </>
        )}
      </div>
    </div>
  );
}
