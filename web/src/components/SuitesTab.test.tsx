import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import SuitesTab from './SuitesTab'
import { client } from '../client'
import type { Suite, Case } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const mockSuite = {
  slug: 'smoke',
  name: 'Smoke Tests',
  description: 'Critical path checks',
  cases: ['auth/login', 'auth/logout'],
} as unknown as Suite

beforeEach(() => {
  vi.mocked(client.listSuites).mockResolvedValue({ suites: [mockSuite] } as never)
  vi.mocked(client.listCases).mockResolvedValue({ cases: [
    { path: 'auth/login', title: 'User Login', description: '', tags: ['auth'], priority: 'high', createdAt: '', updatedAt: '' },
    { path: 'auth/logout', title: 'User Logout', description: '', tags: [], priority: 'low', createdAt: '', updatedAt: '' },
  ] as unknown as Case[] } as never)
  vi.mocked(client.createSuite).mockResolvedValue({ suite: mockSuite, filePath: 'suites/smoke.yaml' } as never)
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
})
