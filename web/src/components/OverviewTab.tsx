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
import { useInterval } from "@/hooks/useInterval";

interface Props {
  repoId: string;
  basePath: string;
  initialCoverageFilter?: ResultStatus | undefined;
  onCoverageFilterChange?: ((s: ResultStatus) => void) | undefined;
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

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

export default function OverviewTab({
  repoId,
  basePath,
  initialCoverageFilter,
  onCoverageFilterChange,
}: Props) {
  const [entries, setEntries] = useState<CoverageEntry[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeRuns, setActiveRuns] = useState<RunMeta[]>([]);
  const [activeRunsStatus, setActiveRunsStatus] = useState<
    Map<string, { pendingCases: number; totalInScope: number }>
  >(new Map());

  const [coverageFilter, setCoverageFilter] = useState<ResultStatus>(
    initialCoverageFilter ?? ResultStatus.UNSPECIFIED
  );

  const [sinceRef, setSinceRef] = useState("");
  const [affected, setAffected] = useState<AffectedCase[] | null>(null);
  const [affectedLoading, setAffectedLoading] = useState(false);
  const [affectedError, setAffectedError] = useState<string | null>(null);
  const [announcement, announce] = useAnnounce();

  const loadAbortRef = useRef<AbortController | null>(null);
  const filterMountedRef = useRef(false);

  const load = useCallback(
    async (silent = false) => {
      loadAbortRef.current?.abort();
      const ctrl = new AbortController();
      loadAbortRef.current = ctrl;
      const { signal } = ctrl;
      setLoading(true);
      setError(null);
      try {
        const [coverageRes, activeRunsRes, statusRes] = await Promise.all([
          client.getCoverageReport({ repoId, statusFilter: coverageFilter }, { signal }),
          client.listRuns({ repoId, status: RunStatus.IN_PROGRESS }, { signal }),
          client.getRepoStatus({ repoId }, { signal }),
        ]);
        if (signal.aborted) return;
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
        /* v8 ignore next 2 — abort guard */
        if (signal.aborted) return;
        setError(errorMessage(e));
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [repoId, announce, coverageFilter]
  );

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  useEffect(() => {
    if (!filterMountedRef.current) {
      filterMountedRef.current = true;
      return;
    }
    setCoverageFilter(ResultStatus.UNSPECIFIED);
  }, [repoId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Auto-refresh every 30s while there are active runs — silent to avoid screen reader spam
  useInterval(() => load(true), activeRuns.length > 0 ? 30_000 : null);

  async function handleAffected(e: React.FormEvent) {
    e.preventDefault();
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
  }

  const { statCases, statPassed, statFailed, statBlocked, statSkipped, statNever } = useMemo(() => {
    let passed = 0,
      failed = 0,
      blocked = 0,
      skipped = 0,
      never = 0;
    for (const e of entries) {
      if (e.latestStatus === ResultStatus.PASSED) passed++;
      else if (e.latestStatus === ResultStatus.FAILED) failed++;
      else if (e.latestStatus === ResultStatus.BLOCKED) blocked++;
      else if (e.latestStatus === ResultStatus.SKIPPED) skipped++;
      else if (e.latestStatus === ResultStatus.NEVER) never++;
    }
    return {
      statCases: entries.length,
      statPassed: passed,
      statFailed: failed,
      statBlocked: blocked,
      statSkipped: skipped,
      statNever: never,
    };
  }, [entries]);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) => statusSortOrder(a.latestStatus) - statusSortOrder(b.latestStatus)
      ),
    [entries]
  );

  return (
    <div>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <h2 className={styles.title}>Overview</h2>

      {error && (
        <div className={styles.errorCard} role="alert">
          <span>{error}</span>
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
              { label: "Total Cases", value: statCases, status: null },
              { label: "Passed", value: statPassed, status: ResultStatus.PASSED },
              { label: "Failed", value: statFailed, status: ResultStatus.FAILED },
              { label: "Blocked", value: statBlocked, status: ResultStatus.BLOCKED },
              { label: "Skipped", value: statSkipped, status: ResultStatus.SKIPPED },
              { label: "Never Run", value: statNever, status: ResultStatus.NEVER },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`${styles.statCard}${stat.status !== null && coverageFilter === stat.status ? ` ${styles.statCardActive}` : ""}`}
              >
                <dt className={styles.label}>{stat.label}</dt>
                <dd className={styles.statValue} data-stat={stat.label}>
                  {stat.status !== null ? (
                    <button
                      type="button"
                      className={styles.statBtn}
                      aria-label={`Filter by ${stat.label}`}
                      aria-pressed={coverageFilter === stat.status}
                      onClick={() => {
                        const next =
                          coverageFilter === stat.status
                            ? ResultStatus.UNSPECIFIED
                            : stat.status;
                        setCoverageFilter(next);
                        onCoverageFilterChange?.(next);
                      }}
                    >
                      {stat.value}
                    </button>
                  ) : (
                    stat.value
                  )}
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
                      <Link
                        href={`${basePath}/runs?run=${run.id}` as Route}
                        className={styles.runId}
                      >
                        {run.id}
                      </Link>
                      {run.suite && (
                        <Link
                          href={
                            `${basePath}/suites?expanded=${encodeURIComponent(run.suite)}` as Route
                          }
                          className={styles.runSuiteBadge}
                        >
                          {run.suite}
                        </Link>
                      )}
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
                  const next = Number(e.target.value);
                  setCoverageFilter(next);
                  onCoverageFilterChange?.(next);
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
                  <Link
                    href={
                      /* v8 ignore next */
                      `${basePath}/cases?case=${encodeURIComponent(entry.case?.path ?? "")}` as Route
                    }
                    className={styles.coveragePath}
                  >
                    {entry.case?.path}
                  </Link>
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

      {!loading && !error && entries.length === 0 && (
        <div className={styles.emptyCard}>No cases found in this repository.</div>
      )}

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
            onChange={(e) => {
              setSinceRef(e.target.value);
            }}
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
        {affected !== null &&
          (affected.length === 0 ? (
            <p className={styles.noAffected}>No cases affected by this diff.</p>
          ) : (
            <ul className={styles.affectedList} role="list">
              {[...affected]
                .sort(
                  (a, b) =>
                    (PRIORITY_ORDER[a.case?.priority ?? ""] ?? 3) -
                    (PRIORITY_ORDER[b.case?.priority ?? ""] ?? 3)
                )
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
                    <Link
                      href={
                        /* v8 ignore next */
                        `${basePath}/cases?case=${encodeURIComponent(ac.case?.path ?? "")}` as Route
                      }
                      className={styles.affectedPath}
                    >
                      {ac.case?.path}
                    </Link>
                    <span className={styles.affectedTitle}>{ac.case?.title}</span>
                    <span className={styles.affectedReason}>{ac.reason}</span>
                  </li>
                ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
