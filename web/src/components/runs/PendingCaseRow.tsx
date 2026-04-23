"use client";

import styles from "../RunsTab.module.css";
import { useRunsTabContext } from "./RunsTabContext";
import RecordResultForm from "./RecordResultForm";
import type { Case } from "@/gen/ameliso/v1/types_pb";

interface Props {
  c: Case;
}

export default function PendingCaseRow({ c }: Props) {
  const { recordingCase, openRecord } = useRunsTabContext();

  return (
    <li key={c.path}>
      <div className={styles.pendingRow}>
        <span className={styles.pendingPath}>{c.path}</span>
        <span className={styles.pendingTitle}>{c.title}</span>
        <button
          type="button"
          onClick={() => openRecord(c.path)}
          aria-label={
            recordingCase === c.path ? `Cancel recording ${c.path}` : `Record result for ${c.path}`
          }
          className={styles.btnRecordSm}
        >
          {recordingCase === c.path ? "Cancel" : "Record"}
        </button>
      </div>
      {recordingCase === c.path && <RecordResultForm casePath={c.path} />}
    </li>
  );
}
