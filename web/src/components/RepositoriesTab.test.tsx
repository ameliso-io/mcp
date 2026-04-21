import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import RepositoriesTab from './RepositoriesTab'
import { client } from '../client'
import type { Repository } from '../gen/ameliso/v1/types_pb'

vi.mock('../client')

const makeRepo = (overrides: Partial<Repository> = {}): Repository => ({
  id: 'owner/repo',
  name: 'repo',
  fullName: 'owner/repo',
  htmlUrl: 'https://github.com/owner/repo',
  installationId: 'inst-1',
  addedAt: '2026-01-01',
  ...overrides,
} as unknown as Repository)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [] } as never)
  vi.mocked(client.getGitHubInstallUrl).mockResolvedValue({ url: '', configured: false } as never)
  vi.mocked(client.syncRepository).mockResolvedValue({ repository: makeRepo() } as never)
  vi.mocked(client.removeRepository).mockResolvedValue({} as never)
})

describe('RepositoriesTab', () => {
  it('shows Repositories heading', async () => {
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Repositories' })).toBeInTheDocument())
  })

  it('shows empty state when no repos and GitHub not configured', async () => {
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(screen.getByText('No repositories connected')).toBeInTheDocument())
    expect(screen.getByText(/Configure GitHub App environment variables/)).toBeInTheDocument()
  })

  it('shows Connect GitHub Repo link when configured', async () => {
    vi.mocked(client.getGitHubInstallUrl).mockResolvedValue({ url: 'https://github.com/apps/ameliso/install', configured: true } as never)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(screen.getByText('+ Connect GitHub Repo')).toBeInTheDocument())
  })

  it('shows repo card with name and link', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(screen.getByText('owner/repo')).toBeInTheDocument())
    expect(screen.getByText('https://github.com/owner/repo')).toBeInTheDocument()
  })

  it('shows Active badge for active repo', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="owner/repo" />)
    await waitFor(() => expect(screen.getByText('Active')).toBeInTheDocument())
  })

  it('calls onRepoSelect with repo id when Use clicked', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    const onRepoSelect = vi.fn()
    render(<RepositoriesTab onRepoSelect={onRepoSelect} activeRepoId="" />)
    await waitFor(() => screen.getByText('Use'))
    await userEvent.click(screen.getByText('Use'))
    expect(onRepoSelect).toHaveBeenCalledWith('owner/repo')
  })

  it('calls onRepoSelect with empty string when Deselect clicked', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    const onRepoSelect = vi.fn()
    render(<RepositoriesTab onRepoSelect={onRepoSelect} activeRepoId="owner/repo" />)
    await waitFor(() => screen.getByText('Deselect'))
    await userEvent.click(screen.getByText('Deselect'))
    expect(onRepoSelect).toHaveBeenCalledWith('')
  })

  it('calls syncRepository when Sync clicked', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => screen.getByText('Sync'))
    await userEvent.click(screen.getByText('Sync'))
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: 'owner/repo' }))
  })

  it('calls removeRepository after confirm', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => screen.getByText('Remove'))
    await userEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(client.removeRepository).toHaveBeenCalledWith({ id: 'owner/repo' }))
  })

  it('does not call removeRepository when confirm cancelled', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => screen.getByText('Remove'))
    await userEvent.click(screen.getByText('Remove'))
    expect(client.removeRepository).not.toHaveBeenCalled()
  })

  it('shows and dismisses error', async () => {
    vi.mocked(client.listRepositories).mockRejectedValue(new Error('network error'))
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(screen.getByText('network error')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '×' }))
    expect(screen.queryByText('network error')).not.toBeInTheDocument()
  })

  it('calls handleGitHubCallback when installation_id present in URL', async () => {
    window.history.pushState({}, '', '?installation_id=inst-42&setup_action=install')
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({ repositories: [makeRepo()] } as never)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: 'inst-42' }))
    window.history.replaceState({}, '', '/')
  })

  it('shows error when syncRepository fails', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    vi.mocked(client.syncRepository).mockRejectedValue(new Error('sync failed'))
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => screen.getByText('Sync'))
    await userEvent.click(screen.getByText('Sync'))
    await waitFor(() => expect(screen.getByText('sync failed')).toBeInTheDocument())
  })

  it('shows error when removeRepository fails', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never)
    vi.mocked(client.removeRepository).mockRejectedValue(new Error('remove failed'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => screen.getByText('Remove'))
    await userEvent.click(screen.getByText('Remove'))
    await waitFor(() => expect(screen.getByText('remove failed')).toBeInTheDocument())
  })

  it('calls handleGitHubCallback for setup_action=update', async () => {
    window.history.pushState({}, '', '?installation_id=inst-99&setup_action=update')
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({ repositories: [makeRepo()] } as never)
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />)
    await waitFor(() => expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: 'inst-99' }))
    window.history.replaceState({}, '', '/')
  })
})
