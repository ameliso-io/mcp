"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import type { RunMeta } from "@/gen/ameliso/v1/types_pb";

interface Props {
  run: RunMeta;
}

export default function RenameRunForm({ run }: Props) {
  const {
    renameNewSlug,
    setRenameNewSlug,
    renaming,
    handleRenameRun,
    setRenamingRunId,
    lastFocusRef,
  } = useRunsTabContext();

  return (
    <form
      aria-label={`Rename run ${run.id}`}
      onSubmit={handleRenameRun}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        setRenamingRunId(null);
        lastFocusRef.current?.focus();
      }}
      className={styles.renameForm}
    >
      <span className={styles.renamePrefix}>{run.id.slice(0, 10)}-</span>
      <input
        value={renameNewSlug}
        onChange={(e) => {
          setRenameNewSlug(e.target.value);
        }}
        required
        pattern="[a-z0-9_-]+"
        title="Lowercase letters (a-z), digits, hyphens, underscores only (e.g. smoke)"
        maxLength={100}
        autoFocus
        className={styles.renameInput}
        placeholder="new-slug"
        aria-label="New slug"
      />
      <button type="submit" disabled={renaming} className={styles.btnSaveSm}>
        {renaming ? "Renaming…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => {
          setRenamingRunId(null);
          lastFocusRef.current?.focus();
        }}
        className={styles.btnCancelSm}
      >
        Cancel
      </button>
    </form>
  );
}
