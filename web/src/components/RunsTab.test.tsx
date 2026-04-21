import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import RunsTab from './RunsTab'
import { client } from '../client'
import { RunStatus, ResultStatus } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const mockRun = {
  id: '2026-01-01-smoke',
  date: '2026-01-01',
  tester: 'alice',
  status: RunStatus.IN_PROGRESS,
  environment: 'staging',
  suite: 'smoke',
}

const mockCase = {
  path: 'auth/login',
  title: 'User Login',
  description: '',
  tags: [],
  priority: 'high',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

beforeEach(() => {
  vi.mocked(client.listRuns).mockResolvedValue({ runs: [] })
  vi.mocked(client.createRun).mockResolvedValue({ run: mockRun, dirPath: 'runs/2026-01-01-smoke' })
  vi.mocked(client.getPendingCases).mockResolvedValue({ cases: [mockCase], totalInScope: 1 })
  vi.mocked(client.listCases).mockResolvedValue({ cases: [] })
  vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: '## Steps\n\n1. Login' })
  vi.mocked(client.recordResult).mockResolvedValue({ result: undefined })
  vi.mocked(client.finalizeRun).mockResolvedValue({ run: { ...mockRun, status: RunStatus.COMPLETED } })
})

describe('RunsTab', () => {
  it('renders empty state when no repo path', () => {
    render(<RunsTab repoPath="" />)
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument()
  })

  it('shows empty runs list', async () => {
    render(<RunsTab repoPath="/repo" />)
    await waitFor(() => expect(screen.getByText('No runs found.')).toBeInTheDocument())
  })

  it('shows runs from list', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] })
    render(<RunsTab repoPath="/repo" />)
    await waitFor(() => expect(screen.getByText('2026-01-01-smoke')).toBeInTheDocument())
  })

  it('opens create form when New Run clicked', async () => {
    render(<RunsTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('+ New Run'))
    expect(screen.getByRole('heading', { name: 'Create Run' })).toBeInTheDocument()
  })

  it('pre-fills suite when initialSuite provided', () => {
    render(<RunsTab repoPath="/repo" initialSuite="smoke" onInitialSuiteConsumed={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Create Run' })).toBeInTheDocument()
    const suiteInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'smoke')
    expect(suiteInput).toBeDefined()
  })

  it('creates run and auto-expands on submit', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] })
    render(<RunsTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('+ New Run'))
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'smoke')
    await userEvent.click(screen.getByRole('button', { name: 'Create Run' }))
    await waitFor(() => expect(client.createRun).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'smoke' })
    ))
    await waitFor(() => expect(client.getPendingCases).toHaveBeenCalled())
  })

  it('shows status filter buttons', async () => {
    render(<RunsTab repoPath="/repo" />)
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('filters runs by status', async () => {
    render(<RunsTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('In Progress'))
    await waitFor(() => expect(client.listRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: RunStatus.IN_PROGRESS })
    ))
  })

  it('shows result badges for completed run', async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED }
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] })
    vi.mocked(client.getRun).mockResolvedValue({
      run: {
        meta: completedRun,
        results: [{ casePath: 'auth/login', status: ResultStatus.PASSED, notes: '' }],
      },
    })
    render(<RunsTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.getByText('1 Passed')).toBeInTheDocument())
  })
})
