"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import ResultFilterBar from "./ResultFilterBar";
import { statusLabel } from "./statusHelpers";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";

export default function CompletedRunView() {
  const { recordedResults, deferredFilteredResults, isResultsStale, caseTitleMap } =
    useRunsTabContext();

  return (
    <div>
      {recordedResults.length > 0 && <ResultFilterBar />}
      {recordedResults.length === 0 ? (
        <p className={styles.noResults}>No results recorded.</p>
      ) : (
        <ul
          className={
            isResultsStale ? `${styles.resultList} ${styles.resultListStale}` : styles.resultList
          }
          role="list"
          aria-busy={isResultsStale}
        >
          {deferredFilteredResults.map((r) => {
            const caseEntry = caseTitleMap.get(r.casePath);
            return (
              <li key={r.casePath} className={styles.resultRow}>
                <span className={styles.resultStatusBadge} data-status={ResultStatus[r.status]}>
                  {statusLabel(r.status)}
                </span>
                <span className={styles.resultPath}>{r.casePath}</span>
                {caseEntry?.title && <span className={styles.resultTitle}>{caseEntry.title}</span>}
                {r.notes && <span className={styles.resultNotes}>{r.notes}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
