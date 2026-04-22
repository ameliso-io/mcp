"use client";

import type { Route } from "next";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import styles from "./OverviewTab.module.css";
import { client } from "@/client";
import { errorMessage } from "@/errorMessage";
import type { AffectedCase, CoverageEntry, RunMeta } from "@/gen/ameliso/v1/types_pb";
import { ResultStatus, RunStatus } from "@/gen/ameliso/v1/types_pb";
import { useAnnounce } from "@/hooks/useAnnounce";

interface Props {
  repoId: string;
  basePath: string;
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

export default function OverviewTab({ repoId, basePath }: Props) {
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeRuns, setActiveRuns] = useState<RunMeta[]>([]);
  const [activeRunsStatus, setActiveRunsStatus] = useState<
    Map<string, { pendingCases: number; totalInScope: number }>
  >(new Map());

  const [coverageFilter, setCoverageFilter] = useState<ResultStatus>(ResultStatus.UNSPECIFIED);

  const [sinceRef, setSinceRef] = useState("");
  const [affected, setAffected] = useState<AffectedCase[] | null>(null);
  const [affectedLoading, setAffectedLoading] = useState(false);
  const [affectedError, setAffectedError] = useState<string | null>(null);
  const [announcement, announce] = useAnnounce();

  const loadIdRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (path: string, silent = false) => {
      /* v8 ignore next 2 — useEffect guards !path before calling load */
      if (!path) return;
      const id = ++loadIdRef.current;
      setLoading(true);
      setError(null);
      try {
        const [coverageRes, activeRunsRes, statusRes] = await Promise.all([
          client.getCoverageReport({ repoId: path, statusFilter: coverageFilter }),
          client.listRuns({ repoId: path, status: RunStatus.IN_PROGRESS }),
          client.getRepoStatus({ repoId: path }),
        ]);
        /* v8 ignore next 1 — race guard, covered by stale load test */
        if (id !== loadIdRef.current) return;
        setEntries(coverageRes.entries);
        setRunCount(coverageRes.runCount);
        setActiveRuns(activeRunsRes.runs);
        setActiveRunsStatus(
          new Map(
            statusRes.activeRuns.map((r) => [
              r.runId,
              { pendingCases: r.pendingCases, totalInScope: r.totalInScope },
            ])
          )
        );
        if (!silent) {
          const n = coverageRes.entries.length;
          announce(n === 0 ? "No cases found" : `${n} case${n !== 1 ? "s" : ""} loaded`);
        }
      } catch (e) {
        /* v8 ignore next 1 — race guard */
        if (id !== loadIdRef.current) return;
        setError(errorMessage(e));
      } finally {
        /* v8 ignore next 1 — race guard */
        if (id === loadIdRef.current) setLoading(false);
      }
    },
    [announce, coverageFilter]
  );

  useEffect(() => {
    setCoverageFilter(ResultStatus.UNSPECIFIED);
  }, [repoId]);

  useEffect(() => {
    if (repoId) {
      void load(repoId);
    }
  }, [repoId, load]);

  // Auto-refresh every 30s while there are active runs — silent to avoid screen reader spam
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (repoId && activeRuns.length > 0) {
      pollRef.current = setInterval(() => void load(repoId, true), 30_000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [repoId, activeRuns.length, load]);

  const handleAffected = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      /* v8 ignore next 2 — component returns early rendering when repoId is empty */
      if (!repoId) return;
      setAffectedLoading(true);
      setAffectedError(null);
      try {
        const res = await client.getAffectedCases({ repoId, sinceRef });
        setAffected(res.cases);
        const n = res.cases.length;
        announce(n === 0 ? "No cases affected" : `${n} case${n !== 1 ? "s" : ""} affected`);
      } catch (err) {
        setAffectedError(errorMessage(err));
      } finally {
        setAffectedLoading(false);
      }
    },
    [repoId, sinceRef, announce]
  );

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => statusSortOrder(a.latestStatus) - statusSortOrder(b.latestStatus)
      ),
    [entries]
  );

  const sortedAffected = useMemo(
    () =>
      affected === null
        ? null
        : [...affected].sort((a, b) => {
            const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
            return (order[a.case?.priority ?? ""] ?? 3) - (order[b.case?.priority ?? ""] ?? 3);
          }),
    [affected]
  );

  const { statCases, statPassed, statFailed, statBlocked, statSkipped, statNever } = useMemo(() => {
    let passed = 0;
    let failed = 0;
    let blocked = 0;
    let skipped = 0;
    let never = 0;
    for (const e of entries) {
      if (e.latestStatus === ResultStatus.PASSED) passed++;
      else if (e.latestStatus === ResultStatus.FAILED) failed++;
      else if (e.latestStatus === ResultStatus.BLOCKED) blocked++;
      else if (e.latestStatus === ResultStatus.SKIPPED) skipped++;
      else if (e.latestStatus === ResultStatus.NEVER) never++;
    }
    return { statCases: entries.length, statPassed: passed, statFailed: failed, statBlocked: blocked, statSkipped: skipped, statNever: never };
  }, [entries]);

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <h2 className={styles.title}>Overview</h2>

      {error && (
        <div className={styles.errorCard} role="alert">
          <span>{error}</span>
          <div className={styles.errorActions}>
            <button type="button" onClick={() => load(repoId)} className={styles.errorRetry}>
              Retry
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
              }}
              className={styles.errorDismiss}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {!repoId && !loading && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No repository selected</p>
          <p className={styles.emptyDesc}>
            Go to the Repositories tab and click &ldquo;Use&rdquo; to select a repository.
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
              { label: "Blocked", value: statBlocked },
              { label: "Skipped", value: statSkipped },
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
                <Link href={`${basePath}/runs` as Route} className={styles.goToRunsBtn}>
                  Go to Runs
                </Link>
              </div>
              <ul className={styles.runList} role="list">
                {activeRuns.map((run) => {
                  const status = activeRunsStatus.get(run.id);
                  return (
                    <li key={run.id} className={styles.runRow}>
                      <span className={styles.runId}>{run.id}</span>
                      {run.suite && <span className={styles.runSuiteBadge}>{run.suite}</span>}
                      {run.tester && <span className={styles.runTester}>{run.tester}</span>}
                      <time className={styles.runDate} dateTime={run.date}>
                        {run.date}
                      </time>
                      {status && (
                        <div className={styles.runProgressWrap}>
                          <div
                            className={styles.runProgressTrack}
                            role="progressbar"
                            aria-label="Run progress"
                            aria-valuemin={0}
                            aria-valuemax={status.totalInScope}
                            aria-valuenow={status.totalInScope - status.pendingCases}
                          >
                            <div
                              className={styles.runProgressBar}
                              style={{
                                width:
                                  status.totalInScope > 0
                                    ? `${Math.round(((status.totalInScope - status.pendingCases) / status.totalInScope) * 100)}%`
                                    : "0%",
                              }}
                            />
                          </div>
                          <span className={styles.runProgressText}>
                            {status.totalInScope - status.pendingCases}/{status.totalInScope} done
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className={styles.card}>
            <div className={styles.coverageHeader}>
              <h3 className={`${styles.label} ${styles.sectionLabel}`}>
                Coverage ({runCount} run{runCount !== 1 ? "s" : ""})
              </h3>
              <select
                aria-label="Filter coverage by status"
                value={coverageFilter}
                onChange={(e) => {
                  setCoverageFilter(Number(e.target.value));
                }}
                className={styles.filterSelect}
              >
                <option value={ResultStatus.UNSPECIFIED}>All statuses</option>
                <option value={ResultStatus.PASSED}>Passed</option>
                <option value={ResultStatus.FAILED}>Failed</option>
                <option value={ResultStatus.BLOCKED}>Blocked</option>
                <option value={ResultStatus.SKIPPED}>Skipped</option>
                <option value={ResultStatus.NEVER}>Never run</option>
              </select>
            </div>
            <ul className={styles.coverageList} role="list">
              {sortedEntries.map((entry) => (
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
        <div className={styles.card} aria-busy={affectedLoading}>
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
              onChange={(e) => {
                setSinceRef(e.target.value);
              }}
              placeholder="Since ref (default: last run commit)"
              className={styles.repoInput}
              autoComplete="off"
              spellCheck={false}
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
                onClick={() => {
                  setAffectedError(null);
                }}
                className={styles.inlineErrorDismiss}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}
          {sortedAffected !== null &&
            (sortedAffected.length === 0 ? (
              <p className={styles.noAffected}>No cases affected by this diff.</p>
            ) : (
              <ul className={styles.affectedList} role="list">
                {sortedAffected.map((ac, idx) => (
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
