import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import App from './App'

vi.mock('./components/OverviewTab', () => ({
  default: ({ repoPath, onRepoPathChange, onGoToRuns }: { repoPath: string; onRepoPathChange: (p: string) => void; onGoToRuns?: () => void }) => (
    <div>
      <span data-testid="overview-repo">{repoPath}</span>
      <button onClick={() => onRepoPathChange('/new-path')}>SetPath</button>
      {onGoToRuns && <button onClick={onGoToRuns}>GoToRuns</button>}
    </div>
  ),
}))

vi.mock('./components/CasesTab', () => ({
  default: ({ repoPath }: { repoPath: string }) => <div data-testid="cases-tab">{repoPath}</div>,
}))

vi.mock('./components/SuitesTab', () => ({
  default: ({ repoPath, onRunSuite }: { repoPath: string; onRunSuite?: (s: string) => void }) => (
    <div>
      <span data-testid="suites-repo">{repoPath}</span>
      {onRunSuite && <button onClick={() => onRunSuite('smoke')}>RunSuite</button>}
    </div>
  ),
}))

vi.mock('./components/RunsTab', () => ({
  default: ({ repoPath, initialSuite, onInitialSuiteConsumed }: { repoPath: string; initialSuite?: string; onInitialSuiteConsumed?: () => void }) => (
    <div>
      <span data-testid="runs-repo">{repoPath}</span>
      {initialSuite && <span data-testid="initial-suite">{initialSuite}</span>}
      {onInitialSuiteConsumed && <button onClick={onInitialSuiteConsumed}>ConsumedSuite</button>}
    </div>
  ),
}))

vi.mock('./components/RepositoriesTab', () => ({
  default: ({ activeRepoPath, onRepoSelect }: { activeRepoPath: string; onRepoSelect: (p: string) => void }) => (
    <div>
      <span data-testid="repos-active">{activeRepoPath}</span>
      <button onClick={() => onRepoSelect('/selected-repo')}>SelectRepo</button>
    </div>
  ),
}))

beforeEach(() => {
  localStorage.clear()
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  localStorage.clear()
})

describe('App', () => {
  it('renders nav buttons for all tabs', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cases' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Suites' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Runs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Repositories' })).toBeInTheDocument()
  })

  it('starts on Overview tab by default', () => {
    render(<App />)
    expect(screen.getByTestId('overview-repo')).toBeInTheDocument()
  })

  it('starts on Repositories tab when URL has installation_id', () => {
    window.history.replaceState({}, '', '/?installation_id=123&setup_action=install')
    render(<App />)
    expect(screen.getByTestId('repos-active')).toBeInTheDocument()
  })

  it('navigates between tabs via nav buttons', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Cases' }))
    expect(screen.getByTestId('cases-tab')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Runs' }))
    expect(screen.getByTestId('runs-repo')).toBeInTheDocument()
  })

  it('persists repoPath to localStorage on change', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'SetPath' }))
    expect(localStorage.getItem('ameliso:repoPath')).toBe('/new-path')
  })

  it('loads repoPath from localStorage on mount', () => {
    localStorage.setItem('ameliso:repoPath', '/saved-repo')
    render(<App />)
    expect(screen.getByTestId('overview-repo').textContent).toBe('/saved-repo')
  })

  it('passes repoPath down to active tab', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'SetPath' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cases' }))
    expect(screen.getByTestId('cases-tab').textContent).toBe('/new-path')
  })

  it('onGoToRuns switches to Runs tab', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'GoToRuns' }))
    expect(screen.getByTestId('runs-repo')).toBeInTheDocument()
  })

  it('onRunSuite navigates to Runs tab with initialSuite', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Suites' }))
    await userEvent.click(screen.getByRole('button', { name: 'RunSuite' }))
    expect(screen.getByTestId('runs-repo')).toBeInTheDocument()
    expect(screen.getByTestId('initial-suite').textContent).toBe('smoke')
  })

  it('onInitialSuiteConsumed clears initialSuite', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Suites' }))
    await userEvent.click(screen.getByRole('button', { name: 'RunSuite' }))
    expect(screen.getByTestId('initial-suite')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'ConsumedSuite' }))
    expect(screen.queryByTestId('initial-suite')).not.toBeInTheDocument()
  })

  it('onRepoSelect sets repoPath and navigates to Overview', async () => {
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: 'Repositories' }))
    await userEvent.click(screen.getByRole('button', { name: 'SelectRepo' }))
    expect(screen.getByTestId('overview-repo').textContent).toBe('/selected-repo')
    expect(localStorage.getItem('ameliso:repoPath')).toBe('/selected-repo')
  })
})
