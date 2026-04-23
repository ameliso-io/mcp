"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";

const FILTER_OPTIONS = [
  { label: "Passed", status: ResultStatus.PASSED },
  { label: "Failed", status: ResultStatus.FAILED },
  { label: "Blocked", status: ResultStatus.BLOCKED },
  { label: "Skipped", status: ResultStatus.SKIPPED },
];

export default function ResultFilterBar() {
  const { resultCounts, resultStatusFilter, setResultStatusFilter } = useRunsTabContext();

  const active = FILTER_OPTIONS.filter((o) => {
    const key = o.label.toLowerCase() as keyof typeof resultCounts;
    return resultCounts[key] > 0;
  });

  return (
    <div className={styles.resultFilters} role="group" aria-label="Filter by result status">
      {active.map((o) => {
        const count = resultCounts[o.label.toLowerCase() as keyof typeof resultCounts];
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => { setResultStatusFilter((rsf) => rsf === o.status ? null : o.status); }}
            aria-pressed={resultStatusFilter === o.status}
            className={`${styles.resultFilterBtn}${resultStatusFilter === o.status ? ` ${styles.resultFilterBtnActive}` : ""}`}
            data-status={ResultStatus[o.status]}
          >
            {count} {o.label}
          </button>
        );
      })}
      {resultStatusFilter !== null && (
        <button type="button" onClick={() => { setResultStatusFilter(null); }} className={styles.showAllBtn}>
          Show all
        </button>
      )}
    </div>
  );
}
