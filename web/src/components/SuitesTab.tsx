"use client";

import styles from "./SuitesTab.module.css";
import { useSuitesTab } from "./suites/useSuitesTab";
import { SuitesTabContext } from "./suites/SuitesTabContext";
import SuitesHeader from "./suites/SuitesHeader";
import CreateSuiteForm from "./suites/CreateSuiteForm";
import SuiteListItem from "./suites/SuiteListItem";
import type { SuitesTabProps } from "./suites/types";

export default function SuitesTab(props: SuitesTabProps) {
  const state = useSuitesTab(props);
  const { filterAnnouncement, actionAnnouncement, suites, loading, error, setError, load, showCreate, search, setSearch, q, filteredSuites } = state;

  if (!props.repoId) {
    return (
      <div className={styles.noRepo}>
        Go to the Repositories tab and click &ldquo;Use&rdquo; to select a repository.
      </div>
    );
  }

  return (
    <SuitesTabContext.Provider value={state}>
      <div>
        <div role="status" aria-live="polite" className="sr-only">{actionAnnouncement}</div>
        <div role="status" aria-live="polite" className="sr-only">{filterAnnouncement}</div>
        <SuitesHeader />
        {showCreate && <CreateSuiteForm />}
        {error && (
          <div className={styles.errorCard} role="alert">
            <span>{error}</span>
            <div className={styles.errorActions}>
              <button type="button" onClick={() => { void load(); }} className={styles.errorRetry}>Retry</button>
              <button type="button" onClick={() => { setError(null); }} className={styles.errorDismiss} aria-label="Dismiss">×</button>
            </div>
          </div>
        )}
        {suites.length > 0 && (
          <div className={styles.searchWrapper}>
            <input type="search" aria-label="Search suites" placeholder="Search suites…" value={search} onChange={(e) => { setSearch(e.target.value); }} className={styles.searchInput} />
            <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          </div>
        )}
        {loading && <div className={styles.loadingMsg} role="status">Loading…</div>}
        {!loading && suites.length === 0 && !error && <div className={styles.emptyCard}>No suites found.</div>}
        {!loading && q && filteredSuites.length === 0 && suites.length > 0 && <div className={styles.emptyCard}>No suites match &ldquo;{search}&rdquo;.</div>}
        <ul className={styles.list} aria-busy={loading} role="list">
          {filteredSuites.map((suite) => <SuiteListItem key={suite.slug} suite={suite} />)}
        </ul>
      </div>
    </SuitesTabContext.Provider>
  );
}
