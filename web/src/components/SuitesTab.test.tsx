import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import SuitesTab from './SuitesTab'
import { client } from '../client'
import type { Suite } from '../gen/ameliso/v1/types_pb'
import type { Case } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const mockSuite = {
  slug: 'smoke',
  name: 'Smoke Tests',
  description: 'Critical path checks',
  cases: ['auth/login', 'auth/logout'],
} as unknown as Suite

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.listSuites).mockResolvedValue({ suites: [mockSuite] } as never)
  vi.mocked(client.listCases).mockResolvedValue({ cases: [
    { path: 'auth/login', title: 'User Login', description: '', tags: ['auth'], priority: 'high', createdAt: '', updatedAt: '' },
    { path: 'auth/logout', title: 'User Logout', description: '', tags: [], priority: 'low', createdAt: '', updatedAt: '' },
  ] as unknown as Case[] } as never)
  vi.mocked(client.createSuite).mockResolvedValue({ suite: mockSuite, filePath: 'suites/smoke.yaml' } as never)
  vi.mocked(client.updateSuite).mockResolvedValue({ suite: mockSuite } as never)
  vi.mocked(client.deleteSuite).mockResolvedValue({ filePath: 'suites/smoke.yaml' } as never)
})

describe('SuitesTab', () => {
  it('renders empty state when no repo path', () => {
    render(<SuitesTab repoPath="" />)
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument()
  })

  it('shows suites after load', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => expect(screen.getByText('Smoke Tests')).toBeInTheDocument())
    expect(screen.getByText('smoke')).toBeInTheDocument()
    expect(screen.getByText('2 cases')).toBeInTheDocument()
  })

  it('expands suite and shows case details', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Smoke Tests'))
    await userEvent.click(screen.getByText('Smoke Tests'))
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    expect(screen.getByText('User Logout')).toBeInTheDocument()
  })

  it('calls onRunSuite when Run button clicked', async () => {
    const onRunSuite = vi.fn()
    render(<SuitesTab repoPath="/repo" onRunSuite={onRunSuite} />)
    await waitFor(() => screen.getByText('Smoke Tests'))
    await userEvent.click(screen.getByText('Run'))
    expect(onRunSuite).toHaveBeenCalledWith('smoke')
  })

  it('opens create form', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('+ New Suite'))
    expect(screen.getByRole('heading', { name: 'Create Suite' })).toBeInTheDocument()
  })

  it('calls deleteSuite when delete confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Delete'))
    await userEvent.click(screen.getByText('Delete'))
    await waitFor(() => expect(client.deleteSuite).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'smoke' })
    ))
  })

  it('calls createSuite when create form submitted', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await userEvent.click(screen.getByText('+ New Suite'))
    const inputs = screen.getAllByRole('textbox')
    await userEvent.type(inputs[0], 'regression')
    await userEvent.type(inputs[1], 'Regression Tests')
    await userEvent.click(screen.getByRole('button', { name: 'Create Suite' }))
    await waitFor(() => expect(client.createSuite).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repo', slug: 'regression', name: 'Regression Tests' })
    ))
  })

  it('opens edit form with pre-filled values when Edit clicked', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    expect(screen.getByText('Edit: smoke')).toBeInTheDocument()
    const nameInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'Smoke Tests')
    expect(nameInput).toBeDefined()
  })

  it('calls updateSuite when edit form submitted', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Edit'))
    await userEvent.click(screen.getByText('Edit'))
    const nameInput = screen.getAllByRole('textbox').find(i => (i as HTMLInputElement).value === 'Smoke Tests') as HTMLInputElement
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Updated Smoke')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(client.updateSuite).toHaveBeenCalledWith(
      expect.objectContaining({ repoPath: '/repo', slug: 'smoke', name: 'Updated Smoke' })
    ))
  })

  it('shows error banner when listSuites fails', async () => {
    vi.mocked(client.listSuites).mockRejectedValue(new Error('load failed'))
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => expect(screen.getByText('load failed')).toBeInTheDocument())
  })

  it('shows raw case paths when listCases returns empty', async () => {
    vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never)
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Smoke Tests'))
    await userEvent.click(screen.getByText('Smoke Tests'))
    await waitFor(() => expect(screen.getByText('auth/login')).toBeInTheDocument())
    expect(screen.getByText('auth/logout')).toBeInTheDocument()
  })

  it('shows "No cases in this suite" for suite with no cases', async () => {
    const emptySuite = { ...mockSuite, cases: [] } as unknown as Suite
    vi.mocked(client.listSuites).mockResolvedValue({ suites: [emptySuite] } as never)
    vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never)
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Smoke Tests'))
    await userEvent.click(screen.getByText('Smoke Tests'))
    await waitFor(() => expect(screen.getByText('No cases in this suite.')).toBeInTheDocument())
  })

  it('collapses expanded suite when clicked again', async () => {
    render(<SuitesTab repoPath="/repo" />)
    await waitFor(() => screen.getByText('Smoke Tests'))
    await userEvent.click(screen.getByText('Smoke Tests'))
    await waitFor(() => expect(screen.getByText('User Login')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Smoke Tests'))
    await waitFor(() => expect(screen.queryByText('User Login')).not.toBeInTheDocument())
  })
})
