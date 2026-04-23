"use client";

import dynamic from "next/dynamic";
import styles from "../CasesTab.module.css";
import LoadingSpinner from "../LoadingSpinner";
import { useCasesTabContext } from "./CasesTabContext";

const MarkdownBody = dynamic(() => import("../MarkdownBody"), {
  ssr: false,
  /* v8 ignore next 1 — loading shown during initial chunk fetch, not reachable in unit tests */
  loading: () => <LoadingSpinner />,
});

export default function CaseExpandedPanel() {
  const { bodyLoading, expandedBody } = useCasesTabContext();

  return (
    <div className={styles.expandedPanel} aria-busy={bodyLoading}>
      {bodyLoading ? (
        <p className={styles.expandedLoading} role="status">
          Loading…
        </p>
      ) : expandedBody ? (
        <MarkdownBody body={expandedBody} />
      ) : (
        <p className={styles.noBody}>No body.</p>
      )}
    </div>
  );
}
