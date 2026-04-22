import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import RunsTab from "./RunsTab";
import { client } from "@/client";
import type { Case, RunMeta, CaseResult } from "@/gen/ameliso/v1/types_pb";
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

  it("creates run with inline cases when cases field is filled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "inline");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Inline cases (optional, comma-separated paths)" }),
      "auth/login, billing/checkout"
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith(
        expect.objectContaining({ cases: ["auth/login", "billing/checkout"] })
      )
    );
  });

  it("adds new run to list from createRun response without re-fetching", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [] }));
    const newRun = makeRunMeta({ id: "2026-01-02-smoke", suite: "smoke", status: RunStatus.IN_PROGRESS });
    vi.mocked(client.createRun).mockResolvedValue(makeCreateRunResponse({ run: newRun }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("No runs found."));
    await userEvent.click(screen.getByText("+ New Run"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "smoke");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() => expect(screen.getByText(newRun.id)).toBeInTheDocument());
    expect(client.listRuns).toHaveBeenCalledTimes(1);
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

  it("filters runs by Completed status", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Completed"));
    await userEvent.click(screen.getByText("Completed"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.COMPLETED })
      )
    );
  });

  it("filters runs by Aborted status", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Aborted"));
    await userEvent.click(screen.getByText("Aborted"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.ABORTED })
      )
    );
  });

  it("switches back to All filter after selecting In Progress", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("In Progress"));
    await userEvent.click(screen.getByText("In Progress"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.IN_PROGRESS })
      )
    );
    await userEvent.click(screen.getByText("All"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.UNSPECIFIED })
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

  it("discards stale getCase response when Record is cancelled before body resolves", async () => {
    let resolve!: (v: ReturnType<typeof makeGetCaseResponse>) => void;
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getCase).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res as typeof resolve;
        }) as ReturnType<typeof client.getCase>
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText(mockRun.id));
    await userEvent.click(screen.getByText(mockRun.id));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    // Cancel the record form before body resolves
    await userEvent.click(screen.getByText("Cancel"));
    // Now resolve stale body — must not show it
    resolve(makeGetCaseResponse({ case: mockCase, body: "## Stale Steps" }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(/Stale Steps/)).not.toBeInTheDocument();
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

  it("removes run from list after finalize when status filter no longer matches", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.finalizeRun).mockResolvedValue(
      makeFinalizeRunResponse({ run: makeRunMeta({ ...mockRun, status: RunStatus.COMPLETED }) })
    );
    render(
      <RunsTab
        repoId="owner/repo"
        initialStatusFilter={RunStatus.IN_PROGRESS}
        onStatusFilterChange={() => {}}
      />
    );
    await waitFor(() => screen.getByText(mockRun.id));
    await userEvent.click(screen.getByText(mockRun.id));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    await waitFor(() => screen.getByText("Complete?"));
    await userEvent.click(
      screen.getByRole("button", { name: `Confirm complete run ${mockRun.id}` })
    );
    await waitFor(() => expect(screen.queryByText(mockRun.id)).not.toBeInTheDocument());
    expect(client.listRuns).toHaveBeenCalledTimes(1);
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

  it("removes run from list after deleteRun without re-fetching", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete 2026-01-01-smoke" }));
    await waitFor(() => expect(screen.queryByText(mockRun.id)).not.toBeInTheDocument());
    expect(client.listRuns).toHaveBeenCalledTimes(1);
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

  it("shows no results when getRun returns undefined run field for completed run", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({ run: undefined } as never);
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

    await userEvent.selectOptions(statusSelect, "Skipped");
    const skippedInput = screen.getByPlaceholderText("Optional notes…");
    expect(skippedInput).not.toBeRequired();
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

  it("notes label shows error class for Failed and normal class for Passed", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    const statusSelect = screen.getByDisplayValue("Passed");

    await userEvent.selectOptions(statusSelect, "Failed");
    const errLabel = screen.getByText(/Notes \*/).closest("label");
    expect(errLabel?.className).toContain("labelSmErr");

    await userEvent.selectOptions(statusSelect, "Passed");
    const normalLabel = screen.getByText("Notes").closest("label");
    expect(normalLabel?.className).not.toContain("labelSmErr");
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

  it("does not crash when initialSuite is provided without onInitialSuiteConsumed", async () => {
    render(<RunsTab repoId="owner/repo" initialSuite="smoke" />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument()
    );
    const suiteInput = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLInputElement).value === "smoke");
    expect(suiteInput).toBeDefined();
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

  it('shows "Marking…" on All Passed button while bulk record in progress', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    let resolve: (v: unknown) => void;
    vi.mocked(client.bulkRecordResults).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
    await waitFor(() => screen.getByRole("button", { name: /Confirm pass all/ }));
    await userEvent.click(screen.getByRole("button", { name: /Confirm pass all/ }));
    expect(screen.getByText("Marking…")).toBeInTheDocument();
    resolve!({ results: [], pendingCount: 0, totalInScope: 1 });
    await waitFor(() => expect(screen.queryByText("Marking…")).not.toBeInTheDocument());
  });

  it('shows "Creating…" on Create Run button while run creation in progress', async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.createRun).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    await waitFor(() => screen.getByRole("heading", { name: "Create Run" }));
    await userEvent.type(screen.getAllByRole("textbox")[0]!, "2026-01-15-smoke");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    expect(screen.getByText("Creating…")).toBeInTheDocument();
    resolve!({ run: mockRun, dirPath: "runs/2026-01-01-smoke" });
    await waitFor(() => expect(screen.queryByText("Creating…")).not.toBeInTheDocument());
  });

  it('shows "Saving…" on Save Result button while recording result', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    let resolve: (v: unknown) => void;
    vi.mocked(client.recordResult).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Save Result"));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    resolve!({ result: undefined });
    await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());
  });

  it('shows "Loading…" while pending cases are loading after run expanded', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    let resolve: (v: unknown) => void;
    vi.mocked(client.getPendingCases).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0));
    resolve!({ cases: [mockCase], totalInScope: 1 });
    await waitFor(() => expect(screen.queryAllByText("Loading…").length).toBe(0));
  });

  it('shows "Loading steps…" while case body is loading in record form', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    let resolve: (v: unknown) => void;
    vi.mocked(client.getCase).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(screen.getByText("Loading steps…")).toBeInTheDocument());
    resolve!({ case: mockCase, body: "## Steps" });
    await waitFor(() => expect(screen.queryByText("Loading steps…")).not.toBeInTheDocument());
  });

  it("shows progress bar text when totalInScope > 0 and some cases pending", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      cases: [mockCase],
      totalInScope: 3,
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("2 / 3 done")).toBeInTheDocument());
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("does not auto-expand when createRun returns no run field", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.createRun).mockResolvedValue({ run: undefined } as never);
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0]!, "smoke-3");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() => expect(client.createRun).toHaveBeenCalled());
    // getPendingCases should NOT be called — no auto-expand
    expect(client.getPendingCases).not.toHaveBeenCalled();
  });

  it("shows suite badge, tester, and environment in run card", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("smoke")).toBeInTheDocument());
    expect(screen.getByText("alice")).toBeInTheDocument();
    expect(screen.getByText("staging")).toBeInTheDocument();
  });

  it("does not show Record button for completed run", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [] },
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
    expect(screen.queryByText("Record")).not.toBeInTheDocument();
  });

  it("does not show suite/tester/environment labels when run fields are empty", async () => {
    const bareRun = {
      ...mockRun,
      suite: "",
      tester: "",
      environment: "",
    } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [bareRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    // suite/tester/environment spans should not be rendered
    expect(screen.queryByText("smoke")).not.toBeInTheDocument();
    expect(screen.queryByText("alice")).not.toBeInTheDocument();
    expect(screen.queryByText("staging")).not.toBeInTheDocument();
  });

  it("hides body section in record form when case has no body", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: "" } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(screen.getByText("Save Result")).toBeInTheDocument());
    // Body section is hidden when body is empty; "Loading steps…" never appears
    expect(screen.queryByText("Loading steps…")).not.toBeInTheDocument();
  });

  it("renders case body markdown when record form opened and body is loaded", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getCase).mockResolvedValue({
      case: mockCase,
      body: "## Steps\n\n1. Login",
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    // MarkdownBody renders "## Steps" as an <h2> — wait for the heading to appear
    await waitFor(() => expect(screen.getByRole("heading", { name: "Steps" })).toBeInTheDocument());
  });

  it("does not show notes span in result row when notes is empty", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    const emptyNotesResult = {
      casePath: "auth/login",
      status: ResultStatus.PASSED,
      notes: "",
    } as unknown as CaseResult;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [emptyNotesResult] },
    } as never);
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("auth/login")).toBeInTheDocument());
    // notes span is conditionally rendered — must be absent when notes is ""
    expect(screen.queryByText("looks good")).not.toBeInTheDocument();
  });

  it("does not show progress bar when totalInScope is 0", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      cases: [],
      totalInScope: 0,
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() =>
      expect(screen.getByText("All cases have results recorded.")).toBeInTheDocument()
    );
    // progress bar text is only shown when totalInScope > 0
    expect(screen.queryByText(/\d+ \/ \d+ done/)).not.toBeInTheDocument();
  });

  it("does not show title span when result casePath has no matching case in caseTitleMap", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    const unknownPathResult = {
      casePath: "auth/unknown-path",
      status: ResultStatus.PASSED,
      notes: "",
    } as unknown as CaseResult;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [unknownPathResult] },
    } as never);
    // listCases returns mockCase (auth/login) — no match for auth/unknown-path
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("auth/unknown-path")).toBeInTheDocument());
    // "User Login" belongs to auth/login — should NOT appear for auth/unknown-path result
    expect(screen.queryByText("User Login")).not.toBeInTheDocument();
  });

  it("does not render notes element when result notes is empty", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    const emptyNotesResult = {
      casePath: "auth/login",
      status: ResultStatus.PASSED,
      notes: "",
    } as unknown as CaseResult;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [emptyNotesResult] },
    } as never);
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("Passed")).toBeInTheDocument());
    // The notes conditional `{r.notes && ...}` must not render any italic span when notes is "".
    const italicSpans = document.querySelectorAll("span[style*='italic']");
    expect(italicSpans).toHaveLength(0);
  });

  it("cancels Create Run form when Cancel button clicked on toggle", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("heading", { name: "Create Run" })).not.toBeInTheDocument();
    expect(screen.getByText("+ New Run")).toBeInTheDocument();
  });

  it("shows inline confirmation when All Passed button clicked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      cases: [mockCase],
      totalInScope: 1,
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("All Passed (1)"));
    await userEvent.click(screen.getByText("All Passed (1)"));
    await waitFor(() => expect(screen.getByText("Pass all?")).toBeInTheDocument());
  });

  it("filters results by Failed status and clicking same button deactivates filter", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    const failedResult = {
      casePath: "auth/login",
      status: ResultStatus.FAILED,
      notes: "broken",
    } as unknown as CaseResult;
    const passedResult = {
      casePath: "auth/logout",
      status: ResultStatus.PASSED,
      notes: "",
    } as unknown as CaseResult;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [failedResult, passedResult] },
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("1 Failed"));
    // Filter by Failed — Passed result should be hidden
    await userEvent.click(screen.getByText("1 Failed"));
    await waitFor(() => expect(screen.getByText("Show all")).toBeInTheDocument());
    expect(screen.queryByText("auth/logout")).not.toBeInTheDocument();
    // Click Failed again — filter toggles off, Passed result shows again
    await userEvent.click(screen.getByText("1 Failed"));
    await waitFor(() => expect(screen.queryByText("Show all")).not.toBeInTheDocument());
    expect(screen.getByText("auth/logout")).toBeInTheDocument();
  });

  it("does not call createRun when create form submitted with empty slug", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("+ New Run"));
    await userEvent.click(screen.getByText("+ New Run"));
    // fireEvent bypasses HTML5 required validation — triggers guard: !newSlug
    fireEvent.submit(screen.getByRole("button", { name: "Create Run" }).closest("form")!);
    expect(client.createRun).not.toHaveBeenCalled();
  });

  it("shows Rename button for each run", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    expect(screen.getByRole("button", { name: "Rename 2026-01-01-smoke" })).toBeInTheDocument();
  });

  it("shows rename form when Rename clicked and calls updateRun on submit", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.updateRun).mockResolvedValue({
      run: { ...mockRun, id: "2026-01-01-smoke-v2" },
      newDirPath: "runs/2026-01-01-smoke-v2",
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    const slugInput = screen.getByRole("textbox", { name: "New slug" }) as HTMLInputElement;
    await userEvent.type(slugInput, "smoke-v2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(client.updateRun).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: "owner/repo",
          runId: "2026-01-01-smoke",
          newSlug: "smoke-v2",
        })
      )
    );
  });

  it("cancels rename form without calling updateRun when Cancel clicked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    await waitFor(() => screen.getByRole("textbox", { name: "New slug" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(client.updateRun).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "New slug" })).not.toBeInTheDocument();
  });

  it("cancels rename form on Escape key", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    await waitFor(() => screen.getByRole("textbox", { name: "New slug" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "New slug" })).not.toBeInTheDocument();
  });

  it("shows error when updateRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.updateRun).mockRejectedValue(new Error("rename failed"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Rename 2026-01-01-smoke" }));
    const slugInput = screen.getByRole("textbox", { name: "New slug" });
    await userEvent.type(slugInput, "bad");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByText("rename failed")).toBeInTheDocument());
  });

  it("shows recorded results section when in-progress run has results", async () => {
    const result = makeCaseResult({ casePath: "auth/login", status: ResultStatus.PASSED });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: mockRun, results: [result] },
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("Recorded (1)")).toBeInTheDocument());
    expect(screen.getAllByText("Passed").length).toBeGreaterThan(0);
  });

  it("shows case title in recorded results when caseTitleMap has matching case", async () => {
    const result = makeCaseResult({ casePath: "auth/login", status: ResultStatus.PASSED });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: mockRun, results: [result] },
    } as never);
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("Recorded (1)")).toBeInTheDocument());
    expect(screen.getAllByText("User Login").length).toBeGreaterThan(0);
  });

  it("calls getRun and listCases when in-progress run is expanded", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() =>
      expect(client.getRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
    expect(client.listCases).toHaveBeenCalledWith(
      expect.objectContaining({ repoId: "owner/repo" })
    );
  });

  it("updates recorded results section after recording a result", async () => {
    const result = makeCaseResult({
      casePath: "auth/login",
      status: ResultStatus.FAILED,
      notes: "error",
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getRun)
      .mockResolvedValueOnce({ run: { meta: mockRun, results: [] } } as never)
      .mockResolvedValueOnce({ run: { meta: mockRun, results: [result] } } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Save Result"));
    await waitFor(() => expect(screen.getByText("Recorded (1)")).toBeInTheDocument());
  });

  it("updates recorded results after bulk pass", async () => {
    const result = makeCaseResult({ casePath: "auth/login", status: ResultStatus.PASSED });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getRun)
      .mockResolvedValueOnce({ run: { meta: mockRun, results: [] } } as never)
      .mockResolvedValueOnce({ run: { meta: mockRun, results: [result] } } as never);
    vi.mocked(client.bulkRecordResults).mockResolvedValue({
      results: [result],
      pendingCount: 0,
      totalInScope: 1,
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByRole("button", { name: /All Passed/ }));
    await userEvent.click(screen.getByRole("button", { name: /All Passed/ }));
    await waitFor(() =>
      screen.getByRole("button", {
        name: `Confirm pass all 1 pending case`,
      })
    );
    await userEvent.click(screen.getByRole("button", { name: `Confirm pass all 1 pending case` }));
    await waitFor(() => expect(screen.getByText("Recorded (1)")).toBeInTheDocument());
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

  it("sets aria-busy on expanded panel while pending cases load", async () => {
    let resolve!: (v: ReturnType<typeof makeGetPendingCasesResponse>) => void;
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.getPendingCases).mockImplementationOnce(
      () =>
        new Promise((res) => {
          resolve = res as typeof resolve;
        }) as ReturnType<typeof client.getPendingCases>
    );
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText(mockRun.id));
    await userEvent.click(screen.getByText(mockRun.id));
    await waitFor(() => {
      expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    });
    resolve(makeGetPendingCasesResponse({ cases: [mockCase], totalInScope: 1 }));
    await waitFor(() => screen.getByText("auth/login"));
  });
});
