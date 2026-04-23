"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

const STATUS_OPTIONS = [
  { label: "All", value: RunStatus.UNSPECIFIED },
  { label: "In Progress", value: RunStatus.IN_PROGRESS },
  { label: "Completed", value: RunStatus.COMPLETED },
  { label: "Aborted", value: RunStatus.ABORTED },
] satisfies { label: string; value: RunStatus }[];

export default function RunsHeader() {
  const { statusFilter, filterPending, handleStatusFilterChange, showCreate, setShowCreate, lastFocusRef } =
    useRunsTabContext();

  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <h2 className={styles.title}>Runs</h2>
        <div role="group" aria-label="Filter by status" aria-busy={filterPending}>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                handleStatusFilterChange(opt.value);
              }}
              aria-pressed={statusFilter === opt.value}
              className={statusFilter === opt.value ? styles.filterBtnActive : styles.filterBtnInactive}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          if (!showCreate) lastFocusRef.current = document.activeElement as HTMLElement;
          setShowCreate(!showCreate);
        }}
        className={styles.btn}
      >
        {showCreate ? "Cancel" : "+ New Run"}
      </button>
    </div>
  );
}
