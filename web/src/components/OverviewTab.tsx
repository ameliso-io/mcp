import { useState, useEffect, useCallback } from 'react'
import { client } from '../client'
import { errorMessage } from '../errorMessage'
import type { AffectedCase, CoverageEntry, RunMeta } from '../gen/ameliso/v1/types_pb'
import { ResultStatus, RunStatus } from '../gen/ameliso/v1/types_pb'

interface Props {
  repoPath: string
  onRepoPathChange: (p: string) => void
  onGoToRuns?: () => void
}

const card = {
  background: 'white',
  borderRadius: '8px',
  padding: '20px',
  border: '1px solid #e2e8f0',
  marginBottom: '16px',
}

const label = {
  fontSize: '12px',
  fontWeight: '600',
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '6px',
}

function statusColor(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED: return '#22c55e'
    case ResultStatus.FAILED: return '#ef4444'
    case ResultStatus.BLOCKED: return '#f97316'
    case ResultStatus.SKIPPED: return '#94a3b8'
    case ResultStatus.NEVER: return '#e2e8f0'
    default: return '#e2e8f0'
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
  const [runPending, setRunPending] = useState<Record<string, { pending: number; total: number }>>({})

  const [sinceRef, setSinceRef] = useState('')
  const [affected, setAffected] = useState<AffectedCase[] | null>(null)
  const [affectedLoading, setAffectedLoading] = useState(false)
  const [affectedError, setAffectedError] = useState<string | null>(null)

  const load = useCallback(async (path: string) => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      const [coverageRes, runsRes] = await Promise.all([
        client.getCoverageReport({ repoPath: path }),
        client.listRuns({ repoPath: path }),
      ])
      setEntries(coverageRes.entries)
      setRunCount(coverageRes.runCount)
      const inProgress = runsRes.runs.filter(r => r.status === RunStatus.IN_PROGRESS)
      setActiveRuns(inProgress)
      // fetch pending counts in parallel (typically few active runs)
      const pendingResults = await Promise.allSettled(
        inProgress.map(r => client.getPendingCases({ repoPath: path, runId: r.id }))
      )
      const pending: Record<string, { pending: number; total: number }> = {}
      inProgress.forEach((r, i) => {
        const res = pendingResults[i]
        if (res.status === 'fulfilled') {
          pending[r.id] = { pending: res.value.cases.length, total: res.value.totalInScope }
        }
      })
      setRunPending(pending)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (repoPath) {
      setInputPath(repoPath)
      load(repoPath)
    }
  }, [repoPath, load])

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

  const counts = {
    passed: entries.filter(e => e.latestStatus === ResultStatus.PASSED).length,
    failed: entries.filter(e => e.latestStatus === ResultStatus.FAILED).length,
    blocked: entries.filter(e => e.latestStatus === ResultStatus.BLOCKED).length,
    never: entries.filter(e => e.latestStatus === ResultStatus.NEVER || e.latestStatus === ResultStatus.UNSPECIFIED).length,
  }

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '22px', fontWeight: '700' }}>
        Overview
      </h2>

      <div style={card}>
        <p style={label}>Repository Path</p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputPath}
            onChange={e => setInputPath(e.target.value)}
            placeholder="/path/to/repo"
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '8px 16px',
              background: '#1e293b',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Load
          </button>
        </form>
      </div>

      {error && (
        <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>
          Loading…
        </div>
      )}

      {!loading && entries.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Total Cases', value: entries.length, color: '#1e293b' },
              { label: 'Passed', value: counts.passed, color: '#16a34a' },
              { label: 'Failed', value: counts.failed, color: '#dc2626' },
              { label: 'Never Run', value: counts.never, color: '#94a3b8' },
            ].map(stat => (
              <div key={stat.label} style={{ ...card, marginBottom: 0 }}>
                <p style={label}>{stat.label}</p>
                <p style={{ margin: 0, fontSize: '32px', fontWeight: '700', color: stat.color }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {activeRuns.length > 0 && (
            <div style={{ ...card, border: '1px solid #bfdbfe', background: '#eff6ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <p style={{ ...label, color: '#3b82f6', margin: 0 }}>
                  Active Runs ({activeRuns.length})
                </p>
                {onGoToRuns && (
                  <button
                    onClick={onGoToRuns}
                    style={{
                      background: 'none',
                      border: '1px solid #bfdbfe',
                      color: '#3b82f6',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}
                  >
                    Go to Runs
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeRuns.map(run => {
                  const p = runPending[run.id]
                  const done = p ? p.total - p.pending : null
                  const pct = p && p.total > 0 ? Math.round((done! / p.total) * 100) : null
                  return (
                    <div
                      key={run.id}
                      style={{
                        padding: '12px',
                        background: 'white',
                        borderRadius: '6px',
                        border: '1px solid #dbeafe',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: p ? '8px' : 0 }}>
                        <span style={{ fontWeight: '600', fontSize: '14px', flex: 1, fontFamily: 'monospace' }}>{run.id}</span>
                        {run.suite && (
                          <span style={{ fontSize: '11px', background: '#eff6ff', color: '#3b82f6', padding: '2px 7px', borderRadius: '4px', fontWeight: '600' }}>{run.suite}</span>
                        )}
                        {run.tester && (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>{run.tester}</span>
                        )}
                        {p && (
                          <span style={{ fontSize: '12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {done} / {p.total} done
                          </span>
                        )}
                      </div>
                      {p && p.total > 0 && (
                        <div style={{ height: '4px', background: '#dbeafe', borderRadius: '2px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${pct}%`,
                              background: '#3b82f6',
                              borderRadius: '2px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={card}>
            <p style={{ ...label, marginBottom: '12px' }}>Coverage ({runCount} run{runCount !== 1 ? 's' : ''})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {entries.map(entry => (
                <div
                  key={entry.case?.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: '6px',
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: statusColor(entry.latestStatus),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace' }}>
                    {entry.case?.path}
                  </span>
                  <span style={{ fontSize: '13px', color: '#64748b' }}>
                    {entry.case?.title}
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      color: statusColor(entry.latestStatus),
                    }}
                  >
                    {statusLabel(entry.latestStatus)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && !error && repoPath && entries.length === 0 && (
        <div style={{ ...card, color: '#64748b', textAlign: 'center', padding: '40px' }}>
          No cases found in this repository.
        </div>
      )}

      {repoPath && (
        <div style={card}>
          <p style={{ ...label, marginBottom: '12px' }}>Affected Cases by Git Diff</p>
          <form onSubmit={handleAffected} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <input
              type="text"
              value={sinceRef}
              onChange={e => setSinceRef(e.target.value)}
              placeholder="Since ref (default: last run commit)"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
            <button
              type="submit"
              disabled={affectedLoading}
              style={{
                padding: '8px 16px',
                background: '#1e293b',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '14px',
                whiteSpace: 'nowrap',
              }}
            >
              {affectedLoading ? 'Checking…' : 'Check Diff'}
            </button>
          </form>
          {affectedError && (
            <div style={{ color: '#991b1b', fontSize: '13px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span>{affectedError}</span>
              <button onClick={() => setAffectedError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '14px', padding: '0 0 0 8px' }}>×</button>
            </div>
          )}
          {affected !== null && (
            affected.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>No cases affected by this diff.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {affected.map(ac => (
                  <div
                    key={ac.case?.path}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 12px',
                      background: '#f8fafc',
                      borderRadius: '6px',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace' }}>{ac.case?.path}</span>
                    <span style={{ fontSize: '13px', color: '#64748b' }}>{ac.case?.title}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>{ac.reason}</span>
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
