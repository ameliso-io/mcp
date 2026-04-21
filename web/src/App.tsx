import { useState } from 'react'
import OverviewTab from './components/OverviewTab'
import CasesTab from './components/CasesTab'
import RunsTab from './components/RunsTab'
import SuitesTab from './components/SuitesTab'
import RepositoriesTab from './components/RepositoriesTab'

type Tab = 'repositories' | 'overview' | 'cases' | 'suites' | 'runs'

const styles = {
  app: {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    color: '#1a1a1a',
  },
  header: {
    backgroundColor: '#1e293b',
    color: 'white',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
    borderBottom: '1px solid #334155',
  },
  logo: {
    fontSize: '20px',
    fontWeight: '700',
    letterSpacing: '-0.5px',
    padding: '16px 0',
    color: '#e2e8f0',
  },
  nav: {
    display: 'flex',
    gap: '4px',
  },
  navBtn: (active: boolean) => ({
    background: active ? '#334155' : 'transparent',
    color: active ? 'white' : '#94a3b8',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  }),
  content: {
    padding: '24px',
    maxWidth: '1200px',
    margin: '0 auto',
  },
}

const REPO_PATH_KEY = 'ameliso:repoPath'

const TAB_LABELS: Record<Tab, string> = {
  repositories: 'Repositories',
  overview: 'Overview',
  cases: 'Cases',
  suites: 'Suites',
  runs: 'Runs',
}

// Start on repositories tab if GitHub is redirecting back with installation_id
const initialTab = (): Tab => {
  const params = new URLSearchParams(window.location.search)
  return params.has('installation_id') ? 'repositories' : 'overview'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [repoPath, setRepoPath] = useState(() => localStorage.getItem(REPO_PATH_KEY) ?? '')
  const [runSuiteSlug, setRunSuiteSlug] = useState<string | undefined>(undefined)

  function handleRepoPathChange(p: string) {
    setRepoPath(p)
    localStorage.setItem(REPO_PATH_KEY, p)
  }

  function handleRepoSelect(path: string) {
    handleRepoPathChange(path)
    setTab('overview')
  }

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <span style={styles.logo}>Ameliso</span>
        <nav style={styles.nav}>
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              style={styles.navBtn(tab === t)}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
      </header>
      <main style={styles.content}>
        {tab === 'repositories' && (
          <RepositoriesTab
            activeRepoPath={repoPath}
            onRepoSelect={handleRepoSelect}
          />
        )}
        {tab === 'overview' && (
          <OverviewTab
            repoPath={repoPath}
            onRepoPathChange={handleRepoPathChange}
            onGoToRuns={() => setTab('runs')}
          />
        )}
        {tab === 'cases' && <CasesTab repoPath={repoPath} />}
        {tab === 'suites' && (
          <SuitesTab
            repoPath={repoPath}
            onRunSuite={slug => { setRunSuiteSlug(slug); setTab('runs') }}
          />
        )}
        {tab === 'runs' && (
          <RunsTab
            repoPath={repoPath}
            initialSuite={runSuiteSlug}
            onInitialSuiteConsumed={() => setRunSuiteSlug(undefined)}
          />
        )}
      </main>
    </div>
  )
}
