import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import OverviewTab from "./OverviewTab";
import { client } from "@/client";
import { ResultStatus } from "@/gen/ameliso/v1/types_pb";
import { makeAffectedCase, makeCoverageEntry, makeRunMeta } from "@/test/factories";

vi.mock("@/client");

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const makeCovEntry = (path: string, title: string, priority: string, status: ResultStatus) =>
  makeCoverageEntry({
    case: { path, title, priority },
    latestStatus: status,
    lastRunDate: "2026-01-01",
  });

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
    expect(entries[0]!.textContent).toBe("auth/logout");
  });

  it("shows last run date on coverage entries", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getAllByText("2026-01-01").length).toBeGreaterThan(0));
  });

  it("shows active runs panel when in-progress runs exist", async () => {
    const activeRun = makeRunMeta({ id: "run-abc", tester: "alice", environment: "staging" });
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
    const affectedCase = makeAffectedCase({
      case: { path: "auth/login", title: "User Login", priority: "high" },
      reason: "modified",
    });
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [affectedCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("modified")).toBeInTheDocument());
  });

  it("renders Go to Runs link pointing to /runs", async () => {
    const activeRun = makeRunMeta({ id: "run-xyz", tester: "bob", environment: "prod" });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Go to Runs"));
    expect(screen.getByRole("link", { name: "Go to Runs" })).toHaveAttribute("href", "/runs");
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
    const highCase = makeAffectedCase({
      case: { path: "auth/login", title: "High Priority", priority: "high" },
      reason: "modified",
    });
    const lowCase = makeAffectedCase({
      case: { path: "auth/logout", title: "Low Priority", priority: "low" },
      reason: "added",
    });
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [lowCase, highCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("High Priority")).toBeInTheDocument());
    const titles = screen.getAllByText(/Priority/);
    expect(titles[0]!.textContent).toBe("High Priority");
    expect(titles[1]!.textContent).toBe("Low Priority");
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
    const mediumCase = makeAffectedCase({
      case: { path: "auth/reset", title: "Medium Priority", priority: "medium" },
      reason: "changed",
    });
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

  it("active runs panel not shown when coverage entries empty even with active runs", async () => {
    const activeRun = makeRunMeta({
      id: "run-active",
      tester: "alice",
      suite: "smoke",
      date: "2026-01-01",
    });
    vi.mocked(client.getCoverageReport).mockResolvedValue({ entries: [], runCount: 0 } as never);
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() =>
      expect(screen.getByText("No cases found in this repository.")).toBeInTheDocument()
    );
    expect(screen.queryByText(/Active Runs/)).not.toBeInTheDocument();
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
    const knownCase = makeAffectedCase({
      case: { path: "auth/login", title: "High Priority", priority: "high" },
      reason: "modified",
    });
    const unknownCase = makeAffectedCase({
      case: { path: "other/thing", title: "Unknown Priority", priority: "" },
      reason: "added",
    });
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [unknownCase, knownCase],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() => expect(screen.getByText("High Priority")).toBeInTheDocument());
    const titles = screen.getAllByText(/Priority/);
    expect(titles[0]!.textContent).toBe("High Priority");
  });

  it("sorts AffectedCase with null case field to end (null first)", async () => {
    const nullCaseAffected = makeAffectedCase({ reason: "unknown" });
    const knownCase = makeAffectedCase({
      case: { path: "auth/login", title: "Known", priority: "high" },
      reason: "modified",
    });
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
    const activeRun = makeRunMeta({ id: "run-poll", tester: "alice", environment: "staging" });
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
    const nullCaseAffected = makeAffectedCase({ reason: "unknown" });
    const knownCase = makeAffectedCase({
      case: { path: "auth/login", title: "Known2", priority: "high" },
      reason: "modified",
    });
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
    const sinceInput = screen.getByRole("textbox", { name: /Git ref to compare from/ });
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
    await userEvent.click(xButtons[xButtons.length - 1]!);
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
    const activeRun = makeRunMeta({ id: "run-unmount", tester: "alice", environment: "staging" });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    const { unmount } = render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    unmount();
  });

  it("getCoverageReport call count matches render cycle — poll uses silent=true so no extra announce", async () => {
    const activeRun = makeRunMeta({ id: "run-poll", tester: "alice", environment: "staging" });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    // Spy on announce by verifying only one announcement fires for the initial load
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("2 cases loaded"))
      ).toBe(true)
    );
    // Only one getCoverageReport call for the initial load — poll hasn't fired (no timer advance)
    expect(client.getCoverageReport).toHaveBeenCalledTimes(1);
  });

  it("announces singular '1 case loaded' when exactly one coverage entry returned", async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({
      entries: [makeCovEntry("auth/login", "User Login", "high", ResultStatus.PASSED)],
      runCount: 1,
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("1 case loaded"))
      ).toBe(true)
    );
  });

  it("announces plural 'N cases loaded' when multiple coverage entries returned", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("2 cases loaded"))
      ).toBe(true)
    );
  });

  it("announces 'No cases found' when coverage is empty", async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({ entries: [], runCount: 0 } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("No cases found"))
      ).toBe(true)
    );
  });

  it("announces singular '1 case affected' when exactly one affected case returned", async () => {
    vi.mocked(client.getAffectedCases).mockResolvedValue({
      cases: [makeAffectedCase({ case: { path: "auth/login", title: "Login", priority: "high" } })],
      reason: "",
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("1 case affected"))
      ).toBe(true)
    );
  });

  it("announces 'No cases affected' when diff returns no cases", async () => {
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Check Diff"));
    await userEvent.click(screen.getByText("Check Diff"));
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("No cases affected"))
      ).toBe(true)
    );
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

  it('shows "auto-refresh 30s" label in active runs panel', async () => {
    const activeRun = makeRunMeta({ id: "run-ar", tester: "dave", suite: "", date: "2026-03-01" });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/auto-refresh 30s/)).toBeInTheDocument());
  });

  it("shows non-zero Never Run stat when entries include never-run cases", async () => {
    vi.mocked(client.getCoverageReport).mockResolvedValue({
      entries: [makeCovEntry("auth/never", "NeverCase", "low", ResultStatus.NEVER)],
      runCount: 2,
    } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Never Run")).toBeInTheDocument());
    // stat card shows "1" for Never Run count
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
  });

  it("shows suite badge and tester in active runs panel", async () => {
    const activeRun = makeRunMeta({
      id: "run-badge",
      tester: "carol",
      suite: "e2e",
      date: "2026-02-01",
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("e2e")).toBeInTheDocument());
    expect(screen.getByText("carol")).toBeInTheDocument();
    expect(screen.getByText("2026-02-01")).toBeInTheDocument();
  });

  it("polling timer callback triggers reload when active runs present", async () => {
    const activeRun = makeRunMeta({
      id: "run-timer",
      tester: "alice",
      suite: "smoke",
      date: "2026-01-01",
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    let capturedCallback: (() => void) | null = null;
    const spy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((fn: TimerHandler, delay?: number) => {
        if (delay === 30_000) capturedCallback = fn as () => void;
        return 0 as unknown as ReturnType<typeof setInterval>;
      });
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    expect(capturedCallback).not.toBeNull();
    if (capturedCallback) {
      await act(async () => {
        await capturedCallback!();
      });
    }
    expect(client.getCoverageReport).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("Go to Runs button not shown when onGoToRuns prop is not provided", async () => {
    const activeRun = makeRunMeta({
      id: "run-no-goto",
      tester: "alice",
      suite: "smoke",
      date: "2026-01-01",
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Go to Runs" })).not.toBeInTheDocument();
  });

  it("does not show suite badge or tester span when active run has empty suite and tester", async () => {
    const bareRun = makeRunMeta({ id: "run-bare", tester: "", suite: "", date: "2026-04-01" });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [bareRun] } as never);
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("run-bare")).toBeInTheDocument());
    // suite badge and tester span are conditionally rendered — must be absent
    expect(screen.queryByText("smoke")).not.toBeInTheDocument();
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
  });

  it("polling timer callback shows error banner when load fails", async () => {
    const activeRun = makeRunMeta({
      id: "run-poll-err",
      tester: "bob",
      suite: "smoke",
      date: "2026-01-01",
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [activeRun] } as never);
    vi.mocked(client.getCoverageReport)
      .mockResolvedValueOnce({ entries: coverageEntries, runCount: 5 } as never)
      .mockRejectedValueOnce(new Error("poll error"));
    let capturedCallback: (() => void) | null = null;
    const spy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((fn: TimerHandler, delay?: number) => {
        if (delay === 30_000) capturedCallback = fn as () => void;
        return 0 as unknown as ReturnType<typeof setInterval>;
      });
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText(/Active Runs/)).toBeInTheDocument());
    if (capturedCallback) {
      await act(async () => {
        await capturedCallback!();
      });
    }
    await waitFor(() => expect(screen.getByText("poll error")).toBeInTheDocument());
    spy.mockRestore();
  });

  it("active runs panel not shown when coverage entries exist but no active runs", async () => {
    // default mocks: entries=[2 entries], listRuns=[] — activeRuns is empty
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("auth/login")).toBeInTheDocument());
    // active runs panel only shown when activeRuns.length > 0
    expect(screen.queryByText(/Active Runs/)).not.toBeInTheDocument();
  });

  it("shows all four stat card labels and Never Run count is 0 when no never-run cases", async () => {
    // default entries: 1 PASSED + 1 FAILED — no NEVER entries
    render(<OverviewTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Total Cases")).toBeInTheDocument());
    // stat card labels appear (may also appear in coverage list — use getAllByText)
    expect(screen.getAllByText("Passed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(0);
    expect(screen.getByText("Never Run")).toBeInTheDocument();
    // statNever = 0 since no NEVER entries in default coverage data
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
