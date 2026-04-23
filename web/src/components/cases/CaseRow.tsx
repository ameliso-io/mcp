"use client";

import styles from "../CasesTab.module.css";
import { useCasesTabContext } from "./CasesTabContext";
import { priorityLabel } from "./priorityHelpers";
import type { Case } from "@/gen/ameliso/v1/types_pb";

interface Props {
  c: Case;
}

export default function CaseRow({ c }: Props) {
  const {
    expandedPath,
    toggleExpand,
    startEdit,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    handleDelete,
  } = useCasesTabContext();

  return (
    <div className={styles.caseRow}>
      <button
        type="button"
        className={styles.caseExpandBtn}
        onClick={() => toggleExpand(c.path)}
        aria-expanded={expandedPath === c.path}
      >
        <span className={styles.priorityDot} data-priority={c.priority} aria-hidden="true" />
        <div className={styles.caseInfo}>
          <div className={styles.caseMeta}>
            <span className={styles.casePath}>{c.path}</span>
            <span className={styles.priorityBadge} data-priority={c.priority}>
              {priorityLabel(c.priority)}
            </span>
            {c.tags.map((t) => (
              <span key={t} className={styles.tag}>
                {t}
              </span>
            ))}
          </div>
          <p className={styles.caseTitle}>{c.title}</p>
          {c.description && <p className={styles.caseDesc}>{c.description}</p>}
        </div>
        <span className={styles.chevron} aria-hidden="true">
          {expandedPath === c.path ? "▲" : "▼"}
        </span>
      </button>
      <button
        type="button"
        onClick={() => startEdit(c)}
        aria-label={`Edit ${c.path}`}
        className={styles.btnOutlineSm}
      >
        Edit
      </button>
      {confirmingDelete === c.path ? (
        <>
          <span className={styles.confirmText}>Delete?</span>
          <button
            type="button"
            onClick={() => handleDelete(c.path)}
            aria-label={`Confirm delete ${c.path}`}
            disabled={deleting}
            className={styles.btnDangerSm}
          >
            {deleting ? "Deleting…" : "Yes"}
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(null);
            }}
            aria-label="Cancel delete"
            className={styles.btnOutlineSm}
            autoFocus
          >
            No
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            setConfirmingDelete(c.path);
          }}
          aria-label={`Delete ${c.path}`}
          className={styles.btnDangerSm}
        >
          Delete
        </button>
      )}
    </div>
  );
}
