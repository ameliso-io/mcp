import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import OverviewTab from './OverviewTab'
import { client } from '../client'
import { ResultStatus, RunStatus } from '../gen/ameliso/v1/types_pb'
import type { CoverageEntry, RunMeta } from '../gen/ameliso/v1/types_pb'

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
})
