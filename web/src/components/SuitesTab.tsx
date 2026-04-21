import { useState, useEffect, useCallback } from 'react'
import { client } from '../client'
import { errorMessage } from '../errorMessage'
import type { Suite, Case } from '../gen/ameliso/v1/types_pb'

interface Props {
  repoPath: string
  onRunSuite?: (slug: string) => void
}

const card: React.CSSProperties = {
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

const label: React.CSSProperties = {
  fontSize: '13px',
  color: '#64748b',
  display: 'block',
  marginBottom: '4px',
}

export default function SuitesTab({ repoPath, onRunSuite }: Props) {
  const [suites, setSuites] = useState<Suite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedCases, setExpandedCases] = useState<Case[]>([])
  const [expandedCasesLoading, setExpandedCasesLoading] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [newSlug, setNewSlug] = useState('')

  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCases, setNewCases] = useState('')
  const [creating, setCreating] = useState(false)

  // Edit suite state
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editCases, setEditCases] = useState('')
  const [saving, setSaving] = useState(false)

  async function toggleExpand(slug: string) {
    if (expanded === slug) {
      setExpanded(null)
      setExpandedCases([])
      return
    }
    setExpanded(slug)
    setExpandedCases([])
    setExpandedCasesLoading(true)
    try {
      const res = await client.listCases({ repoPath, suite: slug })
      setExpandedCases(res.cases)
    } catch {
      // silently fall back — suite.cases paths still visible
    } finally {
      setExpandedCasesLoading(false)
    }
  }

  function startEdit(suite: Suite) {
    setEditingSlug(suite.slug)
    setEditName(suite.name)
    setEditDesc(suite.description)
    setEditCases(suite.cases.join(', '))
  }

  const load = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const res = await client.listSuites({ repoPath })
      setSuites(res.suites)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!repoPath || !newSlug || !newName) return
    setCreating(true)
    try {
      await client.createSuite({
        repoPath,
        slug: newSlug,
        name: newName,
        description: newDesc,
        cases: newCases ? newCases.split(',').map(c => c.trim()).filter(Boolean) : [],
      })
      setShowCreate(false)
      setNewSlug('')
      setNewName('')
      setNewDesc('')
      setNewCases('')
      load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(slug: string) {
    if (!confirm(`Delete suite "${slug}"?`)) return
    try {
      await client.deleteSuite({ repoPath, slug })
      if (expanded === slug) setExpanded(null)
      load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingSlug) return
    setSaving(true)
    try {
      await client.updateSuite({
        repoPath,
        slug: editingSlug,
        name: editName,
        description: editDesc,
        cases: editCases ? editCases.split(',').map(c => c.trim()).filter(Boolean) : [],
      })
      setEditingSlug(null)
      load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
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
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Suites</h2>
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
          {showCreate ? 'Cancel' : '+ New Suite'}
        </button>
      </div>

      {showCreate && (
        <div style={card}>
          <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '16px' }}>Create Suite</h3>
          <form onSubmit={handleCreate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={label}>Slug</label>
              <input value={newSlug} onChange={e => setNewSlug(e.target.value)} required style={inputStyle} placeholder="e.g. smoke" />
            </div>
            <div>
              <label style={label}>Name</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} required style={inputStyle} placeholder="e.g. Smoke Tests" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>Description</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={label}>Cases (comma-separated paths)</label>
              <input
                value={newCases}
                onChange={e => setNewCases(e.target.value)}
                style={inputStyle}
                placeholder="auth/login, auth/logout"
              />
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
                {creating ? 'Creating…' : 'Create Suite'}
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

      {!loading && suites.length === 0 && !error && (
        <div style={{ ...card, color: '#64748b', textAlign: 'center', padding: '40px' }}>
          No suites found.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {suites.map(suite => (
          <div key={suite.slug}>
            {editingSlug === suite.slug ? (
              <div style={card}>
                <h3 style={{ marginTop: 0, marginBottom: '14px', fontSize: '15px' }}>Edit: {suite.slug}</h3>
                <form onSubmit={handleUpdate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={label}>Name</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} required style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={label}>Description</label>
                    <input value={editDesc} onChange={e => setEditDesc(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={label}>Cases (comma-separated paths)</label>
                    <input value={editCases} onChange={e => setEditCases(e.target.value)} style={inputStyle} />
                  </div>
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: '8px' }}>
                    <button
                      type="submit"
                      disabled={saving}
                      style={{ padding: '6px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSlug(null)}
                      style={{ padding: '6px 16px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div
                  style={{
                    ...card,
                    marginBottom: 0,
                    cursor: 'pointer',
                    borderColor: expanded === suite.slug ? '#3b82f6' : '#e2e8f0',
                  }}
                  onClick={() => toggleExpand(suite.slug)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontWeight: '600', fontSize: '15px', flex: 1 }}>{suite.name}</span>
                    <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>{suite.slug}</span>
                    <span style={{ fontSize: '12px', color: '#64748b', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px' }}>
                      {suite.cases.length} case{suite.cases.length !== 1 ? 's' : ''}
                    </span>
                    {onRunSuite && (
                      <button
                        onClick={ev => { ev.stopPropagation(); onRunSuite(suite.slug) }}
                        style={{ background: '#16a34a', border: 'none', color: 'white', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
                      >
                        Run
                      </button>
                    )}
                    <button
                      onClick={ev => { ev.stopPropagation(); startEdit(suite) }}
                      style={{ background: 'none', border: '1px solid #e2e8f0', color: '#334155', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={ev => { ev.stopPropagation(); handleDelete(suite.slug) }}
                      style={{ background: 'none', border: '1px solid #fecaca', color: '#ef4444', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px' }}
                    >
                      Delete
                    </button>
                  </div>
                  {suite.description && (
                    <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#64748b' }}>{suite.description}</p>
                  )}
                </div>

                {expanded === suite.slug && (
                  <div style={{ ...card, marginTop: 0, borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0, background: '#f8fafc' }}>
                    {expandedCasesLoading ? (
                      <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>Loading…</p>
                    ) : expandedCases.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {expandedCases.map(c => (
                          <div
                            key={c.path}
                            style={{
                              padding: '10px 12px',
                              background: 'white',
                              borderRadius: '6px',
                              border: '1px solid #e2e8f0',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: c.priority === 'high' ? '#ef4444' : c.priority === 'medium' ? '#f97316' : '#22c55e',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: '#64748b', flexShrink: 0 }}>{c.path}</span>
                            <span style={{ fontSize: '14px', fontWeight: '500', flex: 1 }}>{c.title}</span>
                            {c.tags.map(t => (
                              <span key={t} style={{ fontSize: '11px', background: '#f1f5f9', color: '#64748b', padding: '2px 6px', borderRadius: '4px' }}>{t}</span>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : suite.cases.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {suite.cases.map(casePath => (
                          <div key={casePath} style={{ padding: '8px 12px', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '14px', fontFamily: 'monospace', color: '#334155' }}>
                            {casePath}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>No cases in this suite.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
