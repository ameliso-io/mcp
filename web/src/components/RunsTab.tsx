"use client";

import styles from "./RunsTab.module.css";
import { useRunsTab } from "./runs/useRunsTab";
import { RunsTabContext } from "./runs/RunsTabContext";
import RunsHeader from "./runs/RunsHeader";
import CreateRunForm from "./runs/CreateRunForm";
import RunListItem from "./runs/RunListItem";
import type { RunsTabProps } from "./runs/types";

export default function RunsTab(props: RunsTabProps) {
  const state = useRunsTab(props);
  const { actionAnnouncement, filterAnnouncement, showCreate, error, load, setError, runs, loading, rq, runSearch, setRunSearch, filteredRuns } = state;

  if (!props.repoId) {
    return (
      <div className={styles.noRepo}>
        Go to the Repositories tab and click &ldquo;Use&rdquo; to select a repository.
      </div>
    );
  }

  return (
    <RunsTabContext.Provider value={state}>
      <div>
        <div role="status" aria-live="polite" className="sr-only">{actionAnnouncement}</div>
        <div role="status" aria-live="polite" className="sr-only">{filterAnnouncement}</div>
        <RunsHeader />
        {showCreate && <CreateRunForm />}
        {error && (
          <div className={styles.errorCard} role="alert">
            <span>{error}</span>
            <div className={styles.errorActions}>
              <button type="button" onClick={() => { void load(); }} className={styles.errorRetry}>Retry</button>
              <button type="button" onClick={() => { setError(null); }} className={styles.errorDismiss} aria-label="Dismiss">×</button>
            </div>
          </div>
        )}
        {runs.length > 0 && (
          <div className={styles.searchWrapper}>
            <input type="search" aria-label="Search runs" placeholder="Search runs…" value={runSearch} onChange={(e) => { setRunSearch(e.target.value); }} className={styles.searchInput} />
            <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          </div>
        )}
        {loading && <div className={styles.loadingMsg} role="status">Loading…</div>}
        {!loading && runs.length === 0 && !error && <div className={styles.emptyCard}>No runs found.</div>}
        {!loading && rq && filteredRuns.length === 0 && runs.length > 0 && (
          <div className={styles.emptyCard}>No runs match &ldquo;{runSearch}&rdquo;.</div>
        )}
        <ul className={styles.list} aria-busy={loading} role="list">
          {filteredRuns.map((run) => <RunListItem key={run.id} run={run} />)}
        </ul>
      </div>
    </RunsTabContext.Provider>
  );
}
