"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import PendingHeader from "./PendingHeader";
import PendingCaseRow from "./PendingCaseRow";
import { statusLabel } from "./statusHelpers";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";

interface Props {
  runId: string;
}

export default function InProgressRunView({ runId }: Props) {
  const { pendingCases, totalInScope, recordedResults, caseTitleMap } = useRunsTabContext();

  return (
    <>
      {totalInScope > 0 && (
        <div className={styles.progressWrap}>
          <div className={styles.progressMeta}>
            <span>
              {totalInScope - pendingCases.length} / {totalInScope} done
            </span>
            <span>{Math.round(((totalInScope - pendingCases.length) / totalInScope) * 100)}%</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="Run completion progress"
            aria-valuemin={0}
            aria-valuemax={totalInScope}
            aria-valuenow={totalInScope - pendingCases.length}
            aria-valuetext={`${totalInScope - pendingCases.length} of ${totalInScope} case${totalInScope !== 1 ? "s" : ""} complete`}
          >
            <div
              className={styles.progressBar}
              style={{ width: `${((totalInScope - pendingCases.length) / totalInScope) * 100}%` }}
            />
          </div>
        </div>
      )}
      <PendingHeader runId={runId} />
      {pendingCases.length === 0 && (
        <p className={styles.allDone}>All cases have results recorded.</p>
      )}
      {recordedResults.length > 0 && (
        <div className={styles.recordedSection}>
          <h4 className={styles.recordedLabel}>Recorded ({recordedResults.length})</h4>
          <ul className={styles.resultList} role="list">
            {recordedResults.map((r) => (
              <li
                key={r.casePath}
                className={styles.resultRow}
                aria-label={`${statusLabel(r.status)}: ${r.casePath}`}
              >
                <span className={styles.resultStatusBadge} data-status={ResultStatus[r.status]}>
                  {statusLabel(r.status)}
                </span>
                {caseTitleMap.get(r.casePath)?.title && (
                  <span className={styles.resultTitle}>{caseTitleMap.get(r.casePath)?.title}</span>
                )}
                {r.notes && <span className={styles.resultNotes}>{r.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className={styles.pendingList} role="list">
        {pendingCases.map((c) => (
          <PendingCaseRow key={c.path} c={c} />
        ))}
      </ul>
    </>
  );
}
