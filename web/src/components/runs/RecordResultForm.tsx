"use client";

import dynamic from "next/dynamic";
import styles from "../RunsTab.module.css";
import LoadingSpinner from "../LoadingSpinner";
import { useRunsTabContext } from "./RunsTabContext";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";

const MarkdownBody = dynamic(() => import("../MarkdownBody"), {
  ssr: false,
  /* v8 ignore next 1 — loading shown during initial chunk fetch */
  loading: () => <LoadingSpinner />,
});

export default function RecordResultForm({ casePath }: { casePath: string }) {
  const {
    recordStatus,
    setRecordStatus,
    recordNotes,
    setRecordNotes,
    recording,
    caseBodyLoading,
    caseBody,
    handleRecord,
    setRecordingCase,
    lastFocusRef,
  } = useRunsTabContext();

  return (
    <div className={styles.recordPanel}>
      {(caseBodyLoading || caseBody) && (
        <div className={styles.recordSteps} aria-busy={caseBodyLoading}>
          {caseBodyLoading ? (
            <p className={styles.stepsLoading} role="status">
              Loading steps…
            </p>
          ) : (
            caseBody && <MarkdownBody body={caseBody} maxHeight="200px" />
          )}
        </div>
      )}
      <form
        aria-label={`Record result for ${casePath}`}
        onSubmit={handleRecord}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          setRecordingCase(null);
          lastFocusRef.current?.focus();
        }}
        className={styles.recordForm}
      >
        <div>
          <label className={styles.labelSm}>
            Status
            <select
              value={recordStatus}
              onChange={(e) => {
                setRecordStatus(Number(e.target.value));
              }}
              autoFocus
              className={styles.inputAuto}
            >
              <option value={ResultStatus.PASSED}>Passed</option>
              <option value={ResultStatus.FAILED}>Failed</option>
              <option value={ResultStatus.BLOCKED}>Blocked</option>
              <option value={ResultStatus.SKIPPED}>Skipped</option>
            </select>
          </label>
        </div>
        <div className={styles.notesWrap}>
          <label
            className={
              recordStatus === ResultStatus.FAILED || recordStatus === ResultStatus.BLOCKED
                ? styles.labelSmErr
                : styles.labelSm
            }
          >
            Notes
            {recordStatus === ResultStatus.FAILED || recordStatus === ResultStatus.BLOCKED
              ? " *"
              : ""}
            <input
              value={recordNotes}
              onChange={(e) => {
                setRecordNotes(e.target.value);
              }}
              placeholder={
                recordStatus === ResultStatus.FAILED
                  ? "Describe what failed…"
                  : recordStatus === ResultStatus.BLOCKED
                    ? "Describe what is blocking…"
                    : "Optional notes…"
              }
              required={
                recordStatus === ResultStatus.FAILED || recordStatus === ResultStatus.BLOCKED
              }
              aria-required={
                recordStatus === ResultStatus.FAILED || recordStatus === ResultStatus.BLOCKED
              }
              maxLength={2000}
              className={
                recordStatus === ResultStatus.FAILED || recordStatus === ResultStatus.BLOCKED
                  ? styles.inputErr
                  : styles.input
              }
            />
          </label>
        </div>
        <button type="submit" disabled={recording} className={styles.btnSaveResult}>
          {recording ? "Saving…" : "Save Result"}
        </button>
      </form>
    </div>
  );
}
