'use client'

import { useState, useEffect, useCallback, useId } from 'react'
import { client } from '../client'
import { errorMessage } from '../errorMessage'
import type { Suite, Case } from '../gen/ameliso/v1/types_pb'
import styles from './SuitesTab.module.css'

interface Props {
  repoPath: string
  onRunSuite?: (slug: string) => void
}



export default function SuitesTab({ repoPath, onRunSuite }: Props) {
  const [suites, setSuites] = useState<Suite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [expandedCases, setExpandedCases] = useState<Case[]>([])
  const [expandedCasesLoading, setExpandedCasesLoading] = useState(false)

  const createFormId = useId()
  const editFormId = useId()
  const [showCreate, setShowCreate] = useState(false)
  const [newSlug, setNewSlug] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newCases, setNewCases] = useState('')
  const [creating, setCreating] = useState(false)

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!repoPath || !newSlug || !newName) return
    setCreating(true)
    try {
      await client.createSuite({
        repoPath, slug: newSlug, name: newName, description: newDesc,
        cases: newCases ? newCases.split(',').map(c => c.trim()).filter(Boolean) : [],
      })
      setShowCreate(false)
      setNewSlug(''); setNewName(''); setNewDesc(''); setNewCases('')
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
        repoPath, slug: editingSlug, name: editName, description: editDesc,
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
    return <div className={styles.noRepo}>Set a repository path in the Overview tab first.</div>
  }

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Suites</h2>
        <button className={styles.btn} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancel' : '+ New Suite'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Create Suite</h3>
          <form onSubmit={handleCreate} className={styles.formGrid}>
            <div>
              <label htmlFor={`${createFormId}-slug`} className={styles.label}>Slug</label>
              <input id={`${createFormId}-slug`} className={styles.input} value={newSlug} onChange={e => setNewSlug(e.target.value)} required placeholder="e.g. smoke" />
            </div>
            <div>
              <label htmlFor={`${createFormId}-name`} className={styles.label}>Name</label>
              <input id={`${createFormId}-name`} className={styles.input} value={newName} onChange={e => setNewName(e.target.value)} required placeholder="e.g. Smoke Tests" />
            </div>
            <div className={styles.fullCol}>
              <label htmlFor={`${createFormId}-desc`} className={styles.label}>Description</label>
              <input id={`${createFormId}-desc`} className={styles.input} value={newDesc} onChange={e => setNewDesc(e.target.value)} />
            </div>
            <div className={styles.fullCol}>
              <label htmlFor={`${createFormId}-cases`} className={styles.label}>Cases (comma-separated paths)</label>
              <input id={`${createFormId}-cases`} className={styles.input} value={newCases} onChange={e => setNewCases(e.target.value)} placeholder="auth/login, auth/logout" />
            </div>
            <div className={styles.fullCol}>
              <button type="submit" disabled={creating} className={styles.btnGreen}>
                {creating ? 'Creating…' : 'Create Suite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className={styles.errorCard}>
          <span>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)} aria-label="Dismiss error">×</button>
        </div>
      )}

      {loading && <div className={styles.loadingMsg}>Loading…</div>}

      {!loading && suites.length === 0 && !error && (
        <div className={styles.emptyCard}>No suites found.</div>
      )}

      <div className={styles.list}>
        {suites.map(suite => (
          <div key={suite.slug}>
            {editingSlug === suite.slug ? (
              <div className={styles.card}>
                <h3 className={styles.cardTitleSm}>Edit: {suite.slug}</h3>
                <form onSubmit={handleUpdate} className={styles.formGridSm}>
                  <div>
                    <label htmlFor={`${editFormId}-name`} className={styles.label}>Name</label>
                    <input id={`${editFormId}-name`} className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} required />
                  </div>
                  <div className={styles.fullCol}>
                    <label htmlFor={`${editFormId}-desc`} className={styles.label}>Description</label>
                    <input id={`${editFormId}-desc`} className={styles.input} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
                  </div>
                  <div className={styles.fullCol}>
                    <label htmlFor={`${editFormId}-cases`} className={styles.label}>Cases (comma-separated paths)</label>
                    <input id={`${editFormId}-cases`} className={styles.input} value={editCases} onChange={e => setEditCases(e.target.value)} />
                  </div>
                  <div className={styles.formActions}>
                    <button type="submit" disabled={saving} className={styles.btnSaveSm}>{saving ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setEditingSlug(null)} className={styles.btnCancelSm}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : (
              <>
                <div
                  className={expanded === suite.slug ? styles.suiteCardExpanded : styles.suiteCard}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded === suite.slug}
                  onClick={() => toggleExpand(suite.slug)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(suite.slug) } }}
                >
                  <div className={styles.suiteRow}>
                    <span className={styles.suiteName}>{suite.name}</span>
                    <span className={styles.suiteSlug}>{suite.slug}</span>
                    <span className={styles.caseCount}>{suite.cases.length} case{suite.cases.length !== 1 ? 's' : ''}</span>
                    {onRunSuite && (
                      <button className={styles.btnGreenSm} onClick={ev => { ev.stopPropagation(); onRunSuite(suite.slug) }}>Run</button>
                    )}
                    <button className={styles.btnOutlineSm} onClick={ev => { ev.stopPropagation(); startEdit(suite) }}>Edit</button>
                    <button className={styles.btnDangerSm} onClick={ev => { ev.stopPropagation(); handleDelete(suite.slug) }}>Delete</button>
                  </div>
                  {suite.description && <p className={styles.suiteDesc}>{suite.description}</p>}
                </div>

                {expanded === suite.slug && (
                  <div className={styles.expandedPanel}>
                    {expandedCasesLoading ? (
                      <p className={styles.expandedLoading}>Loading…</p>
                    ) : expandedCases.length > 0 ? (
                      <div className={styles.caseList}>
                        {expandedCases.map(c => (
                          <div key={c.path} className={styles.caseRow}>
                            <span className={styles.caseDot} data-priority={c.priority} />
                            <span className={styles.casePath}>{c.path}</span>
                            <span className={styles.caseTitle}>{c.title}</span>
                            {c.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                          </div>
                        ))}
                      </div>
                    ) : suite.cases.length > 0 ? (
                      <div className={styles.caseList}>
                        {suite.cases.map(p => <div key={p} className={styles.casePathOnly}>{p}</div>)}
                      </div>
                    ) : (
                      <p className={styles.noCase}>No cases in this suite.</p>
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
