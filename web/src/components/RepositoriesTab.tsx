import { useState, useEffect, useCallback } from 'react'
import { client } from '../client'
import type { Repository } from '../gen/ameliso/v1/types_pb'

interface Props {
  onRepoSelect: (localPath: string) => void
  activeRepoPath: string
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
  fontWeight: '600' as const,
  color: '#64748b',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  marginBottom: '6px',
}

const btn = (variant: 'primary' | 'secondary' | 'danger' | 'outline') => {
  const base = {
    padding: '6px 14px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500' as const,
  }
  switch (variant) {
    case 'primary':
      return { ...base, background: '#1e293b', color: 'white' }
    case 'secondary':
      return { ...base, background: '#f1f5f9', color: '#475569' }
    case 'danger':
      return { ...base, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }
    case 'outline':
      return { ...base, background: 'white', color: '#1e293b', border: '1px solid #e2e8f0' }
  }
}

export default function RepositoriesTab({ onRepoSelect, activeRepoPath }: Props) {
  const [repos, setRepos] = useState<Repository[]>([])
  const [installUrl, setInstallUrl] = useState<string>('')
  const [configured, setConfigured] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reposRes, urlRes] = await Promise.all([
        client.listRepositories({}),
        client.getGitHubInstallUrl({}),
      ])
      setRepos(reposRes.repositories)
      setInstallUrl(urlRes.url)
      setConfigured(urlRes.configured)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Handle GitHub callback: ?installation_id=... in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const installationId = params.get('installation_id')
    const setupAction = params.get('setup_action')
    if (installationId && (setupAction === 'install' || setupAction === 'update' || setupAction == null)) {
      // Clear the URL params so we don't reprocess on re-render
      window.history.replaceState({}, '', window.location.pathname)
      setLoading(true)
      setError(null)
      client.handleGitHubCallback({ installationId })
        .then(res => {
          setRepos(prev => {
            const ids = new Set(res.repositories.map(r => r.id))
            return [...prev.filter(r => !ids.has(r.id)), ...res.repositories]
          })
        })
        .catch(e => setError(String(e)))
        .finally(() => setLoading(false))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleSync(id: string) {
    setSyncing(id)
    setError(null)
    try {
      const res = await client.syncRepository({ id })
      if (res.repository) {
        setRepos(prev => prev.map(r => r.id === id ? res.repository! : r))
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setSyncing(null)
    }
  }

  async function handleRemove(id: string) {
    setError(null)
    try {
      await client.removeRepository({ id })
      setRepos(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '700' }}>Repositories</h2>
        {configured && installUrl ? (
          <a
            href={installUrl}
            style={{
              padding: '8px 16px',
              background: '#1e293b',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            + Connect GitHub Repo
          </a>
        ) : (
          <div style={{ fontSize: '13px', color: '#94a3b8' }}>
            Set <code>GITHUB_APP_ID</code> + <code>GITHUB_APP_PRIVATE_KEY</code> to enable GitHub integration
          </div>
        )}
      </div>

      {error && (
        <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: '#64748b', padding: '40px' }}>Loading…</div>
      )}

      {!loading && repos.length === 0 && (
        <div style={{ ...card, color: '#64748b', textAlign: 'center', padding: '48px' }}>
          <p style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600' }}>No repositories connected</p>
          {configured
            ? <p style={{ margin: 0, fontSize: '14px' }}>Click "Connect GitHub Repo" to install the GitHub App on your repositories.</p>
            : <p style={{ margin: 0, fontSize: '14px' }}>Configure GitHub App environment variables to enable repository connection.</p>
          }
        </div>
      )}

      {repos.map(repo => {
        const isActive = activeRepoPath === repo.localPath
        return (
          <div
            key={repo.id}
            style={{
              ...card,
              border: isActive ? '1px solid #3b82f6' : '1px solid #e2e8f0',
              background: isActive ? '#eff6ff' : 'white',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: '700', fontSize: '15px' }}>{repo.fullName}</span>
                  {isActive && (
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      background: '#3b82f6',
                      color: 'white',
                      padding: '1px 7px',
                      borderRadius: '999px',
                    }}>
                      Active
                    </span>
                  )}
                  <span style={{
                    fontSize: '11px',
                    fontWeight: '600',
                    background: repo.cloned ? '#dcfce7' : '#fef9c3',
                    color: repo.cloned ? '#166534' : '#854d0e',
                    padding: '1px 7px',
                    borderRadius: '999px',
                  }}>
                    {repo.cloned ? 'Cloned' : 'Not cloned'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#3b82f6' }}>
                    {repo.htmlUrl}
                  </a>
                </div>
                {repo.localPath && (
                  <div style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'monospace' }}>
                    {repo.localPath}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                {repo.cloned && !isActive && (
                  <button style={btn('primary')} onClick={() => onRepoSelect(repo.localPath)}>
                    Use
                  </button>
                )}
                {repo.cloned && isActive && (
                  <button style={btn('outline')} onClick={() => onRepoSelect('')}>
                    Deselect
                  </button>
                )}
                <button
                  style={btn('secondary')}
                  disabled={syncing === repo.id}
                  onClick={() => handleSync(repo.id)}
                >
                  {syncing === repo.id ? 'Syncing…' : repo.cloned ? 'Sync' : 'Clone'}
                </button>
                <button style={btn('danger')} onClick={() => handleRemove(repo.id)}>
                  Remove
                </button>
              </div>
            </div>
            {repo.addedAt && (
              <div style={{ ...label, marginTop: '12px', marginBottom: 0 }}>
                Added {repo.addedAt}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
