"use client";

import styles from "../SuitesTab.module.css";
import { useSuitesTabContext } from "./SuitesTabContext";
import type { Suite } from "@/gen/ameliso/v1/types_pb";

interface Props {
  suite: Suite;
}

export default function SuiteExpandedPanel({ suite }: Props) {
  const { expandedCases, expandedCasesLoading } = useSuitesTabContext();

  return (
    <div className={styles.expandedPanel} aria-busy={expandedCasesLoading}>
      {expandedCasesLoading ? (
        <p className={styles.expandedLoading} role="status">Loading…</p>
      ) : expandedCases.length > 0 ? (
        <ul className={styles.caseList} role="list">
          {expandedCases.map((c) => (
            <li key={c.path} className={styles.caseRow}>
              <span className={styles.caseDot} data-priority={c.priority} aria-hidden="true" />
              <span className="sr-only">{c.priority} priority</span>
              <span className={styles.casePath}>{c.path}</span>
              <span className={styles.caseTitle}>{c.title}</span>
              {c.tags.map((t) => <span key={t} className={styles.tag}>{t}</span>)}
            </li>
          ))}
        </ul>
      ) : suite.cases.length > 0 ? (
        <ul className={styles.caseList} role="list">
          {suite.cases.map((casePath) => <li key={casePath} className={styles.casePathOnly}>{casePath}</li>)}
        </ul>
      ) : (
        <p className={styles.noCase}>No cases in this suite.</p>
      )}
    </div>
  );
}
