import { useState, useEffect, useCallback } from 'react'
import { client } from '../client'
import type { RunMeta, Case, CaseResult } from '../gen/ameliso/v1/types_pb'
import { RunStatus, ResultStatus } from '../gen/ameliso/v1/types_pb'

interface Props {
  repoPath: string
}

const card = {
  background: 'white',
  borderRadius: '8px',
  padding: '20px',
  border: '1px solid #e2e8f0',
  marginBottom: '16px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: '6px',
  fontSize: '14px',
  boxSizing: 'border-box',
}

function statusColor(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED: return '#22c55e'
    case ResultStatus.FAILED: return '#ef4444'
    case ResultStatus.BLOCKED: return '#f97316'
    case ResultStatus.SKIPPED: return '#94a3b8'
    default: return '#e2e8f0'
  }
}

function statusLabel(s: ResultStatus): string {
  switch (s) {
    case ResultStatus.PASSED: return 'Passed'
    case ResultStatus.FAILED: return 'Failed'
    case ResultStatus.BLOCKED: return 'Blocked'
    case ResultStatus.SKIPPED: return 'Skipped'
    default: return 'Unknown'
  }
}

function runStatusLabel(s: RunStatus): string {
  switch (s) {
    case RunStatus.IN_PROGRESS: return 'In Progress'
    case RunStatus.COMPLETED: return 'Completed'
    case RunStatus.ABORTED: return 'Aborted'
    default: return 'Unknown'
  }
}

function runStatusColor(s: RunStatus): string {
  switch (s) {
    case RunStatus.IN_PROGRESS: return '#3b82f6'
    case RunStatus.COMPLETED: return '#22c55e'
    case RunStatus.ABORTED: return '#ef4444'
    default: return '#94a3b8'
  }
}

export default function RunsTab({ repoPath }: Props) {
  const [runs, setRuns] = useState<RunMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create run form
  const [showCreate, setShowCreate] = useState(false)
  const [newSlug, setNewSlug] = useState('')
  const [newTester, setNewTester] = useState('')
  const [newEnv, setNewEnv] = useState('')
  const [newSuite, setNewSuite] = useState('')
  const [creating, setCreating] = useState(false)

  // Selected run for recording results or viewing results
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [pendingCases, setPendingCases] = useState<Case[]>([])
  const [totalInScope, setTotalInScope] = useState(0)
  const [loadingPending, setLoadingPending] = useState(false)
  const [recordedResults, setRecordedResults] = useState<CaseResult[]>([])

  // Record result form
  const [recordingCase, setRecordingCase] = useState<string | null>(null)
  const [recordStatus, setRecordStatus] = useState<ResultStatus>(ResultStatus.PASSED)
  const [recordNotes, setRecordNotes] = useState('')
  const [recording, setRecording] = useState(false)

  const load = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const res = await client.listRuns({ repoPath })
      setRuns(res.runs)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!repoPath || !newSlug) return
    setCreating(true)
    try {
      await client.createRun({
        repoPath,
        slug: newSlug,
        tester: newTester,
        environment: newEnv,
        suite: newSuite,
      })
      setShowCreate(false)
      setNewSlug('')
      setNewTester('')
      setNewEnv('')
      setNewSuite('')
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  async function selectRun(runId: string, status: RunStatus) {
    if (selectedRunId === runId) {
      setSelectedRunId(null)
      setPendingCases([])
      setRecordedResults([])
      return
    }
    setSelectedRunId(runId)
    setLoadingPending(true)
    setPendingCases([])
    setRecordedResults([])
    try {
      if (status === RunStatus.IN_PROGRESS) {
        const res = await client.getPendingCases({ repoPath, runId })
        setPendingCases(res.cases)
        setTotalInScope(res.totalInScope)
      } else {
        const res = await client.getRun({ repoPath, runId })
        setRecordedResults(res.run?.results ?? [])
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingPending(false)
    }
  }

  async function handleRecord(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedRunId || !recordingCase) return
    setRecording(true)
    try {
      await client.recordResult({
        repoPath,
        runId: selectedRunId,
        casePath: recordingCase,
        status: recordStatus,
        notes: recordNotes,
      })
      setRecordingCase(null)
      setRecordNotes('')
      // Refresh pending
      const res = await client.getPendingCases({ repoPath, runId: selectedRunId })
      setPendingCases(res.cases)
      setTotalInScope(res.totalInScope)
    } catch (e) {
      setError(String(e))
    } finally {
      setRecording(false)
    }
  }

  async function handleFinalize(runId: string, status: RunStatus) {
    const label = status === RunStatus.COMPLETED ? 'complete' : 'abort'
    if (!confirm(`Mark run as ${label}?`)) return
    try {
      await client.finalizeRun({ repoPath, runId, status })
      setSelectedRunId(null)
      setPendingCases([])
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleDeleteRun(runId: string) {
    if (!confirm(`Delete run "${runId}"?`)) return
    try {
      await client.deleteRun({ repoPath, runId })
      if (selectedRunId === runId) {
        setSelectedRunId(null)
        setPendingCases([])
      }
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  if (!repoPath) {
    return (
      <div style={{ color: '#64748b', padding: '40px', textAlign: 'center' }}>
        Set a repository path in the Overview tab first.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Runs</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
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
          {showCreate ? 'Cancel' : '+ New Run'}
        </button>
      </div>

      {showCreate && (
        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px' }}>Create Run</h3>
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                Slug
              </label>
              <input value={newSlug} onChange={e => setNewSlug(e.target.value)} required style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                Tester
              </label>
              <input value={newTester} onChange={e => setNewTester(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                Environment
              </label>
              <input value={newEnv} onChange={e => setNewEnv(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                Suite (optional)
              </label>
              <input value={newSuite} onChange={e => setNewSuite(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: '8px 20px',
                  background: '#16a34a',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                {creating ? 'Creating…' : 'Create Run'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '16px', lineHeight: 1, padding: '0 0 0 12px', flexShrink: 0 }}>×</button>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Loading…</div>
      )}

      {!loading && runs.length === 0 && !error && (
        <div style={{ ...card, color: '#64748b', textAlign: 'center', padding: '40px' }}>
          No runs found.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {runs.map(run => (
          <div key={run.id}>
            <div
              style={{
                ...card,
                marginBottom: 0,
                cursor: 'pointer',
                borderColor: selectedRunId === run.id ? '#3b82f6' : '#e2e8f0',
              }}
              onClick={() => selectRun(run.id, run.status)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: '700',
                    color: runStatusColor(run.status),
                    background: runStatusColor(run.status) + '18',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {runStatusLabel(run.status)}
                </span>
                <span style={{ fontWeight: '600', fontSize: '15px', flex: 1 }}>{run.id}</span>
                {run.tester && (
                  <span style={{ fontSize: '13px', color: '#64748b' }}>{run.tester}</span>
                )}
                {run.environment && (
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>{run.environment}</span>
                )}
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>{run.date}</span>
                <button
                  onClick={e => { e.stopPropagation(); handleDeleteRun(run.id) }}
                  style={{
                    background: 'none',
                    border: '1px solid #fecaca',
                    color: '#ef4444',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontSize: '12px',
                  }}
                >
                  Delete
                </button>
              </div>
            </div>

            {selectedRunId === run.id && (
              <div style={{ ...card, marginTop: 0, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, background: '#f8fafc' }}>
                {loadingPending ? (
                  <div style={{ color: '#64748b', padding: '12px 0' }}>Loading…</div>
                ) : run.status !== RunStatus.IN_PROGRESS ? (
                  <div>
                    <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#64748b' }}>
                      {recordedResults.length} result{recordedResults.length !== 1 ? 's' : ''} recorded
                    </p>
                    {recordedResults.length === 0 ? (
                      <p style={{ color: '#64748b', fontSize: '14px' }}>No results recorded.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {recordedResults.map(r => (
                          <div
                            key={r.casePath}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              background: 'white',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: '700',
                                color: statusColor(r.status),
                                background: statusColor(r.status) + '18',
                                padding: '2px 7px',
                                borderRadius: '4px',
                                flexShrink: 0,
                              }}
                            >
                              {statusLabel(r.status)}
                            </span>
                            <span style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace' }}>{r.casePath}</span>
                            {r.notes && (
                              <span style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic' }}>{r.notes}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {totalInScope > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#64748b', marginBottom: '6px' }}>
                          <span>{totalInScope - pendingCases.length} / {totalInScope} done</span>
                          <span>{Math.round(((totalInScope - pendingCases.length) / totalInScope) * 100)}%</span>
                        </div>
                        <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${((totalInScope - pendingCases.length) / totalInScope) * 100}%`,
                              background: '#16a34a',
                              borderRadius: '3px',
                              transition: 'width 0.3s ease',
                            }}
                          />
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <p style={{ margin: 0, fontSize: '14px', color: '#64748b' }}>
                        {pendingCases.length} pending
                      </p>
                      {run.status === RunStatus.IN_PROGRESS && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleFinalize(run.id, RunStatus.COMPLETED)}
                            style={{
                              padding: '6px 14px',
                              background: '#16a34a',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            Complete Run
                          </button>
                          <button
                            onClick={() => handleFinalize(run.id, RunStatus.ABORTED)}
                            style={{
                              padding: '6px 14px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                            }}
                          >
                            Abort Run
                          </button>
                        </div>
                      )}
                    </div>

                    {pendingCases.length === 0 && (
                      <p style={{ color: '#64748b', fontSize: '14px' }}>All cases have results recorded.</p>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {pendingCases.map(c => (
                        <div key={c.path}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '10px 12px',
                              background: 'white',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            <span style={{ flex: 1, fontSize: '14px', fontFamily: 'monospace' }}>{c.path}</span>
                            <span style={{ fontSize: '13px', color: '#64748b' }}>{c.title}</span>
                            {run.status === RunStatus.IN_PROGRESS && (
                              <button
                                onClick={() => setRecordingCase(recordingCase === c.path ? null : c.path)}
                                style={{
                                  padding: '5px 12px',
                                  background: '#3b82f6',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                  fontSize: '13px',
                                }}
                              >
                                Record
                              </button>
                            )}
                          </div>

                          {recordingCase === c.path && (
                            <form
                              onSubmit={handleRecord}
                              style={{
                                background: 'white',
                                padding: '12px',
                                borderRadius: '0 0 6px 6px',
                                border: '1px solid #e2e8f0',
                                borderTop: 'none',
                                display: 'flex',
                                gap: '10px',
                                alignItems: 'flex-end',
                                flexWrap: 'wrap',
                              }}
                            >
                              <div>
                                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                  Status
                                </label>
                                <select
                                  value={recordStatus}
                                  onChange={e => setRecordStatus(Number(e.target.value) as ResultStatus)}
                                  style={{ ...inputStyle, width: 'auto' }}
                                >
                                  <option value={ResultStatus.PASSED}>Passed</option>
                                  <option value={ResultStatus.FAILED}>Failed</option>
                                  <option value={ResultStatus.BLOCKED}>Blocked</option>
                                  <option value={ResultStatus.SKIPPED}>Skipped</option>
                                </select>
                              </div>
                              <div style={{ flex: 1, minWidth: '160px' }}>
                                <label style={{ fontSize: '12px', color: '#64748b', display: 'block', marginBottom: '4px' }}>
                                  Notes
                                </label>
                                <input
                                  value={recordNotes}
                                  onChange={e => setRecordNotes(e.target.value)}
                                  placeholder="Optional notes…"
                                  style={inputStyle}
                                />
                              </div>
                              <button
                                type="submit"
                                disabled={recording}
                                style={{
                                  padding: '8px 16px',
                                  background: '#16a34a',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '14px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {recording ? 'Saving…' : 'Save Result'}
                              </button>
                            </form>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
