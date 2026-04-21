import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import OverviewTab from './OverviewTab'
import { client } from '../client'
import { ResultStatus } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

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
    { case: { path: 'auth/login', title: 'User Login', description: '', tags: [], priority: 'high', createdAt: '', updatedAt: '' }, latestStatus: ResultStatus.PASSED, lastRunId: 'run-1', lastRunDate: '2026-01-01' },
    { case: { path: 'auth/logout', title: 'User Logout', description: '', tags: [], priority: 'low', createdAt: '', updatedAt: '' }, latestStatus: ResultStatus.FAILED, lastRunId: 'run-1', lastRunDate: '2026-01-01' },
  ],
}

beforeEach(() => {
  vi.mocked(client.getRepoStatus).mockResolvedValue(baseStatus)
  vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [], reason: '' })
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
    // Failed (auth/logout) should appear before passed (auth/login) due to sort
    expect(entries[0].textContent).toBe('auth/logout')
  })

  it('shows last run date on coverage entries', async () => {
    render(<OverviewTab repoPath="/repo" onRepoPathChange={() => {}} />)
    await waitFor(() => expect(screen.getAllByText('2026-01-01').length).toBeGreaterThan(0))
  })

  it('shows active runs panel when runs are active', async () => {
    vi.mocked(client.getRepoStatus).mockResolvedValue({
      ...baseStatus,
      activeRuns: [{ runId: 'run-abc', tester: 'alice', environment: 'staging', suite: 'smoke', date: '2026-01-01', pendingCount: 3, totalInScope: 5 }],
    })
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
