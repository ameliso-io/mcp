"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import { runStatusLabel } from "./statusHelpers";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";
import { RunStatus } from "@/gen/ameliso/v1/types_pb";

interface Props {
  run: RunMeta;
}

export default function RunRow({ run }: Props) {
  const { selectedRunId, selectRun, renamingRunId, setRenamingRunId, setRenameNewSlug, confirmingDeleteRun, setConfirmingDeleteRun, deletingRun, handleDeleteRun, lastFocusRef } =
    useRunsTabContext();

  return (
    <div className={styles.runRow}>
      <button
        type="button"
        className={styles.runExpandBtn}
        onClick={() => selectRun(run.id, run.status)}
        aria-label={`${runStatusLabel(run.status)} run ${run.id}`}
        aria-expanded={selectedRunId === run.id}
      >
        <span className={styles.runStatusBadge} data-status={RunStatus[run.status]}>{runStatusLabel(run.status)}</span>
        <span className={styles.runId}>{run.id}</span>
        {run.suite && <span className={styles.suiteBadge}>{run.suite}</span>}
        {run.tester && <span className={styles.runTester}>{run.tester}</span>}
        {run.environment && <span className={styles.runEnv}>{run.environment}</span>}
        {run.commitSha && <code className={styles.runCommitSha} title={run.commitSha}>{run.commitSha.slice(0, 7)}</code>}
        <time className={styles.runDate} dateTime={run.date}>{run.date}</time>
      </button>
      {renamingRunId !== run.id && (
        <button type="button" onClick={() => { lastFocusRef.current = document.activeElement as HTMLElement; setRenamingRunId(run.id); setRenameNewSlug(""); }} aria-label={`Rename ${run.id}`} className={styles.btnOutlineSm}>
          Rename
        </button>
      )}
      {confirmingDeleteRun === run.id ? (
        <>
          <span className={styles.confirmText}>Delete?</span>
          <button type="button" onClick={() => handleDeleteRun(run.id)} aria-label={`Confirm delete ${run.id}`} disabled={deletingRun} className={styles.btnDangerSm}>
            {deletingRun ? "Deleting…" : "Yes"}
          </button>
          <button type="button" onClick={() => { setConfirmingDeleteRun(null); }} aria-label="Cancel delete" className={styles.btnOutlineSm} autoFocus>
            No
          </button>
        </>
      ) : (
        <button type="button" onClick={() => { setConfirmingDeleteRun(run.id); }} aria-label={`Delete ${run.id}`} className={styles.btnDangerSm}>
          Delete
        </button>
      )}
    </div>
  );
}
