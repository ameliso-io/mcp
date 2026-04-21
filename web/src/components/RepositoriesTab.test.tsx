import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import RepositoriesTab from "./RepositoriesTab";
import { client } from "../client";
import type { Repository } from "../gen/ameliso/v1/types_pb";

vi.mock("../client");

const makeRepo = (overrides: Partial<Repository> = {}): Repository =>
  ({
    id: "owner/repo",
    name: "repo",
    fullName: "owner/repo",
    htmlUrl: "https://github.com/owner/repo",
    installationId: "inst-1",
    addedAt: "2026-01-01",
    ...overrides,
  }) as unknown as Repository;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [] } as never);
  vi.mocked(client.getGitHubInstallUrl).mockResolvedValue({ url: "", configured: false } as never);
  vi.mocked(client.syncRepository).mockResolvedValue({ repository: makeRepo() } as never);
  vi.mocked(client.removeRepository).mockResolvedValue({} as never);
});

describe("RepositoriesTab", () => {
  it("shows Repositories heading", async () => {
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Repositories" })).toBeInTheDocument()
    );
  });

  it("shows empty state when no repos and GitHub not configured", async () => {
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("No repositories connected")).toBeInTheDocument());
    expect(screen.getByText(/Configure GitHub App environment variables/)).toBeInTheDocument();
  });

  it("shows Connect GitHub Repo link when configured", async () => {
    vi.mocked(client.getGitHubInstallUrl).mockResolvedValue({
      url: "https://github.com/apps/ameliso/install",
      configured: true,
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("+ Connect GitHub Repo")).toBeInTheDocument());
  });

  it("shows repo card with name and link", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("owner/repo")).toBeInTheDocument());
    expect(screen.getByText("https://github.com/owner/repo")).toBeInTheDocument();
  });

  it("shows Active badge for active repo", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
  });

  it("calls onRepoSelect with repo id when Use clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    const onRepoSelect = vi.fn();
    render(<RepositoriesTab onRepoSelect={onRepoSelect} activeRepoId="" />);
    await waitFor(() => screen.getByText("Use"));
    await userEvent.click(screen.getByText("Use"));
    expect(onRepoSelect).toHaveBeenCalledWith("owner/repo");
  });

  it("calls onRepoSelect with empty string when Deselect clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    const onRepoSelect = vi.fn();
    render(<RepositoriesTab onRepoSelect={onRepoSelect} activeRepoId="owner/repo" />);
    await waitFor(() => screen.getByText("Deselect"));
    await userEvent.click(screen.getByText("Deselect"));
    expect(onRepoSelect).toHaveBeenCalledWith("");
  });

  it("calls syncRepository when Sync clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
  });

  it("calls removeRepository after confirm", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Remove"));
    await userEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(client.removeRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
  });

  it("does not call removeRepository when confirm cancelled", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Remove"));
    await userEvent.click(screen.getByText("Remove"));
    expect(client.removeRepository).not.toHaveBeenCalled();
  });

  it("shows and dismisses error", async () => {
    vi.mocked(client.listRepositories).mockRejectedValue(new Error("network error"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("network error")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "×" }));
    expect(screen.queryByText("network error")).not.toBeInTheDocument();
  });

  it("calls handleGitHubCallback when installation_id present in URL", async () => {
    window.history.pushState({}, "", "?installation_id=inst-42&setup_action=install");
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({
      repositories: [makeRepo()],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-42" })
    );
    window.history.replaceState({}, "", "/");
  });

  it("shows error when syncRepository fails", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.mocked(client.syncRepository).mockRejectedValue(new Error("sync failed"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(screen.getByText("sync failed")).toBeInTheDocument());
  });

  it("shows error when removeRepository fails", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.mocked(client.removeRepository).mockRejectedValue(new Error("remove failed"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Remove"));
    await userEvent.click(screen.getByText("Remove"));
    await waitFor(() => expect(screen.getByText("remove failed")).toBeInTheDocument());
  });

  it("calls handleGitHubCallback for setup_action=update", async () => {
    window.history.pushState({}, "", "?installation_id=inst-99&setup_action=update");
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({
      repositories: [makeRepo()],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-99" })
    );
    window.history.replaceState({}, "", "/");
  });

  it("calls handleGitHubCallback when installation_id present without setup_action", async () => {
    window.history.pushState({}, "", "?installation_id=inst-no-action");
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({
      repositories: [makeRepo()],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-no-action" })
    );
    window.history.replaceState({}, "", "/");
  });

  it("handles syncRepository with no repository in response", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.mocked(client.syncRepository).mockResolvedValue({} as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalled());
  });

  it("updates repo in list when syncRepository succeeds with repository", async () => {
    const otherRepo = makeRepo({ id: "owner/other", name: "other" });
    const updatedRepo = makeRepo({ name: "repo-updated" });
    vi.mocked(client.listRepositories).mockResolvedValue({
      repositories: [makeRepo(), otherRepo],
    } as never);
    vi.mocked(client.syncRepository).mockResolvedValue({ repository: updatedRepo } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getAllByText("Sync").length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByText("Sync")[0]);
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
  });

  it("search filters repos by name", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({
      repositories: [
        makeRepo({
          id: "org/alpha",
          name: "alpha",
          fullName: "org/alpha",
          htmlUrl: "https://github.com/org/alpha",
        }),
        makeRepo({
          id: "org/beta",
          name: "beta",
          fullName: "org/beta",
          htmlUrl: "https://github.com/org/beta",
        }),
      ],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("org/alpha"));
    await userEvent.type(screen.getByPlaceholderText("Search repositories…"), "alpha");
    expect(screen.getByText("org/alpha")).toBeInTheDocument();
    expect(screen.queryByText("org/beta")).not.toBeInTheDocument();
  });

  it("calls handleGitHubCallback when installation_id present with no setup_action", async () => {
    window.history.pushState({}, "", "?installation_id=inst-55");
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({
      repositories: [makeRepo()],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-55" })
    );
    window.history.replaceState({}, "", "/");
  });

  it("does not update repo list when syncRepository returns no repository", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.mocked(client.syncRepository).mockResolvedValue({ repository: undefined } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
    // repo card still shown - list not changed
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
  });

  it("search shows no-results state and clear button resets", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByPlaceholderText("Search repositories…"));
    await userEvent.type(screen.getByPlaceholderText("Search repositories…"), "no-match-xyz");
    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    await userEvent.click(screen.getByText("Clear search"));
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
  });

  it("calls handleGitHubCallback for each installation when Refresh All clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({
      repositories: [makeRepo()],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-1" })
    );
  });

  it("shows error when Refresh All fails", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    vi.mocked(client.handleGitHubCallback).mockRejectedValue(new Error("refresh failed"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    await waitFor(() => expect(screen.getByText("refresh failed")).toBeInTheDocument());
  });

  it("shows addedAt date on repo card", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({
      repositories: [makeRepo({ addedAt: "2026-03-15" })],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("Added 2026-03-15")).toBeInTheDocument());
  });

  it("does not show addedAt line when addedAt is empty", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({
      repositories: [makeRepo({ addedAt: "" })],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("owner/repo"));
    expect(screen.queryByText(/Added /)).not.toBeInTheDocument();
  });

  it('shows "Syncing…" on Sync button while sync in progress', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    let resolve: (v: unknown) => void;
    vi.mocked(client.syncRepository).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    resolve!({ repository: makeRepo() });
  });

  it('shows "Refreshing…" on Refresh All button while refreshing', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    let resolve: (v: unknown) => void;
    vi.mocked(client.handleGitHubCallback).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    expect(screen.getByText("Refreshing…")).toBeInTheDocument();
    resolve!({ repositories: [makeRepo()] });
  });

  it("shows loading state while fetching repos", async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.listRepositories).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    vi.mocked(client.getGitHubInstallUrl).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve!({ repositories: [], runs: [] });
  });

  it("shows connect hint when configured but no repos", async () => {
    vi.mocked(client.getGitHubInstallUrl).mockResolvedValue({
      url: "https://github.com/apps/ameliso/install",
      configured: true,
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(screen.getByText(/Click.*Connect GitHub Repo.*to install/i)).toBeInTheDocument()
    );
  });

  it("shows error when initial GitHub callback from URL fails", async () => {
    window.history.pushState({}, "", "?installation_id=inst-err&setup_action=install");
    vi.mocked(client.handleGitHubCallback).mockRejectedValue(new Error("callback failed"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("callback failed")).toBeInTheDocument());
    window.history.replaceState({}, "", "/");
  });

  it("does not call handleGitHubCallback when setup_action is an unknown value", async () => {
    window.history.pushState({}, "", "?installation_id=inst-xyz&setup_action=delete");
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(client.listRepositories).toHaveBeenCalled());
    expect(client.handleGitHubCallback).not.toHaveBeenCalled();
    window.history.replaceState({}, "", "/");
  });

  it("Refresh All deduplicates installationIds — calls handleGitHubCallback once when two repos share same installation", async () => {
    const repo1 = makeRepo({ id: "org/alpha", installationId: "shared-inst" });
    const repo2 = makeRepo({ id: "org/beta", installationId: "shared-inst" });
    vi.mocked(client.listRepositories).mockResolvedValue({
      repositories: [repo1, repo2],
    } as never);
    vi.mocked(client.handleGitHubCallback).mockResolvedValue({
      repositories: [repo1, repo2],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    await waitFor(() => expect(client.handleGitHubCallback).toHaveBeenCalledTimes(1));
    expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "shared-inst" });
  });

  it("search filters repos by html url", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({
      repositories: [
        makeRepo({
          id: "org/alpha",
          name: "alpha",
          fullName: "org/alpha",
          htmlUrl: "https://github.com/org/alpha",
        }),
        makeRepo({
          id: "org/beta",
          name: "beta",
          fullName: "org/beta",
          htmlUrl: "https://github.com/org/beta",
        }),
      ],
    } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("org/alpha"));
    await userEvent.type(screen.getByPlaceholderText("Search repositories…"), "beta");
    expect(screen.queryByText("org/alpha")).not.toBeInTheDocument();
    expect(screen.getByText("org/beta")).toBeInTheDocument();
  });

  it("does not show search bar or Refresh All button when repo list is empty", async () => {
    // default mock: listRepositories returns []
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("No repositories connected")).toBeInTheDocument());
    // search bar and Refresh All are conditionally rendered only when repos.length > 0
    expect(screen.queryByPlaceholderText("Search repositories…")).not.toBeInTheDocument();
    expect(screen.queryByText(/Refresh All/)).not.toBeInTheDocument();
  });

  it("does not show Active badge when repo is not the active repo", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue({ repositories: [makeRepo()] } as never);
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="other/repo" />);
    await waitFor(() => expect(screen.getByText("owner/repo")).toBeInTheDocument());
    // Active badge is only shown when activeRepoId matches repo id
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });
});
