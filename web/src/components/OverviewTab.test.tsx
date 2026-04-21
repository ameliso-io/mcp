import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import OverviewTab from './OverviewTab'
import { client } from '../client'
import { ResultStatus } from '../gen/ameliso/v1/types_pb'
import type { CoverageEntry } from '../gen/ameliso/v1/types_pb'
import type { ActiveRunSummary } from '../gen/ameliso/v1/service_pb'

vi.mock('../client')

const makeCovEntry = (path: string, title: string, priority: string, status: ResultStatus): CoverageEntry => ({
  case: { path, title, description: '', tags: [], priority, createdAt: '', updatedAt: '' } as never,
  latestStatus: status,
  lastRunId: 'run-1',
  lastRunDate: '2026-01-01',
} as unknown as CoverageEntry)

const baseStatus = {
  totalCases: 3,
  highPriority: 1,
  mediumPriority: 1,
  lowPriority: 1,
  passedCount: 2,
  failedCount: 1,
  blockedCount: 0,
  skippedCount: 0,
  neverRunCount: 0,
  activeRuns: [],
  totalRuns: 5,
  totalSuites: 2,
  coverageEntries: [
    makeCovEntry('auth/login', 'User Login', 'high', ResultStatus.PASSED),
    makeCovEntry('auth/logout', 'User Logout', 'low', ResultStatus.FAILED),
  ],
}

beforeEach(() => {
  vi.mocked(client.getRepoStatus).mockResolvedValue(baseStatus as never)
  vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [], reason: '' } as never)
})

describe('OverviewTab', () => {
  it('shows helpful empty state when no repo path', () => {
    render(<OverviewTab repoPath="" onRepoPathChange={() => {}} />)
    expect(screen.getByText(/Enter a repository path/i)).toBeInTheDocument()
  })

  it('loads and displays stat counts', async () => {
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => expect(screen.getByText('3')).toBeInTheDocument())
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
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

  it('shows active runs panel when runs are active', async () => {
    const activeRun = {
      runId: 'run-abc', tester: 'alice', environment: 'staging',
      suite: 'smoke', date: '2026-01-01', pendingCount: 3, totalInScope: 5,
    } as unknown as ActiveRunSummary
    vi.mocked(client.getRepoStatus).mockResolvedValue({
      ...baseStatus,
      activeRuns: [activeRun],
    } as never)
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
