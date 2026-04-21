"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { client } from "../client";
import { errorMessage } from "../errorMessage";
import type { AffectedCase, CoverageEntry, RunMeta } from "../gen/ameliso/v1/types_pb";
import { ResultStatus, RunStatus } from "../gen/ameliso/v1/types_pb";
import styles from "./OverviewTab.module.css";

interface Props {
  repoId: string;
  onGoToRuns?: () => void;
}

function statusSortOrder(s: ResultStatus): number {
  switch (s) {
    case ResultStatus.FAILED:
      return 0;
    case ResultStatus.BLOCKED:
      return 1;
    case ResultStatus.NEVER:
      return 2;
    case ResultStatus.SKIPPED:
      return 3;
    case ResultStatus.PASSED:
      return 4;
    default:
      return 5;
  }
}

function statusLabel(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED:
      return "Passed";
    case ResultStatus.FAILED:
      return "Failed";
    case ResultStatus.BLOCKED:
      return "Blocked";
    case ResultStatus.SKIPPED:
      return "Skipped";
    case ResultStatus.NEVER:
      return "Never run";
    default:
      return "Unknown";
  }
}

export default function OverviewTab({ repoId, onGoToRuns }: Props) {
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeRuns, setActiveRuns] = useState<RunMeta[]>([]);

  const [sinceRef, setSinceRef] = useState("");
  const [affected, setAffected] = useState<AffectedCase[] | null>(null);
  const [affectedLoading, setAffectedLoading] = useState(false);
  const [affectedError, setAffectedError] = useState<string | null>(null);

  const load = useCallback(async (path: string) => {
    if (!path) return;
    setLoading(true);
    setError(null);
    try {
      const [coverageRes, activeRunsRes] = await Promise.all([
        client.getCoverageReport({ repoId: path }),
        client.listRuns({ repoId: path, status: RunStatus.IN_PROGRESS }),
      ]);
      setEntries(coverageRes.entries);
      setRunCount(coverageRes.runCount);
      setActiveRuns(activeRunsRes.runs);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (repoId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      load(repoId);
    }
  }, [repoId, load]);

  // Auto-refresh every 30s while there are active runs
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (repoId && activeRuns.length > 0) {
      pollRef.current = setInterval(() => load(repoId), 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [repoId, activeRuns.length, load]);

  async function handleAffected(e: React.FormEvent) {
    e.preventDefault();
    if (!repoId) return;
    setAffectedLoading(true);
    setAffectedError(null);
    try {
      const res = await client.getAffectedCases({ repoId, sinceRef });
      setAffected(res.cases);
    } catch (err) {
      setAffectedError(errorMessage(err));
    } finally {
      setAffectedLoading(false);
    }
  }

  const statCases = entries.length;
  const statPassed = entries.filter((e) => e.latestStatus === ResultStatus.PASSED).length;
  const statFailed = entries.filter((e) => e.latestStatus === ResultStatus.FAILED).length;
  const statNever = entries.filter((e) => e.latestStatus === ResultStatus.NEVER).length;

  return (
    <div>
      <h2 className={styles.title}>Overview</h2>

      {error && (
        <div className={styles.errorCard} role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className={styles.errorDismiss}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {!repoId && !loading && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No repository selected</p>
          <p className={styles.emptyDesc}>
            Go to the Repositories tab and click &quot;Use&quot; on a connected repository.
          </p>
        </div>
      )}

      {loading && (
        <div className={styles.loadingMsg} role="status">
          Loading…
        </div>
      )}

      {!loading && entries.length > 0 && (
        <>
          <dl className={styles.statsGrid}>
            {[
              { label: "Total Cases", value: statCases },
              { label: "Passed", value: statPassed },
              { label: "Failed", value: statFailed },
              { label: "Never Run", value: statNever },
            ].map((stat) => (
              <div key={stat.label} className={styles.statCard}>
                <dt className={styles.label}>{stat.label}</dt>
                <dd className={styles.statValue} data-stat={stat.label}>
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          {activeRuns.length > 0 && (
            <div className={styles.activeRunsCard}>
              <div className={styles.activeRunsHeader}>
                <h3 className={styles.activeRunsLabel}>
                  Active Runs ({activeRuns.length})
                  <span className={styles.refreshHint}>auto-refresh 30s</span>
                </h3>
                {onGoToRuns && (
                  <button type="button" onClick={onGoToRuns} className={styles.goToRunsBtn}>
                    Go to Runs
                  </button>
                )}
              </div>
              <ul className={styles.runList} role="list">
                {activeRuns.map((run) => (
                  <li key={run.id} className={styles.runRow}>
                    <span className={styles.runId}>{run.id}</span>
                    {run.suite && <span className={styles.runSuiteBadge}>{run.suite}</span>}
                    {run.tester && <span className={styles.runTester}>{run.tester}</span>}
                    <time className={styles.runDate} dateTime={run.date}>
                      {run.date}
                    </time>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className={styles.card}>
            <h3 className={`${styles.label} ${styles.sectionLabel}`}>
              Coverage ({runCount} run{runCount !== 1 ? "s" : ""})
            </h3>
            <ul className={styles.coverageList} role="list">
              {[...entries]
                .sort((a, b) => statusSortOrder(a.latestStatus) - statusSortOrder(b.latestStatus))
                .map((entry) => (
                  <li key={entry.case?.path} className={styles.coverageRow}>
                    <span
                      className={styles.statusDot}
                      aria-hidden="true"
                      data-status={ResultStatus[entry.latestStatus]}
                    />
                    <span className={styles.coveragePath}>{entry.case?.path}</span>
                    <span className={styles.coverageTitle}>{entry.case?.title}</span>
                    {entry.lastRunDate && (
                      <time className={styles.coverageDate} dateTime={entry.lastRunDate}>
                        {entry.lastRunDate}
                      </time>
                    )}
                    <span
                      className={styles.coverageStatus}
                      data-status={ResultStatus[entry.latestStatus]}
                    >
                      {statusLabel(entry.latestStatus)}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </>
      )}

      {!loading && !error && repoId && entries.length === 0 && (
        <div className={styles.emptyCard}>No cases found in this repository.</div>
      )}

      {repoId && (
        <div className={styles.card}>
          <h3 className={`${styles.label} ${styles.sectionLabel}`}>Affected Cases by Git Diff</h3>
          <form
            aria-label="Check affected cases by git diff"
            onSubmit={handleAffected}
            className={styles.affectedForm}
          >
            <input
              type="text"
              aria-label="Git ref to compare from (leave empty to use last run commit)"
              value={sinceRef}
              onChange={(e) => setSinceRef(e.target.value)}
              placeholder="Since ref (default: last run commit)"
              className={styles.repoInput}
            />
            <button type="submit" disabled={affectedLoading} className={styles.btn}>
              {affectedLoading ? "Checking…" : "Check Diff"}
            </button>
          </form>
          {affectedError && (
            <div className={styles.inlineError} role="alert">
              <span>{affectedError}</span>
              <button
                type="button"
                onClick={() => setAffectedError(null)}
                className={styles.inlineErrorDismiss}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          {affected !== null &&
            (affected.length === 0 ? (
              <p className={styles.noAffected}>No cases affected by this diff.</p>
            ) : (
              <ul className={styles.affectedList} role="list">
                {[...affected]
                  .sort((a, b) => {
                    const order = { high: 0, medium: 1, low: 2 } as Record<string, number>;
                    return (
                      (order[a.case?.priority ?? ""] ?? 3) - (order[b.case?.priority ?? ""] ?? 3)
                    );
                  })
                  .map((ac, idx) => (
                    <li key={ac.case?.path ?? idx} className={styles.affectedRow}>
                      {ac.case?.priority && (
                        <>
                          <span
                            className={styles.priorityDot}
                            data-priority={ac.case.priority}
                            aria-hidden="true"
                          />
                          <span className="sr-only">{ac.case.priority} priority</span>
                        </>
                      )}
                      <span className={styles.affectedPath}>{ac.case?.path}</span>
                      <span className={styles.affectedTitle}>{ac.case?.title}</span>
                      <span className={styles.affectedReason}>{ac.reason}</span>
                    </li>
                  ))}
              </ul>
            ))}
        </div>
      )}
    </div>
  );
}
