"use client";

import type { Route } from "next";
import Link from "next/link";
import styles from "../SuitesTab.module.css";
import { useSuitesTabContext } from "./SuitesTabContext";
import type { Suite } from "@/gen/ameliso/v1/types_pb";

interface Props {
  suite: Suite;
}

export default function SuiteRow({ suite }: Props) {
  const {
    expanded,
    toggleExpand,
    startEdit,
    confirmingDelete,
    setConfirmingDelete,
    deleting,
    handleDelete,
    basePath,
  } = useSuitesTabContext();

  return (
    <div className={expanded === suite.slug ? styles.suiteCardExpanded : styles.suiteCard}>
      <div className={styles.suiteRow}>
        <button
          type="button"
          className={styles.suiteExpandBtn}
          onClick={() => toggleExpand(suite.slug)}
          aria-expanded={expanded === suite.slug}
        >
          <span className={styles.suiteName}>{suite.name}</span>
          <span className={styles.suiteSlug}>{suite.slug}</span>
          <span className={styles.caseCount}>
            {suite.cases.length} case{suite.cases.length !== 1 ? "s" : ""}
          </span>
        </button>
        <Link
          href={`${basePath}/runs?suite=${encodeURIComponent(suite.slug)}` as Route}
          aria-label={`Run ${suite.slug}`}
          className={styles.btnGreenSm}
        >
          Run
        </Link>
        <button
          type="button"
          onClick={() => {
            startEdit(suite);
          }}
          aria-label={`Edit ${suite.slug}`}
          className={styles.btnOutlineSm}
        >
          Edit
        </button>
        {confirmingDelete === suite.slug ? (
          <>
            <span className={styles.confirmText}>Delete?</span>
            <button
              type="button"
              onClick={() => handleDelete(suite.slug)}
              aria-label={`Confirm delete ${suite.slug}`}
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
              setConfirmingDelete(suite.slug);
            }}
            aria-label={`Delete ${suite.slug}`}
            className={styles.btnDangerSm}
          >
            Delete
          </button>
        )}
      </div>
      {suite.description && <p className={styles.suiteDesc}>{suite.description}</p>}
    </div>
  );
}
