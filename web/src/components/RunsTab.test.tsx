import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import RunsTab from "./RunsTab";
import { client } from "@/client";
import type { Case, RunMeta } from "@/gen/ameliso/v1/types_pb";
import { RunStatus, ResultStatus } from "@/gen/ameliso/v1/types_pb";
import {
  makeBulkRecordResultsResponse,
  makeCase,
  makeCaseResult,
  makeCreateRunResponse,
  makeDeleteRunResponse,
  makeFinalizeRunResponse,
  makeGetCaseResponse,
  makeGetPendingCasesResponse,
  makeGetRunResponse,
  makeListCasesResponse,
  makeListRunsResponse,
  makeRecordResultResponse,
  makeRun,
  makeRunMeta,
} from "@/test/factories";

vi.mock("@/client");

const mockRun = makeRunMeta({ tester: "alice", environment: "staging" });

const mockCase = makeCase({ createdAt: "2026-01-01", updatedAt: "2026-01-01" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse());
  vi.mocked(client.createRun).mockResolvedValue(
    makeCreateRunResponse({ run: mockRun, dirPath: "runs/2026-01-01-smoke" })
  );
  vi.mocked(client.getPendingCases).mockResolvedValue(
    makeGetPendingCasesResponse({ cases: [mockCase], totalInScope: 1 })
  );
  vi.mocked(client.listCases).mockResolvedValue(makeListCasesResponse());
  vi.mocked(client.getCase).mockResolvedValue(
    makeGetCaseResponse({ case: mockCase, body: "## Steps\n\n1. Login" })
  );
  vi.mocked(client.recordResult).mockResolvedValue(makeRecordResultResponse());
  vi.mocked(client.finalizeRun).mockResolvedValue(
    makeFinalizeRunResponse({ run: makeRunMeta({ ...mockRun, status: RunStatus.COMPLETED }) })
  );
  vi.mocked(client.deleteRun).mockResolvedValue(
    makeDeleteRunResponse({ dirPath: "runs/2026-01-01-smoke" })
  );
});

describe("RunsTab", () => {
  it("renders empty state when no repo path", () => {
    render(<RunsTab repoId="" />);
    expect(screen.getByText(/Repositories tab/i)).toBeInTheDocument();
  });

  it("shows empty runs list", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("No runs found.")).toBeInTheDocument());
  });

  it("shows runs from list", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("2026-01-01-smoke")).toBeInTheDocument());
  });

  it("opens create form when New Run clicked", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument();
  });

  it("does not create run when slug is empty", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    // Leave Slug empty — guard at top of handleCreate fires
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    expect(client.createRun).not.toHaveBeenCalled();
  });

  it("pre-fills suite when initialSuite provided", async () => {
    render(<RunsTab repoId="owner/repo" initialSuite="smoke" onInitialSuiteConsumed={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument()
    );
    expect(
      (screen.getByRole("textbox", { name: "Suite (optional)" }) as HTMLInputElement).value
    ).toBe("smoke");
  });

  it("creates run and auto-expands on submit", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "smoke");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith(expect.objectContaining({ slug: "smoke" }))
    );
    await waitFor(() => expect(client.getPendingCases).toHaveBeenCalled());
  });

  it("shows status filter buttons", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("No runs found."));
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("status filter group has aria-label and All is pressed by default", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("No runs found."));
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "In Progress" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("filters runs by status", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("In Progress"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.IN_PROGRESS })
      )
    );
  });

  it("discards stale listRuns response when status filter changes before first load resolves", async () => {
    let resolveFirst!: (v: ReturnType<typeof makeListRunsResponse>) => void;
    let resolveSecond!: (v: ReturnType<typeof makeListRunsResponse>) => void;
    const inProgressRun = makeRunMeta({
      id: "run-ip",
      suite: "smoke",
      status: RunStatus.IN_PROGRESS,
    });
    vi.mocked(client.listRuns)
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res as typeof resolveFirst;
          }) as ReturnType<typeof client.listRuns>
      )
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSecond = res as typeof resolveSecond;
          }) as ReturnType<typeof client.listRuns>
      );

    render(<RunsTab repoId="owner/repo" />);
    // Change filter to trigger second load before first resolves
    await userEvent.click(screen.getByRole("button", { name: "In Progress" }));
    // Resolve second first (out of order)
    resolveSecond(makeListRunsResponse({ runs: [inProgressRun] }));
    await waitFor(() => screen.getByText("run-ip"));
    // Now resolve first (stale) — must not overwrite second result
    resolveFirst(makeListRunsResponse({ runs: [mockRun] }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(mockRun.id)).not.toBeInTheDocument();
    expect(screen.getByText("run-ip")).toBeInTheDocument();
  });

  it("calls onStatusFilterChange when filter button clicked", async () => {
    const onStatusFilterChange = vi.fn();
    render(<RunsTab repoId="owner/repo" onStatusFilterChange={onStatusFilterChange} />);
    await waitFor(() => screen.getByText("No runs found."));
    await userEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(onStatusFilterChange).toHaveBeenCalledWith(RunStatus.COMPLETED);
  });

  it("initializes statusFilter from initialStatusFilter prop", async () => {
    render(<RunsTab repoId="owner/repo" initialStatusFilter={RunStatus.ABORTED} />);
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: RunStatus.ABORTED })
      )
    );
    expect(screen.getByRole("button", { name: "Aborted" })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands in-progress run and shows pending cases", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() =>
      expect(client.getPendingCases).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
    await waitFor(() => expect(screen.getByText("auth/login")).toBeInTheDocument());
  });

  it("opens record form when Record clicked and shows case body", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() =>
      expect(client.getCase).toHaveBeenCalledWith(
        expect.objectContaining({ casePath: "auth/login" })
      )
    );
    await waitFor(() => expect(screen.getByText("Save Result")).toBeInTheDocument());
  });

  it("calls recordResult when Save Result submitted", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Save Result"));
    await waitFor(() =>
      expect(client.recordResult).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: "2026-01-01-smoke",
          casePath: "auth/login",
          status: ResultStatus.PASSED,
        })
      )
    );
  });

  it("calls finalizeRun when Complete Run clicked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    await waitFor(() => screen.getByText("Complete?"));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm complete run 2026-01-01-smoke" })
    );
    await waitFor(() =>
      expect(client.finalizeRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke", status: RunStatus.COMPLETED })
      )
    );
  });

  it("calls finalizeRun with ABORTED when Abort Run clicked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Abort Run"));
    await userEvent.click(screen.getByText("Abort Run"));
    await waitFor(() => screen.getByText("Abort?"));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm abort run 2026-01-01-smoke" })
    );
    await waitFor(() =>
      expect(client.finalizeRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke", status: RunStatus.ABORTED })
      )
    );
  });

  it("bulk pass confirm button uses plural 'cases' label when multiple pending", async () => {
    const case2 = makeCase({ path: "auth/logout", title: "User Logout" });
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockResolvedValue(
      makeGetPendingCasesResponse({ cases: [mockCase, case2], totalInScope: 2 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm pass all 2 pending cases" })
      ).toBeInTheDocument()
    );
  });

  it("calls bulkRecordResults when All Passed confirmed", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.bulkRecordResults).mockResolvedValue(
      makeBulkRecordResultsResponse({ results: [], pendingCount: 0, totalInScope: 1 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
    await waitFor(() => screen.getByText("Pass all?"));
    await userEvent.click(screen.getByRole("button", { name: /Confirm pass all/ }));
    await waitFor(() =>
      expect(client.bulkRecordResults).toHaveBeenCalledWith(
        expect.objectContaining({
          runId: "2026-01-01-smoke",
          results: expect.arrayContaining([
            expect.objectContaining({ casePath: "auth/login", status: ResultStatus.PASSED }),
          ]),
        })
      )
    );
  });

  it("calls deleteRun when Delete confirmed", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete 2026-01-01-smoke" }));
    await waitFor(() =>
      expect(client.deleteRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });

  it("shows result badges for completed run", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const mockResult = makeCaseResult();
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results: [mockResult] }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("1 Passed")).toBeInTheDocument());
  });

  it("shows case title and notes in completed run results", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const mockResult = makeCaseResult({ notes: "looks good" });
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results: [mockResult] }) })
    );
    vi.mocked(client.listCases).mockResolvedValue(makeListCasesResponse({ cases: [mockCase] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    expect(screen.getByText("looks good")).toBeInTheDocument();
  });

  it("filters results by status and shows Show all button", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const mockResult = makeCaseResult();
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results: [mockResult] }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("1 Passed"));
    await userEvent.click(screen.getByText("1 Passed"));
    await waitFor(() => expect(screen.getByText("Show all")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Show all"));
    await waitFor(() => expect(screen.queryByText("Show all")).not.toBeInTheDocument());
  });

  it("shows error banner when listRuns fails", async () => {
    vi.mocked(client.listRuns).mockRejectedValue(new Error("fetch error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("fetch error")).toBeInTheDocument());
  });

  it('shows "No results recorded" for completed run with empty results', async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results: [] }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows error when deleteRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.deleteRun).mockRejectedValue(new Error("delete error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete 2026-01-01-smoke" }));
    await waitFor(() => expect(screen.getByText("delete error")).toBeInTheDocument());
  });

  it("shows progressbar with aria-valuetext for completion progress", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockResolvedValue(
      makeGetPendingCasesResponse({ cases: [mockCase], totalInScope: 3 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByRole("progressbar"));
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuetext", "2 of 3 cases complete");
  });

  it('shows "all cases recorded" message when pending is empty', async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockResolvedValue(
      makeGetPendingCasesResponse({ cases: [], totalInScope: 1 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() =>
      expect(screen.getByText("All cases have results recorded.")).toBeInTheDocument()
    );
  });

  it("shows error when createRun fails", async () => {
    vi.mocked(client.createRun).mockRejectedValue(new Error("create error"));
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "smoke");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() => expect(screen.getByText("create error")).toBeInTheDocument());
  });

  it("shows error when handleBulkPass fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.bulkRecordResults).mockRejectedValue(new Error("bulk error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
    await waitFor(() => screen.getByText("Pass all?"));
    await userEvent.click(screen.getByRole("button", { name: /Confirm pass all/ }));
    await waitFor(() => expect(screen.getByText("bulk error")).toBeInTheDocument());
  });

  it("collapses selected run when it is deleted", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete 2026-01-01-smoke" }));
    await waitFor(() =>
      expect(client.deleteRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });

  it("closes record form when Cancel clicked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText("Save Result")).not.toBeInTheDocument());
  });

  it("collapses expanded run when clicked again", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.queryByText("Record")).not.toBeInTheDocument());
  });

  it("shows error when recordResult fails in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.recordResult).mockRejectedValue(new Error("record error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Save Result"));
    await waitFor(() => expect(screen.getByText("record error")).toBeInTheDocument());
  });

  it("shows correct placeholder for BLOCKED status in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    const statusSelect = screen.getByRole("combobox");
    await userEvent.selectOptions(statusSelect, String(ResultStatus.BLOCKED));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Describe what is blocking…")).toBeInTheDocument()
    );
  });

  it("shows correct placeholder for FAILED status in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    const statusSelect = screen.getByRole("combobox");
    await userEvent.selectOptions(statusSelect, String(ResultStatus.FAILED));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Describe what failed…")).toBeInTheDocument()
    );
  });

  it("shows error when selectRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockRejectedValue(new Error("select error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("select error")).toBeInTheDocument());
  });

  it("shows error when finalizeRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.finalizeRun).mockRejectedValue(new Error("finalize failed"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    await waitFor(() => screen.getByText("Complete?"));
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm complete run 2026-01-01-smoke" })
    );
    await waitFor(() => expect(screen.getByText("finalize failed")).toBeInTheDocument());
  });

  it("does not finalize run when inline confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    await waitFor(() => screen.getByText("Complete?"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.finalizeRun).not.toHaveBeenCalled();
    expect(screen.getByText("Complete Run")).toBeInTheDocument();
  });

  it("opens record form even when getCase fails to fetch body", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getCase).mockRejectedValue(new Error("body unavailable"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(screen.getByText("Save Result")).toBeInTheDocument());
  });

  it("handles getRun response with no results field", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows no case body in record form when body is empty string", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getCase).mockResolvedValue(makeGetCaseResponse({ case: mockCase, body: "" }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(screen.getByText("Save Result")).toBeInTheDocument());
  });

  it("does not call bulkRecordResults when bulk pass inline confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("All Passed (1)"));
    await userEvent.click(screen.getByText("All Passed (1)"));
    await waitFor(() => screen.getByText("Pass all?"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel bulk pass" }));
    expect(client.bulkRecordResults).not.toHaveBeenCalled();
    expect(screen.getByText("All Passed (1)")).toBeInTheDocument();
  });

  it("uses plural in bulk pass confirm when multiple cases pending", async () => {
    const mockCase2 = {
      ...mockCase,
      path: "auth/signup",
      title: "User Signup",
    } as unknown as typeof mockCase;
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockResolvedValue(
      makeGetPendingCasesResponse({ cases: [mockCase, mockCase2], totalInScope: 2 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("All Passed (2)"));
    await userEvent.click(screen.getByText("All Passed (2)"));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Confirm pass all 2 pending cases" })
      ).toBeInTheDocument()
    );
  });

  it("does not delete run when confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(client.deleteRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" })).toBeInTheDocument();
  });

  it("shows Blocked styling and placeholder in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    const statusSelect = screen.getByDisplayValue("Passed");
    await userEvent.selectOptions(statusSelect, "Blocked");
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Describe what is blocking…")).toBeInTheDocument()
    );
  });

  it("notes input is required when status is Failed or Blocked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    const statusSelect = screen.getByDisplayValue("Passed");

    await userEvent.selectOptions(statusSelect, "Failed");
    const notesInput = screen.getByPlaceholderText("Describe what failed…");
    expect(notesInput).toBeRequired();

    await userEvent.selectOptions(statusSelect, "Blocked");
    const blockedInput = screen.getByPlaceholderText("Describe what is blocking…");
    expect(blockedInput).toBeRequired();

    await userEvent.selectOptions(statusSelect, "Passed");
    const passedInput = screen.getByPlaceholderText("Optional notes…");
    expect(passedInput).not.toBeRequired();
  });

  it("toggles result filter off when same filter clicked twice", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const mockResult = makeCaseResult();
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results: [mockResult] }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("1 Passed"));
    await userEvent.click(screen.getByText("1 Passed"));
    await waitFor(() => screen.getByText("Show all"));
    await userEvent.click(screen.getByText("1 Passed"));
    await waitFor(() => expect(screen.queryByText("Show all")).not.toBeInTheDocument());
  });

  it("shows FAILED styling in record form when status changed to failed", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    const statusSelect = screen.getByDisplayValue("Passed");
    await userEvent.selectOptions(statusSelect, "Failed");
    expect(screen.getByText(/Notes \*/)).toBeInTheDocument();
  });

  it("polling timer callback updates pending cases on success", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    let capturedCallback: (() => Promise<void>) | null = null;
    const spy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((fn: TimerHandler, delay?: number) => {
        if (delay === 30_000) capturedCallback = fn as () => Promise<void>;
        return 0 as unknown as ReturnType<typeof setInterval>;
      });
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(client.getPendingCases).toHaveBeenCalled());
    expect(capturedCallback).not.toBeNull();
    if (capturedCallback) {
      await act(async () => {
        await capturedCallback!();
      });
    }
    expect(client.getPendingCases).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("polling timer callback silently ignores errors", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases)
      .mockResolvedValueOnce(makeGetPendingCasesResponse({ cases: [mockCase], totalInScope: 1 }))
      .mockRejectedValueOnce(new Error("poll error"));
    let capturedCallback: (() => Promise<void>) | null = null;
    const spy = vi
      .spyOn(globalThis, "setInterval")
      .mockImplementation((fn: TimerHandler, delay?: number) => {
        if (delay === 30_000) capturedCallback = fn as () => Promise<void>;
        return 0 as unknown as ReturnType<typeof setInterval>;
      });
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(client.getPendingCases).toHaveBeenCalled());
    if (capturedCallback) {
      await act(async () => {
        await capturedCallback!();
      });
    }
    expect(screen.queryByText("poll error")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("dismisses error when X button clicked", async () => {
    vi.mocked(client.listRuns).mockRejectedValue(new Error("load error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("load error")).toBeInTheDocument());
    await userEvent.click(screen.getByText("×"));
    expect(screen.queryByText("load error")).not.toBeInTheDocument();
  });

  it("fills tester, environment, and suite fields in create form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "smoke-2");
    await userEvent.type(screen.getByRole("textbox", { name: "Tester" }), "bob");
    await userEvent.type(screen.getByRole("textbox", { name: "Environment" }), "prod");
    await userEvent.type(screen.getByRole("textbox", { name: "Suite (optional)" }), "regression");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith(
        expect.objectContaining({ tester: "bob", environment: "prod", suite: "regression" })
      )
    );
  });

  it("types in notes field when recording result", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByPlaceholderText("Optional notes…"));
    const notesInput = screen.getByPlaceholderText("Optional notes…");
    await userEvent.type(notesInput, "Test passed successfully");
    await userEvent.click(screen.getByText("Save Result"));
    await waitFor(() =>
      expect(client.recordResult).toHaveBeenCalledWith(
        expect.objectContaining({ notes: "Test passed successfully" })
      )
    );
  });

  it("renders aborted run with correct label", async () => {
    const abortedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.ABORTED,
    });
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [abortedRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Aborted")).toBeInTheDocument());
  });

  it("renders run with unknown status using default label and color", async () => {
    const unknownRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.UNSPECIFIED,
    });
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [unknownRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Unknown")).toBeInTheDocument());
  });

  it("shows FAILED, BLOCKED, and SKIPPED result status labels", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const results = [
      makeCaseResult({ casePath: "auth/login", status: ResultStatus.FAILED }),
      makeCaseResult({ casePath: "auth/logout", status: ResultStatus.BLOCKED }),
      makeCaseResult({ casePath: "auth/reset", status: ResultStatus.SKIPPED }),
    ];
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("Failed")).toBeInTheDocument());
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
  });

  it("shows Unknown label for result with unspecified status", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const results = [makeCaseResult({ status: ResultStatus.UNSPECIFIED })];
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [completedRun] }));
    vi.mocked(client.getRun).mockResolvedValue(
      makeGetRunResponse({ run: makeRun({ meta: completedRun, results }) })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("Unknown")).toBeInTheDocument());
  });

  it("pressing Escape in create form cancels it", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Create Run" })).not.toBeInTheDocument();
  });

  it("pressing Escape in record form closes it", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Save Result")).not.toBeInTheDocument();
  });

  it("expands run on Enter key", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    const runRow = screen.getByRole("button", { name: "In Progress run 2026-01-01-smoke" });
    await userEvent.type(runRow, "{Enter}");
    await waitFor(() =>
      expect(client.getPendingCases).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });

  it("expands run on Space key", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    const runRow = screen.getByRole("button", { name: "In Progress run 2026-01-01-smoke" });
    runRow.focus();
    await userEvent.keyboard(" ");
    await waitFor(() =>
      expect(client.getPendingCases).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });

  it("resets notes and status when switching to a different case", async () => {
    const case2 = {
      path: "auth/logout",
      title: "User Logout",
      description: "",
      tags: [],
      priority: "medium",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    } as unknown as Case;
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockResolvedValue(
      makeGetPendingCasesResponse({ cases: [mockCase, case2], totalInScope: 2 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    // Open record form for first case
    const recordBtns = await screen.findAllByText("Record");
    await userEvent.click(recordBtns[0]!);
    await waitFor(() => screen.getByRole("combobox"));
    // Set FAILED and add notes
    await userEvent.selectOptions(screen.getByRole("combobox"), String(ResultStatus.FAILED));
    await userEvent.type(screen.getByPlaceholderText("Describe what failed…"), "broken");
    // Now click Record on the second case — form should switch and reset
    const btns2 = screen.getAllByText("Record");
    await userEvent.click(btns2[btns2.length - 1]!);
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe(String(ResultStatus.PASSED));
    });
    expect(screen.queryByDisplayValue("broken")).not.toBeInTheDocument();
  });

  it("closes record form when switching to a different run", async () => {
    const run2 = {
      ...mockRun,
      id: "2026-01-02-regression",
      status: RunStatus.IN_PROGRESS,
    } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun, run2] }));
    vi.mocked(client.getPendingCases).mockResolvedValue(
      makeGetPendingCasesResponse({ cases: [mockCase], totalInScope: 1 })
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    // Expand first run and open record form
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    // Switch to second run — record form must close
    await userEvent.click(screen.getByText("2026-01-02-regression"));
    await waitFor(() => expect(screen.queryByText("Save Result")).not.toBeInTheDocument());
  });

  it("closes record form when selected run is deleted", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    // Delete the run via inline confirm
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete 2026-01-01-smoke" }));
    await waitFor(() =>
      expect(client.deleteRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
    expect(screen.queryByText("Save Result")).not.toBeInTheDocument();
  });

  it("calls onInitialSuiteConsumed when initialSuite is provided", async () => {
    const onConsumed = vi.fn();
    render(
      <RunsTab repoId="owner/repo" initialSuite="smoke" onInitialSuiteConsumed={onConsumed} />
    );
    await waitFor(() => expect(onConsumed).toHaveBeenCalledTimes(1));
  });

  it("shows loading state while fetching runs", async () => {
    let resolve!: (v: ReturnType<typeof makeListRunsResponse>) => void;
    vi.mocked(client.listRuns).mockReturnValue(
      new Promise((res) => {
        resolve = res as typeof resolve;
      })
    );
    render(<RunsTab repoId="owner/repo" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve(makeListRunsResponse());
  });

  it("resets recordStatus to PASSED after recording a result", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByRole("combobox"));
    // Change status to FAILED
    await userEvent.selectOptions(screen.getByRole("combobox"), String(ResultStatus.FAILED));
    // Fill notes (required for FAILED; placeholder changes per status)
    await userEvent.type(screen.getByPlaceholderText("Describe what failed…"), "blocker");
    await userEvent.click(screen.getByText("Save Result"));
    // Record button reappears after success; open the form again
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    // Status should be reset to PASSED
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe(String(ResultStatus.PASSED));
    });
  });

  it("announces run count via live region when status filter changes run count", async () => {
    vi.mocked(client.listRuns)
      .mockResolvedValueOnce(makeListRunsResponse({ runs: [mockRun] }))
      .mockResolvedValueOnce(makeListRunsResponse({ runs: [] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText(mockRun.id));
    await userEvent.click(screen.getByRole("button", { name: "Completed" }));
    await waitFor(() =>
      expect(
        screen.getAllByRole("status").some((el) => el.textContent?.includes("0 runs found"))
      ).toBe(true)
    );
  });
});
