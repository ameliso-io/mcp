import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import RunsTab from './RunsTab'
import { client } from '../client'
import { RunStatus, ResultStatus } from '../gen/ameliso/v1/types_pb'
import type { RunMeta, Case, CaseResult } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const mockRun = {
  id: '2026-01-01-smoke',
  date: '2026-01-01',
  tester: 'alice',
  status: RunStatus.IN_PROGRESS,
  environment: 'staging',
  suite: 'smoke',
} as unknown as RunMeta

const mockCase = {
  path: 'auth/login',
  title: 'User Login',
  description: '',
  tags: [],
  priority: 'high',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as unknown as Case

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.listRuns).mockResolvedValue({ runs: [] } as never)
  vi.mocked(client.createRun).mockResolvedValue({ run: mockRun, dirPath: 'runs/2026-01-01-smoke' } as never)
  vi.mocked(client.getPendingCases).mockResolvedValue({ cases: [mockCase], totalInScope: 1 } as never)
  vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never)
  vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: '## Steps\n\n1. Login' } as never)
  vi.mocked(client.recordResult).mockResolvedValue({ result: undefined } as never)
  vi.mocked(client.finalizeRun).mockResolvedValue({ run: { ...mockRun, status: RunStatus.COMPLETED } } as never)
  vi.mocked(client.deleteRun).mockResolvedValue({ dirPath: 'runs/2026-01-01-smoke' } as never)
})

describe('RunsTab', () => {
  it('renders empty state when no repo path', () => {
    render(<RunsTab repoId="" />)
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument()
  })

  it('shows empty runs list', async () => {
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('No runs found.')).toBeInTheDocument())
  })

  it('shows runs from list', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('2026-01-01-smoke')).toBeInTheDocument())
  })

  it('opens create form when New Run clicked', async () => {
    render(<RunsTab repoId="owner/repo" />)
    await userEvent.click(screen.getByText('+ New Run'))
    expect(screen.getByRole('heading', { name: 'Create Run' })).toBeInTheDocument()
  })

  it('pre-fills suite when initialSuite provided', async () => {
    render(<RunsTab repoId="owner/repo" initialSuite="smoke" onInitialSuiteConsumed={() => {}} />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Create Run' })).toBeInTheDocument())
    const suiteInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'smoke')
    expect(suiteInput).toBeDefined()
  })

  it('creates run and auto-expands on submit', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
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
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('No runs found.'))
    expect(screen.getByText('All')).toBeInTheDocument()
    expect(screen.getByText('In Progress')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
  })

  it('filters runs by status', async () => {
    render(<RunsTab repoId="owner/repo" />)
    await userEvent.click(screen.getByText('In Progress'))
    await waitFor(() => expect(client.listRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: RunStatus.IN_PROGRESS })
    ))
  })

  it('expands in-progress run and shows pending cases', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(client.getPendingCases).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke' })
    ))
    await waitFor(() => expect(screen.getByText('auth/login')).toBeInTheDocument())
  })

  it('opens record form when Record clicked and shows case body', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Record'))
    await userEvent.click(screen.getByText('Record'))
    await waitFor(() => expect(client.getCase).toHaveBeenCalledWith(
      expect.objectContaining({ casePath: 'auth/login' })
    ))
    await waitFor(() => expect(screen.getByText('Save Result')).toBeInTheDocument())
  })

  it('calls recordResult when Save Result submitted', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Record'))
    await userEvent.click(screen.getByText('Record'))
    await waitFor(() => screen.getByText('Save Result'))
    await userEvent.click(screen.getByText('Save Result'))
    await waitFor(() => expect(client.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke', casePath: 'auth/login', status: ResultStatus.PASSED })
    ))
  })

  it('calls finalizeRun when Complete Run clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Complete Run'))
    await userEvent.click(screen.getByText('Complete Run'))
    await waitFor(() => expect(client.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke', status: RunStatus.COMPLETED })
    ))
  })

  it('calls finalizeRun with ABORTED when Abort Run clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Abort Run'))
    await userEvent.click(screen.getByText('Abort Run'))
    await waitFor(() => expect(client.finalizeRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke', status: RunStatus.ABORTED })
    ))
  })

  it('calls recordResult for each pending case when All Passed clicked', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText(/All Passed/))
    await userEvent.click(screen.getByText(/All Passed/))
    await waitFor(() => expect(client.recordResult).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke', casePath: 'auth/login', status: ResultStatus.PASSED })
    ))
  })

  it('calls deleteRun when Delete confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Delete'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(client.deleteRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke' })
    ))
  })

  it('shows result badges for completed run', async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta
    const mockResult = { casePath: 'auth/login', status: ResultStatus.PASSED, notes: '' } as unknown as CaseResult
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never)
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
    } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.getByText('1 Passed')).toBeInTheDocument())
  })

  it('shows case title and notes in completed run results', async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta
    const mockResult = { casePath: 'auth/login', status: ResultStatus.PASSED, notes: 'looks good' } as unknown as CaseResult
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never)
    vi.mocked(client.getRun).mockResolvedValue({ run: { meta: completedRun, results: [mockResult] } } as never)
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    expect(screen.getByText('looks good')).toBeInTheDocument()
  })

  it('filters results by status and shows Show all button', async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta
    const mockResult = { casePath: 'auth/login', status: ResultStatus.PASSED, notes: '' } as unknown as CaseResult
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never)
    vi.mocked(client.getRun).mockResolvedValue({ run: { meta: completedRun, results: [mockResult] } } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('1 Passed'))
    await userEvent.click(screen.getByText('1 Passed'))
    await waitFor(() => expect(screen.getByText('Show all')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Show all'))
    await waitFor(() => expect(screen.queryByText('Show all')).not.toBeInTheDocument())
  })

  it('shows error banner when listRuns fails', async () => {
    vi.mocked(client.listRuns).mockRejectedValue(new Error('fetch error'))
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('fetch error')).toBeInTheDocument())
  })

  it('shows "No results recorded" for completed run with empty results', async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never)
    vi.mocked(client.getRun).mockResolvedValue({ run: { meta: completedRun, results: [] } } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.getByText('No results recorded.')).toBeInTheDocument())
  })

  it('shows error when deleteRun fails', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    vi.mocked(client.deleteRun).mockRejectedValue(new Error('delete error'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Delete'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(screen.getByText('delete error')).toBeInTheDocument())
  })

  it('shows "all cases recorded" message when pending is empty', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    vi.mocked(client.getPendingCases).mockResolvedValue({ cases: [], totalInScope: 1 } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.getByText('All cases have results recorded.')).toBeInTheDocument())
  })

  it('shows error when createRun fails', async () => {
    vi.mocked(client.createRun).mockRejectedValue(new Error('create error'))
    render(<RunsTab repoId="owner/repo" />)
    await userEvent.click(screen.getByText('+ New Run'))
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'smoke')
    await userEvent.click(screen.getByRole('button', { name: 'Create Run' }))
    await waitFor(() => expect(screen.getByText('create error')).toBeInTheDocument())
  })

  it('shows error when handleBulkPass fails', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    vi.mocked(client.recordResult).mockRejectedValue(new Error('bulk error'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText(/All Passed/))
    await userEvent.click(screen.getByText(/All Passed/))
    await waitFor(() => expect(screen.getByText('bulk error')).toBeInTheDocument())
  })

  it('collapses selected run when it is deleted', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Delete'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(client.deleteRun).toHaveBeenCalledWith(
      expect.objectContaining({ runId: '2026-01-01-smoke' })
    ))
  })

  it('closes record form when Cancel clicked', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Record'))
    await userEvent.click(screen.getByText('Record'))
    await waitFor(() => screen.getByText('Save Result'))
    await userEvent.click(screen.getByText('Cancel'))
    await waitFor(() => expect(screen.queryByText('Save Result')).not.toBeInTheDocument())
  })

  it('collapses expanded run when clicked again', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Record'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.queryByText('Record')).not.toBeInTheDocument())
  })

  it('shows error when recordResult fails in record form', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    vi.mocked(client.recordResult).mockRejectedValue(new Error('record error'))
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => screen.getByText('Record'))
    await userEvent.click(screen.getByText('Record'))
    await waitFor(() => screen.getByText('Save Result'))
    await userEvent.click(screen.getByText('Save Result'))
    await waitFor(() => expect(screen.getByText('record error')).toBeInTheDocument())
  })

  it('shows error when selectRun fails', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never)
    vi.mocked(client.getPendingCases).mockRejectedValue(new Error('select error'))
    render(<RunsTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('2026-01-01-smoke'))
    await userEvent.click(screen.getByText('2026-01-01-smoke'))
    await waitFor(() => expect(screen.getByText('select error')).toBeInTheDocument())
  })

})
