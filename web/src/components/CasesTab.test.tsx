import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import CasesTab from './CasesTab'
import { client } from '../client'

vi.mock('../client')

const mockCase = {
  path: 'auth/login',
  title: 'User Login',
  description: 'Verify login flow',
  tags: ['auth', 'smoke'],
  priority: 'high',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

beforeEach(() => {
  vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] })
  vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: '## Steps\n\n1. Go to /login' })
})

describe('CasesTab', () => {
  it('renders empty state when no repo path', () => {
    render(<CasesTab repoPath="" />)
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument()
  })

  it('shows cases after load', async () => {
    render(<CasesTab repoPath="/repo" />)
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    expect(screen.getByText('auth/login')).toBeInTheDocument()
  })

  it('shows case count in filter bar', async () => {
    render(<CasesTab repoPath="/repo" />)
    await waitFor(() => expect(screen.getByText('1 case')).toBeInTheDocument())
  })

  it('expands case body on click', async () => {
    render(<CasesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('User Login'))
    await waitFor(() => expect(screen.getByText(/Go to \/login/)).toBeInTheDocument())
  })

  it('opens create form when New Case clicked', async () => {
    render(<CasesTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('+ New Case'))
    expect(screen.getByText('Create Case')).toBeInTheDocument()
  })

  it('calls createCase on form submit', async () => {
    vi.mocked(client.createCase).mockResolvedValue({ case: mockCase, filePath: 'cases/auth/login.md' })
    render(<CasesTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('+ New Case'))
    // inputs are rendered in order: Path, Title, Description, Tags, body textarea
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'auth/new')
    await userEvent.type(inputs[1], 'New Case Title')
    await userEvent.click(screen.getByText('Create'))
    await waitFor(() => expect(client.createCase).toHaveBeenCalledWith(
      expect.objectContaining({ casePath: 'auth/new', title: 'New Case Title' })
    ))
  })

  it('calls deleteCase when delete confirmed', async () => {
    vi.mocked(client.deleteCase).mockResolvedValue({ filePath: 'cases/auth/login.md' })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<CasesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('User Login'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(client.deleteCase).toHaveBeenCalledWith(
      expect.objectContaining({ casePath: 'auth/login' })
    ))
  })
})
