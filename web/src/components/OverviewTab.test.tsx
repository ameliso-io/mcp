import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import OverviewTab from "./OverviewTab";
import { client } from "../client";
import { ResultStatus, RunStatus } from "../gen/ameliso/v1/types_pb";
import type { AffectedCase, CoverageEntry, RunMeta } from "../gen/ameliso/v1/types_pb";

vi.mock("../client");

const makeCovEntry = (
  path: string,
  title: string,
  priority: string,
  status: ResultStatus
): CoverageEntry =>
  ({
    case: {
      path,
      title,
      description: "",
      tags: [],
      priority,
      createdAt: "",
      updatedAt: "",
    } as never,
    latestStatus: status,
    lastRunId: "run-1",
    lastRunDate: "2026-01-01",
  }) as unknown as CoverageEntry;

const coverageEntries = [
  makeCovEntry("auth/login", "User Login", "high", ResultStatus.PASSED),
  makeCovEntry("auth/logout", "User Logout", "low", ResultStatus.FAILED),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.getCoverageReport).mockResolvedValue({
    entries: coverageEntries,
    runCount: 5,
  } as never);
  vi.mocked(client.listRuns).mockResolvedValue({ runs: [] } as never);
  vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [], reason: "" } as never);
});

describe("OverviewTab", () => {
  it("shows helpful empty state when no repo selected", () => {
    render(<OverviewTab repoId="" />);
    expect(screen.getByText(/No repository selected/i)).toBeInTheDocument();
  });

  it("loads and displays stat counts", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("shows coverage entries with failed first", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("auth/login"));
    const entries = screen.getAllByText(/auth\//);
    expect(entries[0].textContent).toBe("auth/logout");
  });

  it("shows last run date on coverage entries", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getAllByText("2026-01-01").length).toBeGreaterThan(0));
  });

  it("shows active runs panel when in-progress runs exist", async () => {
    const activeRun = {
      id: "run-abc",
      tester: "alice",
      environment: "staging",
      suite: "smoke",
      date: "2026-01-01",
      status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    expect(screen.getByText("run-abc")).toBeInTheDocument();
  });

  it("calls getAffectedCases when Check Diff submitted", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() =>
      expect(client.getAffectedCases).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: "owner/repo" })
      )
    );
  });

  it('shows "no cases affected" when diff returns empty list', async () => {
    vi.mocked(client.getAffectedCases).mockResolvedValue({ cases: [], reason: "" } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText(/No cases affected/)).toBeInTheDocument());
  });

  it("shows affected cases list when diff returns cases", async () => {
    const affectedCase = {
      case: {
        path: "auth/login",
        title: "User Login",
        priority: "high",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "modified",
    } as unknown as AffectedCase;
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [affectedCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("modified")).toBeInTheDocument());
  });

  it("calls onGoToRuns when Go to Runs clicked", async () => {
    const activeRun = {
      id: "run-xyz",
      tester: "bob",
      environment: "prod",
      suite: "smoke",
      date: "2026-01-01",
      status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    const onGoToRuns = vi.fn();
    render(<OverviewTab repoId="owner/repo" onGoToRuns={onGoToRuns} />);
    await waitFor(() => screen.getByText("Go to Runs"));
    await userEvent.click(screen.getByText("Go to Runs"));
    expect(onGoToRuns).toHaveBeenCalled();
  });

  it("shows affectedError when getAffectedCases throws", async () => {
    vi.mocked(client.getAffectedCases).mockRejectedValue(new Error("network error"));
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("network error")).toBeInTheDocument());
  });

  it("shows error banner when getCoverageReport fails", async () => {
    vi.mocked(client.getCoverageReport).mockRejectedValue(new Error("coverage failed"));
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("coverage failed")).toBeInTheDocument());
  });

  it("sorts affected cases high before low", async () => {
    const highCase = {
      case: {
        path: "auth/login",
        title: "High Priority",
        priority: "high",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "modified",
    } as unknown as AffectedCase;
    const lowCase = {
      case: {
        path: "auth/logout",
        title: "Low Priority",
        priority: "low",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "added",
    } as unknown as AffectedCase;
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [lowCase, highCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("High Priority")).toBeInTheDocument());
    const titles = screen.getAllByText(/Priority/);
    expect(titles[0].textContent).toBe("High Priority");
    expect(titles[1].textContent).toBe("Low Priority");
  });

  it('shows singular "run" when runCount is 1', async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({
      entries: coverageEntries,
      runCount: 1,
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Coverage \(1 run\)/)).toBeInTheDocument());
  });

  it("shows medium priority dot for medium priority affected case", async () => {
    const mediumCase = {
      case: {
        path: "auth/reset",
        title: "Medium Priority",
        priority: "medium",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "changed",
    } as unknown as AffectedCase;
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [mediumCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("Medium Priority")).toBeInTheDocument());
  });

  it('shows "No cases found" when coverage entries are empty', async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({ entries: [], runCount: 0 } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() =>
      expect(screen.getByText("No cases found in this repository.")).toBeInTheDocument()
    );
  });

  it("shows BLOCKED, SKIPPED, NEVER, and UNSPECIFIED status entries in coverage", async () => {
    const blockedEntry = makeCovEntry("auth/block", "Blocked Case", "medium", ResultStatus.BLOCKED);
    const skippedEntry = makeCovEntry("auth/skip", "Skipped Case", "low", ResultStatus.SKIPPED);
    const neverEntry = makeCovEntry("auth/never", "Never Run Case", "low", ResultStatus.NEVER);
    const unknownEntry = makeCovEntry(
      "auth/unknown",
      "Unknown Case",
      "low",
      ResultStatus.UNSPECIFIED
    );
    vi.mocked(client.getCoverageReport).mockResolvedValue({
      entries: [blockedEntry, skippedEntry, neverEntry, unknownEntry],
      runCount: 3,
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Blocked")).toBeInTheDocument());
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Never run")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("sorts unknown priority to end in affected cases", async () => {
    const knownCase = {
      case: {
        path: "auth/login",
        title: "High Priority",
        priority: "high",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "modified",
    } as unknown as AffectedCase;
    const unknownCase = {
      case: {
        path: "other/thing",
        title: "Unknown Priority",
        priority: "",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "added",
    } as unknown as AffectedCase;
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [unknownCase, knownCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("High Priority")).toBeInTheDocument());
    const titles = screen.getAllByText(/Priority/);
    expect(titles[0].textContent).toBe("High Priority");
  });

  it("sorts AffectedCase with null case field to end (null first)", async () => {
    const nullCaseAffected = { case: undefined, reason: "unknown" } as unknown as AffectedCase;
    const knownCase = {
      case: {
        path: "auth/login",
        title: "Known",
        priority: "high",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "modified",
    } as unknown as AffectedCase;
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [nullCaseAffected, knownCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("Known")).toBeInTheDocument());
  });

  it("clears existing poll interval when rerendered with new repoId while active runs exist", async () => {
    const activeRun = {
      id: "run-poll",
      tester: "alice",
      environment: "staging",
      suite: "smoke",
      date: "2026-01-01",
      status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    const { rerender } = render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    await act(async () => {
      rerender(<OverviewTab repoId="owner/new-repo" />);
    });
    await waitFor(() =>
      expect(client.getCoverageReport).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: "owner/new-repo" })
      )
    );
  });

  it("sorts AffectedCase with null case field to end (null second)", async () => {
    const nullCaseAffected = { case: undefined, reason: "unknown" } as unknown as AffectedCase;
    const knownCase = {
      case: {
        path: "auth/login",
        title: "Known2",
        priority: "high",
        tags: [],
        description: "",
        createdAt: "",
        updatedAt: "",
      },
      reason: "modified",
    } as unknown as AffectedCase;
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [knownCase, nullCaseAffected],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("Known2")).toBeInTheDocument());
  });

  it("shows Blocked, Skipped, Never, and Unknown status labels in coverage", async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({
      entries: [
        makeCovEntry("a", "A", "high", ResultStatus.BLOCKED),
        makeCovEntry("b", "B", "high", ResultStatus.SKIPPED),
        makeCovEntry("c", "C", "high", ResultStatus.NEVER),
        makeCovEntry("d", "D", "high", ResultStatus.UNSPECIFIED),
      ],
      runCount: 1,
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Blocked")).toBeInTheDocument());
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Never run")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("dismisses error banner when X button clicked", async () => {
    vi.mocked(client.getCoverageReport).mockRejectedValue(new Error("coverage failed"));
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("coverage failed")).toBeInTheDocument());
    await userEvent.click(screen.getByText("×"));
    expect(screen.queryByText("coverage failed")).not.toBeInTheDocument();
  });

  it("sets sinceRef when typing in diff input", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    const sinceInput = screen.getByPlaceholderText(/Since ref/);
    await userEvent.type(sinceInput, "HEAD~3");
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() =>
      expect(client.getAffectedCases).toHaveBeenCalledWith(
        expect.objectContaining({ sinceRef: "HEAD~3" })
      )
    );
  });

  it("dismisses affectedError when X button clicked", async () => {
    vi.mocked(client.getAffectedCases).mockRejectedValue(new Error("diff error"));
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("diff error")).toBeInTheDocument());
    const xButtons = screen.getAllByText("×");
    await userEvent.click(xButtons[xButtons.length - 1]);
    expect(screen.queryByText("diff error")).not.toBeInTheDocument();
  });

  it("shows loading state while fetching coverage data", async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.getCoverageReport).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    vi.mocked(client.listRuns).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<OverviewTab repoId="owner/repo" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve!({ entries: [], runCount: 0, runs: [] });
  });

  it('shows "Checking…" on Check Diff button while loading', async () => {
    let resolveAffected: (v: unknown) => void;
    vi.mocked(client.getAffectedCases).mockReturnValue(
      new Promise((res) => {
        resolveAffected = res;
      }) as never
    );
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    resolveAffected!({ cases: [], reason: "" });
  });

  it("unmounts cleanly when polling interval is active", async () => {
    const activeRun = {
      id: "run-unmount",
      tester: "alice",
      environment: "staging",
      suite: "smoke",
      date: "2026-01-01",
      status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    const { unmount } = render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    unmount();
  });

  it("does not show lastRunDate when it is empty", async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({
      entries: [
        {
          ...makeCovEntry("auth/login", "User Login", "high", ResultStatus.PASSED),
          lastRunDate: "",
        },
      ],
      runCount: 1,
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("auth/login")).toBeInTheDocument());
    expect(screen.queryByText("2026-01-01")).not.toBeInTheDocument();
  });

  it("shows plural runs in Coverage heading", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Coverage \(5 runs\)/)).toBeInTheDocument());
  });
});
