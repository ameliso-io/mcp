import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import CasesTab from './CasesTab'
import { client } from '../client'
import type { Case } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const mockCase = {
  path: 'auth/login',
  title: 'User Login',
  description: 'Verify login flow',
  tags: ['auth', 'smoke'],
  priority: 'high',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
} as unknown as Case

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never)
  vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: '## Steps\n\n1. Go to /login' } as never)
  vi.mocked(client.updateCase).mockResolvedValue({ case: mockCase } as never)
})

describe('CasesTab', () => {
  it('renders empty state when no repo path', () => {
    render(<CasesTab repoId="" />)
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument()
  })

  it('shows cases after load', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    expect(screen.getByText('auth/login')).toBeInTheDocument()
  })

  it('shows case count in filter bar', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('1 case')).toBeInTheDocument())
  })

  it('expands case body on click', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => expect(screen.getByText(/Go to \/login/)).toBeInTheDocument())
  })

  it('opens create form when New Case clicked', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await userEvent.click(screen.getByText('+ New Case'))
    expect(screen.getByText('Create Case')).toBeInTheDocument()
  })

  it('calls createCase on form submit', async () => {
    vi.mocked(client.createCase).mockResolvedValue({ case: mockCase, filePath: 'cases/auth/login.md' } as never)
    render(<CasesTab repoId="owner/repo" />)
    await userEvent.click(screen.getByText('+ New Case'))
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'auth/new')
    await userEvent.type(inputs[1], 'New Case Title')
    await userEvent.click(screen.getByText('Create'))
    await waitFor(() => expect(client.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ casePath: 'auth/new', title: 'New Case Title' })
    ))
  })

  it('calls deleteCase when delete confirmed', async () => {
    vi.mocked(client.deleteCase).mockResolvedValue({ filePath: 'cases/auth/login.md' } as never)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(client.deleteCase).toHaveBeenCalledWith(
      expect.objectContaining({ casePath: 'auth/login' })
    ))
  })

  it('does not call deleteCase when confirm cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Delete'))
    await userEvent.click(screen.getByText('Delete'))
    expect(client.deleteCase).not.toHaveBeenCalled()
  })

  it('opens edit form with pre-filled values when Edit clicked', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    await waitFor(() => {
      const titleInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'User Login')
      expect(titleInput).toBeDefined()
    })
  })

  it('calls updateCase when edit form submitted', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    await waitFor(() => screen.getByText('Save'))
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(client.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: 'owner/repo', casePath: 'auth/login', title: 'User Login' })
    ))
  })

  it('collapses expanded case when clicked again', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => expect(screen.getByText(/Go to \/login/)).toBeInTheDocument())
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => expect(screen.queryByText(/Go to \/login/)).not.toBeInTheDocument())
  })

  it('shows error banner when listCases rejects', async () => {
    vi.mocked(client.listCases).mockRejectedValue(new Error('server down'))
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('server down')).toBeInTheDocument())
  })

  it('changes sort order when Sort: Path selected', async () => {
    const secondCase = { ...mockCase, path: 'auth/logout', title: 'User Logout', priority: 'low' } as unknown as Case
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase, secondCase] } as never)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    const sortSelect = screen.getByDisplayValue('Sort: Priority')
    await userEvent.selectOptions(sortSelect, 'path')
    expect(screen.getByDisplayValue('Sort: Path')).toBeInTheDocument()
    await waitFor(() => expect(client.listCases).toHaveBeenCalled())
  })

  it('filters by priority when priority select changed', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    const prioritySelect = screen.getByDisplayValue('All priorities')
    await userEvent.selectOptions(prioritySelect, 'High')
    await waitFor(() => expect(client.listCases).toHaveBeenCalledWith(
      expect.objectContaining({ priority: expect.any(Number) })
    ))
  })

  it('shows error when deleteCase fails', async () => {
    vi.mocked(client.deleteCase).mockRejectedValue(new Error('delete failed'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Delete'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(screen.getByText('delete failed')).toBeInTheDocument())
  })

  it('shows error when updateCase fails', async () => {
    vi.mocked(client.updateCase).mockRejectedValue(new Error('update failed'))
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    await waitFor(() => screen.getByText('Save'))
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(screen.getByText('update failed')).toBeInTheDocument())
  })

  it('shows no-body placeholder when body is empty', async () => {
    vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: '' } as never)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => expect(screen.getByText('No body.')).toBeInTheDocument())
  })

  it('shows error when getCase fails on expand', async () => {
    vi.mocked(client.getCase).mockRejectedValue(new Error('case fetch error'))
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => expect(screen.getByText('case fetch error')).toBeInTheDocument())
  })

  it('shows error when createCase fails', async () => {
    vi.mocked(client.createCase).mockRejectedValue(new Error('create case error'))
    render(<CasesTab repoId="owner/repo" />)
    await userEvent.click(screen.getByText('+ New Case'))
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'auth/new')
    await userEvent.type(inputs[1], 'New Title')
    await userEvent.click(screen.getByText('Create'))
    await waitFor(() => expect(screen.getByText('create case error')).toBeInTheDocument())
  })

  it('handles fetchBody failure silently in edit form', async () => {
    vi.mocked(client.getCase).mockRejectedValue(new Error('body unavailable'))
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    await waitFor(() => {
      const titleInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'User Login')
      expect(titleInput).toBeDefined()
    })
  })

  it('calls updateCase with parsed tags when tags field is filled', async () => {
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    await waitFor(() => screen.getByText('Save'))
    const tagsInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'auth, smoke')
    if (tagsInput) {
      await userEvent.clear(tagsInput)
      await userEvent.type(tagsInput, 'auth, smoke, regression')
    }
    await userEvent.click(screen.getByText('Save'))
    await waitFor(() => expect(client.updateCase).toHaveBeenCalledWith(
      expect.objectContaining({ tags: expect.arrayContaining(['auth', 'smoke', 'regression']) })
    ))
  })

  it('sorts by priority with path tiebreaker for equal-priority cases', async () => {
    const case2 = { ...mockCase, path: 'auth/logout', title: 'User Logout', priority: 'high' } as unknown as Case
    vi.mocked(client.listCases).mockResolvedValue({ cases: [case2, mockCase] } as never)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    const paths = screen.getAllByText(/auth\//)
    expect(paths[0].textContent).toBe('auth/login')
    expect(paths[1].textContent).toBe('auth/logout')
  })

  it('sorts unknown priority cases to end', async () => {
    const unknownCase = { ...mockCase, path: 'other/thing', title: 'Unknown', priority: '' } as unknown as Case
    vi.mocked(client.listCases).mockResolvedValue({ cases: [unknownCase, mockCase] } as never)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    const paths = screen.getAllByText(/\//)
    const loginIdx = paths.findIndex(el => el.textContent === 'auth/login')
    const otherIdx = paths.findIndex(el => el.textContent === 'other/thing')
    expect(loginIdx).toBeLessThan(otherIdx)
  })

  it('sorts known before unknown priority from reversed order', async () => {
    const unknownCase = { ...mockCase, path: 'other/thing', title: 'Unknown', priority: '' } as unknown as Case
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase, unknownCase] } as never)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    const paths = screen.getAllByText(/\//)
    const loginIdx = paths.findIndex(el => el.textContent === 'auth/login')
    const otherIdx = paths.findIndex(el => el.textContent === 'other/thing')
    expect(loginIdx).toBeLessThan(otherIdx)
  })

  it('collapses expanded case when it is deleted', async () => {
    vi.mocked(client.deleteCase).mockResolvedValue({ filePath: 'cases/auth/login.md' } as never)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CasesTab repoId="owner/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => screen.getByText(/Go to \/login/))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(client.deleteCase).toHaveBeenCalledWith(
      expect.objectContaining({ casePath: 'auth/login' })
    ))
  })
})
