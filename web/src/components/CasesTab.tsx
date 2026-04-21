import { useState, useEffect, useCallback, useRef } from 'react'
import { client } from '../client'
import { errorMessage } from '../errorMessage'
import type { Case } from '../gen/ameliso/v1/types_pb'
import { Priority } from '../gen/ameliso/v1/types_pb'
import MarkdownBody from './MarkdownBody'
import styles from './CasesTab.module.css'

interface Props {
  repoPath: string
}

function stringToPriority(p: string): Priority {
  switch (p) {
    case 'high': return Priority.HIGH
    case 'medium': return Priority.MEDIUM
    case 'low': return Priority.LOW
    default: return Priority.MEDIUM
  }
}

function priorityColor(p: string): string {
  switch (p) {
    case 'high': return '#ef4444'
    case 'medium': return '#f97316'
    case 'low': return '#22c55e'
    default: return '#94a3b8'
  }
}

function priorityLabel(p: string): string {
  switch (p) {
    case 'high': return 'High'
    case 'medium': return 'Medium'
    case 'low': return 'Low'
    default: return '—'
  }
}

export default function CasesTab({ repoPath }: Props) {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<Priority>(Priority.UNSPECIFIED)
  const [tagFilter, setTagFilter] = useState('')
  const [sortBy, setSortBy] = useState<'path' | 'priority'>('priority')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [newPath, setNewPath] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM)
  const [newTags, setNewTags] = useState('')
  const [newBody, setNewBody] = useState('')
  const [creating, setCreating] = useState(false)

  const [expandedPath, setExpandedPath] = useState<string | null>(null)
  const [expandedBody, setExpandedBody] = useState<string>('')
  const [bodyLoading, setBodyLoading] = useState(false)

  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editPriority, setEditPriority] = useState<Priority>(Priority.MEDIUM)
  const [editTags, setEditTags] = useState('')
  const [editBody, setEditBody] = useState('')
  const [saving, setSaving] = useState(false)

  async function fetchBody(casePath: string): Promise<string> {
    const res = await client.getCase({ repoPath, casePath })
    return res.body
  }

  async function toggleExpand(casePath: string) {
    if (expandedPath === casePath) {
      setExpandedPath(null)
      setExpandedBody('')
      return
    }
    setExpandedPath(casePath)
    setExpandedBody('')
    setBodyLoading(true)
    try {
      setExpandedBody(await fetchBody(casePath))
    } catch (e) {
      setError(errorMessage(e))
      setExpandedPath(null)
    } finally {
      setBodyLoading(false)
    }
  }

  async function startEdit(c: Case) {
    setEditingPath(c.path)
    setEditTitle(c.title)
    setEditDesc(c.description)
    setEditPriority(stringToPriority(c.priority))
    setEditTags(c.tags.join(', '))
    setEditBody('')
    try {
      setEditBody(await fetchBody(c.path))
    } catch {
      // body stays empty; server will preserve existing body on update
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(search), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [search])

  const load = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    setError(null)
    try {
      const res = await client.listCases({
        repoPath,
        query: debouncedSearch,
        priority: priorityFilter,
        tags: tagFilter ? [tagFilter] : [],
      })
      setCases(res.cases)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [repoPath, debouncedSearch, priorityFilter, tagFilter])

  useEffect(() => { load() }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!repoPath || !newPath || !newTitle) return
    setCreating(true)
    try {
      await client.createCase({
        repoPath,
        casePath: newPath,
        title: newTitle,
        description: newDesc,
        priority: newPriority,
        tags: newTags ? newTags.split(',').map(t => t.trim()).filter(Boolean) : [],
        body: newBody,
      })
      setShowCreate(false)
      setNewPath('')
      setNewTitle('')
      setNewDesc('')
      setNewTags('')
      setNewBody('')
      load()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleDelete(casePath: string) {
    if (!confirm(`Delete case "${casePath}"?`)) return
    try {
      await client.deleteCase({ repoPath, casePath })
      if (expandedPath === casePath) setExpandedPath(null)
      load()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault()
    if (!editingPath) return
    setSaving(true)
    try {
      await client.updateCase({
        repoPath,
        casePath: editingPath,
        title: editTitle,
        description: editDesc,
        priority: editPriority,
        tags: editTags ? editTags.split(',').map(t => t.trim()).filter(Boolean) : [],
        body: editBody,
      })
      setEditingPath(null)
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

  const allTags = Array.from(new Set(cases.flatMap(c => c.tags)))

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Cases</h2>
        <button onClick={() => setShowCreate(!showCreate)} className={styles.btn}>
          {showCreate ? 'Cancel' : '+ New Case'}
        </button>
      </div>

      {showCreate && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Create Case</h3>
          <form onSubmit={handleCreate} className={styles.formGrid}>
            <div>
              <label className={styles.label}>Path (e.g. auth/login)</label>
              <input value={newPath} onChange={e => setNewPath(e.target.value)} required className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Title</label>
              <input value={newTitle} onChange={e => setNewTitle(e.target.value)} required className={styles.input} />
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>Description</label>
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} className={styles.input} />
            </div>
            <div>
              <label className={styles.label}>Priority</label>
              <select value={newPriority} onChange={e => setNewPriority(Number(e.target.value) as Priority)} className={styles.input}>
                <option value={Priority.LOW}>Low</option>
                <option value={Priority.MEDIUM}>Medium</option>
                <option value={Priority.HIGH}>High</option>
              </select>
            </div>
            <div>
              <label className={styles.label}>Tags (comma-separated)</label>
              <input value={newTags} onChange={e => setNewTags(e.target.value)} className={styles.input} />
            </div>
            <div className={styles.fullCol}>
              <label className={styles.label}>Steps / Body (Markdown)</label>
              <textarea
                value={newBody}
                onChange={e => setNewBody(e.target.value)}
                placeholder={'## Steps\n\n1. \n\n## Expected Result\n\n'}
                rows={6}
                className={styles.textarea}
              />
            </div>
            <div className={styles.fullCol}>
              <button type="submit" disabled={creating} className={styles.btnGreen}>
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.filterBar}>
        <input
          type="text"
          placeholder="Search cases…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.input}
          style={{ flex: 1, minWidth: '200px' }}
        />
        <select
          value={priorityFilter}
          onChange={e => setPriorityFilter(Number(e.target.value) as Priority)}
          className={styles.filterSelect}
        >
          <option value={Priority.UNSPECIFIED}>All priorities</option>
          <option value={Priority.LOW}>Low</option>
          <option value={Priority.MEDIUM}>Medium</option>
          <option value={Priority.HIGH}>High</option>
        </select>
        {allTags.length > 0 && (
          <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className={styles.filterSelect}>
            <option value="">All tags</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <select value={sortBy} onChange={e => setSortBy(e.target.value as 'path' | 'priority')} className={styles.filterSelect}>
          <option value="priority">Sort: Priority</option>
          <option value="path">Sort: Path</option>
        </select>
        {!loading && cases.length > 0 && (
          <span className={styles.caseCount}>{cases.length} case{cases.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {error && (
        <div className={styles.errorCard}>
          <span>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading && <div className={styles.loadingMsg}>Loading…</div>}

      {!loading && cases.length === 0 && !error && (
        <div className={styles.emptyCard}>No cases found.</div>
      )}

      <div className={styles.list}>
        {[...cases].sort((a, b) => {
          if (sortBy === 'priority') {
            const ord = { high: 0, medium: 1, low: 2 } as Record<string, number>
            const diff = (ord[a.priority] ?? 3) - (ord[b.priority] ?? 3)
            return diff !== 0 ? diff : a.path.localeCompare(b.path)
          }
          return a.path.localeCompare(b.path)
        }).map(c => (
          <div key={c.path}>
            <div className={expandedPath === c.path || editingPath === c.path ? styles.caseCardOpen : styles.caseCard}>
              {editingPath === c.path ? (
                <form onSubmit={handleUpdate} className={styles.formGridSm}>
                  <div>
                    <label className={styles.labelSm}>Title</label>
                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)} required className={styles.input} />
                  </div>
                  <div>
                    <label className={styles.labelSm}>Priority</label>
                    <select value={editPriority} onChange={e => setEditPriority(Number(e.target.value) as Priority)} className={styles.input}>
                      <option value={Priority.LOW}>Low</option>
                      <option value={Priority.MEDIUM}>Medium</option>
                      <option value={Priority.HIGH}>High</option>
                    </select>
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.labelSm}>Description</label>
                    <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className={styles.input} />
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.labelSm}>Tags (comma-separated)</label>
                    <input value={editTags} onChange={e => setEditTags(e.target.value)} className={styles.input} />
                  </div>
                  <div className={styles.fullCol}>
                    <label className={styles.labelSm}>Steps / Body (Markdown)</label>
                    <textarea value={editBody} onChange={e => setEditBody(e.target.value)} rows={8} className={styles.textarea} />
                  </div>
                  <div className={styles.formActions}>
                    <button type="submit" disabled={saving} className={styles.btnSaveSm}>{saving ? 'Saving…' : 'Save'}</button>
                    <button type="button" onClick={() => setEditingPath(null)} className={styles.btnCancelSm}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className={styles.caseRow} onClick={() => toggleExpand(c.path)}>
                  <div className={styles.priorityDot} style={{ background: priorityColor(c.priority) }} />
                  <div className={styles.caseInfo}>
                    <div className={styles.caseMeta}>
                      <span className={styles.casePath}>{c.path}</span>
                      <span className={styles.priorityBadge} style={{ color: priorityColor(c.priority) }}>{priorityLabel(c.priority)}</span>
                      {c.tags.map(t => <span key={t} className={styles.tag}>{t}</span>)}
                    </div>
                    <p className={styles.caseTitle}>{c.title}</p>
                    {c.description && <p className={styles.caseDesc}>{c.description}</p>}
                  </div>
                  <span className={styles.chevron}>{expandedPath === c.path ? '▲' : '▼'}</span>
                  <button onClick={e => { e.stopPropagation(); startEdit(c) }} className={styles.btnOutlineSm}>Edit</button>
                  <button onClick={e => { e.stopPropagation(); handleDelete(c.path) }} className={styles.btnDangerSm}>Delete</button>
                </div>
              )}
            </div>

            {expandedPath === c.path && editingPath !== c.path && (
              <div className={styles.expandedPanel}>
                {bodyLoading ? (
                  <p className={styles.expandedLoading}>Loading…</p>
                ) : expandedBody ? (
                  <MarkdownBody body={expandedBody} />
                ) : (
                  <p className={styles.noBody}>No body.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
