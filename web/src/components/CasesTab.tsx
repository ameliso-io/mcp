"use client";

import styles from "./CasesTab.module.css";
import { useCasesTab } from "./cases/useCasesTab";
import { CasesTabContext } from "./cases/CasesTabContext";
import CasesHeader from "./cases/CasesHeader";
import CreateCaseForm from "./cases/CreateCaseForm";
import CasesFilterBar from "./cases/CasesFilterBar";
import CaseListItem from "./cases/CaseListItem";
import type { CasesTabProps } from "./cases/types";

export default function CasesTab(props: CasesTabProps) {
  const state = useCasesTab(props);
  const { filterAnnouncement, actionAnnouncement, cases, deferredCases, loading, error, setError, load, showCreate, sortedCases } = state;

  if (!props.repoId) {
    return (
      <div className={styles.noRepo}>
        Go to the Repositories tab and click &ldquo;Use&rdquo; to select a repository.
      </div>
    );
  }

  const isStale = cases !== deferredCases;

  return (
    <CasesTabContext.Provider value={state}>
      <div>
        <div role="status" aria-live="polite" className="sr-only">{filterAnnouncement}</div>
        <div role="status" aria-live="polite" className="sr-only">{actionAnnouncement}</div>
        <CasesHeader />
        {showCreate && <CreateCaseForm />}
        <CasesFilterBar />
        {error && (
          <div className={styles.errorCard} role="alert">
            <span>{error}</span>
            <div className={styles.errorActions}>
              <button type="button" onClick={() => { void load(); }} className={styles.errorRetry}>Retry</button>
              <button type="button" onClick={() => { setError(null); }} className={styles.errorDismiss} aria-label="Dismiss">×</button>
            </div>
          </div>
        )}
        {loading && <div className={styles.loadingMsg} role="status">Loading…</div>}
        {!loading && deferredCases.length === 0 && !error && <div className={styles.emptyCard}>No cases found.</div>}
        <ul className={isStale ? `${styles.list} ${styles.listStale}` : styles.list} aria-busy={loading || isStale} role="list">
          {sortedCases.map((c) => <CaseListItem key={c.path} c={c} />)}
        </ul>
      </div>
    </CasesTabContext.Provider>
  );
}
