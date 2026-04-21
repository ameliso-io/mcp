import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import OverviewTab from './OverviewTab'
import { client } from '../client'
import { ResultStatus, RunStatus } from '../gen/ameliso/v1/types_pb'
import type { AffectedCase, CoverageEntry, RunMeta } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const makeCovEntry = (path: string, title: string, priority: string, status: ResultStatus): CoverageEntry => ({
  case: { path, title, description: '', tags: [], priority, createdAt: '', updatedAt: '' } as never,
  latestStatus: status,
  lastRunId: 'run-1',
  lastRunDate: '2026-01-01',
} as unknown as CoverageEntry)

const coverageEntries = [
  makeCovEntry('auth/login', 'User Login', 'high', ResultStatus.PASSED),
  makeCovEntry('auth/logout', 'User Logout', 'low', ResultStatus.FAILED),
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.getCoverageReport).mockResolvedValue({ entries: coverageEntries, runCount: 5 } as never)
  vi.mocked(client.listRuns).mockResolvedValue({ runs: [] } as never)
  vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [], reason: '' } as never)
})

describe('OverviewTab', () => {
  it('shows helpful empty state when no repo path', () => {
    render(<OverviewTab repoPath="" onRepoPathChange={() => {}} />)
    expect(screen.getByText(/Enter a repository path/i)).toBeInTheDocument()
  })

  it('loads and displays stat counts', async () => {
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => expect(screen.getByText('2')).toBeInTheDocument())
    expect(screen.getAllByText('1').length).toBeGreaterThan(0)
  })

  it('shows coverage entries with failed first', async () => {
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => screen.getByText('auth/login'))
    const entries = screen.getAllByText(/auth\//)
    expect(entries[0].textContent).toBe('auth/logout')
  })

  it('shows last run date on coverage entries', async () => {
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => expect(screen.getAllByText('2026-01-01').length).toBeGreaterThan(0))
  })

  it('shows active runs panel when in-progress runs exist', async () => {
    const activeRun = {
      id: 'run-abc', tester: 'alice', environment: 'staging',
      suite: 'smoke', date: '2026-01-01', status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never)
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument())
    expect(screen.getByText('run-abc')).toBeInTheDocument()
  })

  it('calls getAffectedCases when Check Diff submitted', async () => {
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => screen.getByText('Check Diff'))
    await userEvent.click(screen.getByText('Check Diff'))
    await waitFor(() => expect(client.getAffectedCases).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repo' })
    ))
  })

  it('shows "no cases affected" when diff returns empty list', async () => {
    vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [], reason: '' } as never)
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => screen.getByText('Check Diff'))
    await userEvent.click(screen.getByText('Check Diff'))
    await waitFor(() => expect(screen.getByText(/No cases affected/)).toBeInTheDocument())
  })

  it('shows affected cases list when diff returns cases', async () => {
    const affectedCase = {
      case: { path: 'auth/login', title: 'User Login', priority: 'high', tags: [], description: '', createdAt: '', updatedAt: '' },
      reason: 'modified',
    } as unknown as AffectedCase
    vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [affectedCase], reason: '' } as never)
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => screen.getByText('Check Diff'))
    await userEvent.click(screen.getByText('Check Diff'))
    await waitFor(() => expect(screen.getByText('modified')).toBeInTheDocument())
  })

  it('calls onGoToRuns when Go to Runs clicked', async () => {
    const activeRun = {
      id: 'run-xyz', tester: 'bob', environment: 'prod',
      suite: 'smoke', date: '2026-01-01', status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never)
    const onGoToRuns = vi.fn()
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} onGoToRuns={onGoToRuns} />)
    await waitFor(() => screen.getByText('Go to Runs'))
    await userEvent.click(screen.getByText('Go to Runs'))
    expect(onGoToRuns).toHaveBeenCalled()
  })

  it('shows affectedError when getAffectedCases throws', async () => {
    vi.mocked(client.getAffectedCases).mockRejectedValue(new Error('network error'))
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => screen.getByText('Check Diff'))
    await userEvent.click(screen.getByText('Check Diff'))
    await waitFor(() => expect(screen.getByText('network error')).toBeInTheDocument())
  })

  it('shows error banner when getCoverageReport fails', async () => {
    vi.mocked(client.getCoverageReport).mockRejectedValue(new Error('coverage failed'))
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => expect(screen.getByText('coverage failed')).toBeInTheDocument())
  })

  it('loads repo on form submit', async () => {
    const onRepoPathChange = vi.fn()
    render(<OverviewTab repoPath="" onRepoPathChange={onRepoPathChange} />)
    const input = screen.getByPlaceholderText('/path/to/repo')
    await userEvent.type(input, '/new/repo')
    await userEvent.click(screen.getByText('Load'))
    expect(onRepoPathChange).toHaveBeenCalledWith('/new/repo')
    await waitFor(() => expect(client.getCoverageReport).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/new/repo' })
    ))
  })

  it('sorts affected cases high before low', async () => {
    const highCase = {
      case: { path: 'auth/login', title: 'High Priority', priority: 'high', tags: [], description: '', createdAt: '', updatedAt: '' },
      reason: 'modified',
    } as unknown as AffectedCase
    const lowCase = {
      case: { path: 'auth/logout', title: 'Low Priority', priority: 'low', tags: [], description: '', createdAt: '', updatedAt: '' },
      reason: 'added',
    } as unknown as AffectedCase
    vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [lowCase, highCase], reason: '' } as never)
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => screen.getByText('Check Diff'))
    await userEvent.click(screen.getByText('Check Diff'))
    await waitFor(() => expect(screen.getByText('High Priority')).toBeInTheDocument())
    const titles = screen.getAllByText(/Priority/)
    expect(titles[0].textContent).toBe('High Priority')
    expect(titles[1].textContent).toBe('Low Priority')
  })
})
