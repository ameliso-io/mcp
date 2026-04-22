import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import RepositoriesTab from "./RepositoriesTab";
import { client } from "@/client";
import {
  makeGetGitHubInstallUrlResponse,
  makeHandleGitHubCallbackResponse,
  makeListRepositoriesResponse,
  makeRemoveRepositoryResponse,
  makeRepository,
  makeSyncRepositoryResponse,
} from "@/test/factories";

vi.mock("@/client");

const makeRepo = (overrides = {}) => makeRepository({ installationId: "inst-1", ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listRepositories).mockResolvedValue(makeListRepositoriesResponse());
  vi.mocked(client.getGitHubInstallUrl).mockResolvedValue(makeGetGitHubInstallUrlResponse());
  vi.mocked(client.syncRepository).mockResolvedValue(
    makeSyncRepositoryResponse({ repository: makeRepo() })
  );
  vi.mocked(client.removeRepository).mockResolvedValue(makeRemoveRepositoryResponse());
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
    vi.mocked(client.getGitHubInstallUrl).mockResolvedValue(
      makeGetGitHubInstallUrlResponse({
        url: "https://github.com/apps/ameliso/install",
        configured: true,
      })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("+ Connect GitHub Repo")).toBeInTheDocument());
  });

  it("shows repo card with name and link", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("owner/repo")).toBeInTheDocument());
    expect(screen.getByText("https://github.com/owner/repo")).toBeInTheDocument();
  });

  it("shows Active badge for active repo", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Active")).toBeInTheDocument());
  });

  it("calls onRepoSelect with repo id when Use clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    const onRepoSelect = vi.fn();
    render(<RepositoriesTab onRepoSelect={onRepoSelect} activeRepoId="" />);
    await waitFor(() => screen.getByText("Use"));
    await userEvent.click(screen.getByText("Use"));
    expect(onRepoSelect).toHaveBeenCalledWith("owner/repo");
  });

  it("calls onRepoSelect with empty string when Deselect clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    const onRepoSelect = vi.fn();
    render(<RepositoriesTab onRepoSelect={onRepoSelect} activeRepoId="owner/repo" />);
    await waitFor(() => screen.getByText("Deselect"));
    await userEvent.click(screen.getByText("Deselect"));
    expect(onRepoSelect).toHaveBeenCalledWith("");
  });

  it("calls syncRepository when Sync clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
  });

  it("calls removeRepository after inline confirm", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove owner/repo" }));
    await waitFor(() => expect(client.removeRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
  });

  it("announces removal via live region", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove owner/repo" }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("owner/repo removed"))
      ).toBe(true)
    );
  });

  it("does not call removeRepository when inline confirm cancelled", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel remove" }));
    expect(client.removeRepository).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Remove owner/repo" })).toBeInTheDocument();
  });

  it("shows and dismisses error", async () => {
    vi.mocked(client.listRepositories).mockRejectedValue(new Error("network error"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("network error")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("network error")).not.toBeInTheDocument();
  });

  it("retries load when Retry button clicked after error", async () => {
    vi.mocked(client.listRepositories)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValue(makeListRepositoriesResponse({ repositories: [makeRepo()] }));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("network error")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByText("owner/repo")).toBeInTheDocument());
    expect(screen.queryByText("network error")).not.toBeInTheDocument();
  });

  it("calls handleGitHubCallback when installationId prop present with setup_action=install", async () => {
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(
      <RepositoriesTab
        onRepoSelect={() => {}}
        activeRepoId=""
        installationId="inst-42"
        setupAction="install"
      />
    );
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-42" })
    );
  });

  it("shows error when syncRepository fails", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.syncRepository).mockRejectedValue(new Error("sync failed"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(screen.getByText("sync failed")).toBeInTheDocument());
  });

  it("shows error when removeRepository fails", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.removeRepository).mockRejectedValue(new Error("remove failed"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove owner/repo" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm remove owner/repo" }));
    await waitFor(() => expect(screen.getByText("remove failed")).toBeInTheDocument());
  });

  it("calls handleGitHubCallback for setup_action=update", async () => {
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(
      <RepositoriesTab
        onRepoSelect={() => {}}
        activeRepoId=""
        installationId="inst-99"
        setupAction="update"
      />
    );
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-99" })
    );
  });

  it("does not call handleGitHubCallback when setup_action=request_install", async () => {
    render(
      <RepositoriesTab
        onRepoSelect={() => {}}
        activeRepoId=""
        installationId="inst-bad"
        setupAction="request_install"
      />
    );
    await waitFor(() => screen.getByText("No repositories connected"));
    expect(client.handleGitHubCallback).not.toHaveBeenCalled();
  });

  it("calls handleGitHubCallback when installationId present without setupAction", async () => {
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(
      <RepositoriesTab onRepoSelect={() => {}} activeRepoId="" installationId="inst-no-action" />
    );
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-no-action" })
    );
  });

  it("calls onInstallationHandled after processing GitHub callback", async () => {
    const onInstallationHandled = vi.fn();
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(
      <RepositoriesTab
        onRepoSelect={() => {}}
        activeRepoId=""
        installationId="inst-42"
        setupAction="install"
        onInstallationHandled={onInstallationHandled}
      />
    );
    await waitFor(() => expect(onInstallationHandled).toHaveBeenCalled());
  });

  it("handles syncRepository with no repository in response", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.syncRepository).mockResolvedValue(makeSyncRepositoryResponse());
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalled());
  });

  it("updates repo in list when syncRepository succeeds with repository", async () => {
    const otherRepo = makeRepo({ id: "owner/other", name: "other" });
    const updatedRepo = makeRepo({ name: "repo-updated" });
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo(), otherRepo] })
    );
    vi.mocked(client.syncRepository).mockResolvedValue(
      makeSyncRepositoryResponse({ repository: updatedRepo })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getAllByText("Sync").length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByText("Sync")[0]!);
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
  });

  it("search filters repos by name", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({
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
      })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("org/alpha"));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search repositories" }), "alpha");
    expect(screen.getByText("org/alpha")).toBeInTheDocument();
    expect(screen.queryByText("org/beta")).not.toBeInTheDocument();
  });

  it("calls handleGitHubCallback when installationId present with no setupAction (refresh-all path)", async () => {
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" installationId="inst-55" />);
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-55" })
    );
  });

  it("does not update repo list when syncRepository returns no repository", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.syncRepository).mockResolvedValue(makeSyncRepositoryResponse());
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() => expect(client.syncRepository).toHaveBeenCalledWith({ id: "owner/repo" }));
    // repo card still shown - list not changed
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
  });

  it("search shows no-results state and clear button resets", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByRole("searchbox", { name: "Search repositories" }));
    await userEvent.type(
      screen.getByRole("searchbox", { name: "Search repositories" }),
      "no-match-xyz"
    );
    await waitFor(() => expect(screen.getByText(/No results for/)).toBeInTheDocument());
    await userEvent.click(screen.getByText("Clear search"));
    expect(screen.getByText("owner/repo")).toBeInTheDocument();
  });

  it("calls handleGitHubCallback for each installation when Refresh All clicked", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    await waitFor(() =>
      expect(client.handleGitHubCallback).toHaveBeenCalledWith({ installationId: "inst-1" })
    );
  });

  it("announces refresh completion via live region", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.handleGitHubCallback).mockResolvedValue(
      makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((el) => el.textContent?.includes("Repositories refreshed"))
      ).toBe(true)
    );
  });

  it("shows error when Refresh All fails", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.handleGitHubCallback).mockRejectedValue(new Error("refresh failed"));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    await waitFor(() => expect(screen.getByText("refresh failed")).toBeInTheDocument());
  });

  it("shows addedAt date on repo card", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo({ addedAt: "2026-03-15" })] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => expect(screen.getByText("2026-03-15")).toBeInTheDocument());
  });

  it("does not show addedAt line when addedAt is empty", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo({ addedAt: "" })] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("owner/repo"));
    expect(screen.queryByText(/Added /)).not.toBeInTheDocument();
  });

  it('shows "Syncing…" on Sync button while sync in progress', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    let resolve!: (v: ReturnType<typeof makeSyncRepositoryResponse>) => void;
    vi.mocked(client.syncRepository).mockReturnValue(
      new Promise((res) => {
        resolve = res as typeof resolve;
      })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    expect(screen.getByText("Syncing…")).toBeInTheDocument();
    await act(async () => resolve(makeSyncRepositoryResponse({ repository: makeRepo() })));
  });

  it('shows "Refreshing…" on Refresh All button while refreshing', async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    let resolve!: (v: ReturnType<typeof makeHandleGitHubCallbackResponse>) => void;
    vi.mocked(client.handleGitHubCallback).mockReturnValue(
      new Promise((res) => {
        resolve = res as typeof resolve;
      })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("↻ Refresh All"));
    await userEvent.click(screen.getByText("↻ Refresh All"));
    expect(screen.getByText("Refreshing…")).toBeInTheDocument();
    await act(async () =>
      resolve(makeHandleGitHubCallbackResponse({ repositories: [makeRepo()] }))
    );
  });

  it("shows loading state while fetching repos", async () => {
    let resolve!: (v: ReturnType<typeof makeListRepositoriesResponse>) => void;
    vi.mocked(client.listRepositories).mockReturnValue(
      new Promise((res) => {
        resolve = res as typeof resolve;
      })
    );
    vi.mocked(client.getGitHubInstallUrl).mockReturnValue(new Promise(() => {}));
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve(makeListRepositoriesResponse());
  });

  it("announces repo selection via live region when activeRepoId changes", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    const { rerender } = render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("owner/repo"));
    rerender(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="owner/repo" />);
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("owner/repo selected"))
      ).toBe(true)
    );
  });

  it("announces deselection via live region when activeRepoId is cleared", async () => {
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    const { rerender } = render(
      <RepositoriesTab onRepoSelect={() => {}} activeRepoId="owner/repo" />
    );
    await waitFor(() => screen.getByText("owner/repo"));
    rerender(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((el) => el.textContent?.includes("Repository deselected"))
      ).toBe(true)
    );
  });

  it("announces sync completion via live region", async () => {
    const synced = makeRepo({ fullName: "owner/repo" });
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo()] })
    );
    vi.mocked(client.syncRepository).mockResolvedValue(
      makeSyncRepositoryResponse({ repository: synced })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("Sync"));
    await userEvent.click(screen.getByText("Sync"));
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("status")
          .some((el) => el.textContent?.includes("Sync completed for owner/repo"))
      ).toBe(true)
    );
  });

  it("announces filtered count via live region when search changes", async () => {
    const repo2 = makeRepo({
      id: "owner/other",
      name: "other",
      fullName: "owner/other",
      htmlUrl: "https://github.com/owner/other",
    });
    vi.mocked(client.listRepositories).mockResolvedValue(
      makeListRepositoriesResponse({ repositories: [makeRepo(), repo2] })
    );
    render(<RepositoriesTab onRepoSelect={() => {}} activeRepoId="" />);
    await waitFor(() => screen.getByText("owner/repo"));
    await userEvent.type(screen.getByRole("searchbox"), "other");
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("1 repository found"))
      ).toBe(true)
    );
  });
});
