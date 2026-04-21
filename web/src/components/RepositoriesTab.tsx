import { useState, useEffect, useCallback } from 'react'
import { client } from '../client'
import { errorMessage } from '../errorMessage'
import type { Repository } from '../gen/ameliso/v1/types_pb'
import styles from './RepositoriesTab.module.css'

interface Props {
  onRepoSelect: (localPath: string) => void
  activeRepoPath: string
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
      setError(errorMessage(e))
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true)
      setError(null)
      client.handleGitHubCallback({ installationId })
        .then(res => {
          setRepos(prev => {
            const ids = new Set(res.repositories.map(r => r.id))
            return [...prev.filter(r => !ids.has(r.id)), ...res.repositories]
          })
        })
        .catch(e => setError(errorMessage(e)))
        .finally(() => setLoading(false))
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  async function handleSync(id: string) {
    setSyncing(id)
    setError(null)
    try {
      const res = await client.syncRepository({ id })
      if (res.repository) {
        setRepos(prev => prev.map(r => r.id === id ? res.repository! : r))
      }
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSyncing(null)
    }
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this repository connection? The local clone will not be deleted.')) return
    setError(null)
    try {
      await client.removeRepository({ id })
      setRepos(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <div>
      <div className={styles.header}>
        <h2 className={styles.title}>Repositories</h2>
        {configured && installUrl ? (
          <a href={installUrl} className={styles.connectBtn}>
            + Connect GitHub Repo
          </a>
        ) : (
          <div className={styles.githubHint}>
            Set <code>GITHUB_APP_ID</code> + <code>GITHUB_APP_PRIVATE_KEY</code> to enable GitHub integration
          </div>
        )}
      </div>

      {error && (
        <div className={styles.errorCard}>
          <span>{error}</span>
          <button className={styles.errorDismiss} onClick={() => setError(null)}>×</button>
        </div>
      )}

      {loading && <div className={styles.loadingMsg}>Loading…</div>}

      {!loading && repos.length === 0 && (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No repositories connected</p>
          {configured
            ? <p className={styles.emptyDesc}>Click &quot;Connect GitHub Repo&quot; to install the GitHub App on your repositories.</p>
            : <p className={styles.emptyDesc}>Configure GitHub App environment variables to enable repository connection.</p>
          }
        </div>
      )}

      {repos.map(repo => {
        const isActive = activeRepoPath === repo.localPath
        return (
          <div key={repo.id} className={isActive ? styles.repoCardActive : styles.repoCard}>
            <div className={styles.repoRow}>
              <div className={styles.repoInfo}>
                <div className={styles.repoNameRow}>
                  <span className={styles.repoName}>{repo.fullName}</span>
                  {isActive && <span className={styles.badgeActive}>Active</span>}
                  <span className={repo.cloned ? styles.badgeCloned : styles.badgeNotCloned}>
                    {repo.cloned ? 'Cloned' : 'Not cloned'}
                  </span>
                </div>
                <div className={styles.repoUrl}>
                  <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className={styles.repoUrlLink}>
                    {repo.htmlUrl}
                  </a>
                </div>
                {repo.localPath && <div className={styles.repoPath}>{repo.localPath}</div>}
              </div>
              <div className={styles.repoActions}>
                {repo.cloned && !isActive && (
                  <button className={styles.btnPrimary} onClick={() => onRepoSelect(repo.localPath)}>Use</button>
                )}
                {repo.cloned && isActive && (
                  <button className={styles.btnOutline} onClick={() => onRepoSelect('')}>Deselect</button>
                )}
                <button className={styles.btnSecondary} disabled={syncing === repo.id} onClick={() => handleSync(repo.id)}>
                  {syncing === repo.id ? 'Syncing…' : repo.cloned ? 'Sync' : 'Clone'}
                </button>
                <button className={styles.btnDanger} onClick={() => handleRemove(repo.id)}>Remove</button>
              </div>
            </div>
            {repo.addedAt && <div className={styles.label}>Added {repo.addedAt}</div>}
          </div>
        )
      })}
    </div>
  )
}
