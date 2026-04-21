import { useState, useEffect, useCallback, useRef, useId } from 'react'
import { client } from '../client'
import { errorMessage } from '../errorMessage'
import type { AffectedCase, CoverageEntry, RunMeta } from '../gen/ameliso/v1/types_pb'
import { ResultStatus, RunStatus } from '../gen/ameliso/v1/types_pb'
import styles from './OverviewTab.module.css'

interface Props {
  repoPath: string
  onRepoPathChange: (p: string) => void
  onGoToRuns?: () => void
}

function statusSortOrder(s: ResultStatus): number {
  switch (s) {
    case ResultStatus.FAILED: return 0
    case ResultStatus.BLOCKED: return 1
    case ResultStatus.NEVER: return 2
    case ResultStatus.SKIPPED: return 3
    case ResultStatus.PASSED: return 4
    default: return 5
  }
}


function statusLabel(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED: return 'Passed'
    case ResultStatus.FAILED: return 'Failed'
    case ResultStatus.BLOCKED: return 'Blocked'
    case ResultStatus.SKIPPED: return 'Skipped'
    case ResultStatus.NEVER: return 'Never run'
    default: return 'Unknown'
  }
}




export default function OverviewTab({ repoPath, onRepoPathChange, onGoToRuns }: Props) {
  const [inputPath, setInputPath] = useState(repoPath)
  const [entries, setEntries] = useState<CoverageEntry[]>([])
  const [runCount, setRunCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeRuns, setActiveRuns] = useState<RunMeta[]>([])
  const [sinceRef, setSinceRef] = useState('')
  const [affected, setAffected] = useState<AffectedCase[] | null>(null)
  const [affectedLoading, setAffectedLoading] = useState(false)
  const [affectedError, setAffectedError] = useState<string | null>(null)
  const repoPathId = useId()
  const sinceRefId = useId()

  const load = useCallback(async (path: string) => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      const [coverageRes, activeRunsRes] = await Promise.all([
        client.getCoverageReport({ repoPath: path }),
        client.listRuns({ repoPath: path, status: RunStatus.IN_PROGRESS }),
      ])
      setEntries(coverageRes.entries)
      setRunCount(coverageRes.runCount)
      setActiveRuns(activeRunsRes.runs)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (repoPath) setInputPath(repoPath)
  }, [repoPath])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (repoPath) load(repoPath) }, [repoPath, load])

  // Auto-refresh every 30s while there are active runs
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (repoPath && activeRuns.length > 0) {
      pollRef.current = setInterval(() => load(repoPath), 30_000)
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [repoPath, activeRuns.length, load])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onRepoPathChange(inputPath)
    load(inputPath)
  }

  async function handleAffected(e: React.FormEvent) {
    e.preventDefault()
    if (!repoPath) return
    setAffectedLoading(true)
    setAffectedError(null)
    try {
      const res = await client.getAffectedCases({ repoPath, sinceRef })
      setAffected(res.cases)
    } catch (err) {
      setAffectedError(errorMessage(err))
    } finally {
      setAffectedLoading(false)
    }
  }

  const statCases = entries.length
  const statPassed = entries.filter(e => e.latestStatus === ResultStatus.PASSED).length
  const statFailed = entries.filter(e => e.latestStatus === ResultStatus.FAILED).length
  const statNever = entries.filter(e => e.latestStatus === ResultStatus.NEVER).length

  return (
    <div>
      <h2 className={styles.title}>Overview</h2>

      <div className={styles.card}>
        <label htmlFor={repoPathId} className={styles.label}>Repository Path</label>
        <form onSubmit={handleSubmit} className={styles.repoForm}>
          <input id={repoPathId} type="text" value={inputPath} onChange={e => setInputPath(e.target.value)} placeholder="/path/to/repo" className={styles.repoInput} />
          <button type="submit" className={styles.btn}>Load</button>
        </form>
      </div>

      {error && (
        <div className={styles.errorCard}>
          <span>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

      {!repoPath && !loading && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>Enter a repository path to get started</p>
          <p className={styles.emptyDesc}>
            Point Ameliso at a repository that contains a <code className={styles.inline}>cases/</code> directory.
          </p>
          <p className={styles.emptyHint}>Or use the Repositories tab to connect a GitHub repository.</p>
        </div>
      )}

      {loading && <div className={styles.loadingMsg}>Loading…</div>}

      {!loading && entries.length > 0 && (
        <>
          <div className={styles.statsGrid}>
            {[
              { label: 'Total Cases', value: statCases },
              { label: 'Passed', value: statPassed },
              { label: 'Failed', value: statFailed },
              { label: 'Never Run', value: statNever },
            ].map(stat => (
              <div key={stat.label} className={styles.statCard}>
                <p className={styles.label}>{stat.label}</p>
                <p className={styles.statValue} data-stat={stat.label}>{stat.value}</p>
              </div>
            ))}
          </div>

          {activeRuns.length > 0 && (
            <div className={styles.activeRunsCard}>
              <div className={styles.activeRunsHeader}>
                <p className={styles.activeRunsLabel}>
                  Active Runs ({activeRuns.length})
                  <span className={styles.refreshHint}>auto-refresh 30s</span>
                </p>
                {onGoToRuns && (
                  <button onClick={onGoToRuns} className={styles.goToRunsBtn}>Go to Runs</button>
                )}
              </div>
              <div className={styles.runList}>
                {activeRuns.map(run => (
                  <div key={run.id} className={styles.runRow}>
                    <span className={styles.runId}>{run.id}</span>
                    {run.suite && <span className={styles.runSuiteBadge}>{run.suite}</span>}
                    {run.tester && <span className={styles.runTester}>{run.tester}</span>}
                    <span className={styles.runDate}>{run.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.card}>
            <p className={styles.label}>Coverage ({runCount} run{runCount !== 1 ? 's' : ''})</p>
            <div className={styles.coverageList}>
              {[...entries].sort((a, b) => statusSortOrder(a.latestStatus) - statusSortOrder(b.latestStatus)).map(entry => (
                <div key={entry.case?.path} className={styles.coverageRow}>
                  <span className={styles.statusDot} data-status={ResultStatus[entry.latestStatus]} />
                  <span className={styles.coveragePath}>{entry.case?.path}</span>
                  <span className={styles.coverageTitle}>{entry.case?.title}</span>
                  {entry.lastRunDate && <span className={styles.coverageDate}>{entry.lastRunDate}</span>}
                  <span className={styles.coverageStatus} data-status={ResultStatus[entry.latestStatus]}>
                    {statusLabel(entry.latestStatus)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && !error && repoPath && entries.length === 0 && (
        <div className={styles.emptyCard}>No cases found in this repository.</div>
      )}

      {repoPath && (
        <div className={styles.card}>
          <label htmlFor={sinceRefId} className={styles.label}>Affected Cases by Git Diff</label>
          <form onSubmit={handleAffected} className={styles.affectedForm}>
            <input id={sinceRefId} type="text" value={sinceRef} onChange={e => setSinceRef(e.target.value)} placeholder="Since ref (default: last run commit)" className={styles.repoInput} />
            <button type="submit" disabled={affectedLoading} className={styles.btn}>
              {affectedLoading ? 'Checking…' : 'Check Diff'}
            </button>
          </form>
          {affectedError && (
            <div className={styles.inlineError}>
              <span>{affectedError}</span>
              <button className={styles.inlineErrorDismiss} onClick={() => setAffectedError(null)} aria-label="Dismiss error">×</button>
            </div>
          )}
          {affected !== null && (
            affected.length === 0 ? (
              <p className={styles.noAffected}>No cases affected by this diff.</p>
            ) : (
              <div className={styles.affectedList}>
                {[...affected].sort((a, b) => {
                  const order = { high: 0, medium: 1, low: 2 } as Record<string, number>
                  return (order[a.case?.priority ?? ''] ?? 3) - (order[b.case?.priority ?? ''] ?? 3)
                }).map(ac => (
                  <div key={ac.case?.path} className={styles.affectedRow}>
                    {ac.case?.priority && (
                      <span className={styles.priorityDot} data-priority={ac.case.priority} />
                    )}
                    <span className={styles.affectedPath}>{ac.case?.path}</span>
                    <span className={styles.affectedTitle}>{ac.case?.title}</span>
                    <span className={styles.affectedReason}>{ac.reason}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
