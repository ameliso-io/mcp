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

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mockRun = makeRunMeta({ tester: "alice", environment: "staging" });

const mockCase = makeCase({
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  body: "## Steps\n\n1. Login",
});

function pendingOf(...cases: Case[]) {
  return cases.map((c) => ({ case: c, latestStatus: ResultStatus.NEVER, body: c.body }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse());
  vi.mocked(client.createRun).mockResolvedValue(
    makeCreateRunResponse({ run: mockRun, dirPath: ".ameliso/runs/2026-01-01-smoke" })
  );
  vi.mocked(client.getPendingCases).mockResolvedValue(
    makeGetPendingCasesResponse({
      pending: [{ case: mockCase, latestStatus: 0, body: "" }],
      totalInScope: 1,
    })
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
    makeDeleteRunResponse({ dirPath: ".ameliso/runs/2026-01-01-smoke" })
  );
});

describe("RunsTab", () => {
  it("shows empty runs list", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => expect(screen.getByText("No runs found.")).toBeInTheDocument());
  });

  it("shows runs from list", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => expect(screen.getByText("2026-01-01-smoke")).toBeInTheDocument());
  });

  it("opens create form when New Run clicked", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument();
  });

  it("does not create run when slug is empty", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    // Leave Slug empty — guard at top of handleCreate fires
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    expect(client.createRun).not.toHaveBeenCalled();
  });

  it("pre-fills suite when initialSuite provided", async () => {
    render(
      <RunsTab
        repoId="owner/repo"
        basePath="/repositories/owner/repo"
        initialSuite="smoke"
        onInitialSuiteConsumed={() => {}}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument()
    );
    expect(
      (screen.getByRole("textbox", { name: "Suite (optional)" }) as HTMLInputElement).value
    ).toBe("smoke");
  });

  it("creates run and auto-expands on submit", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    const newRun = makeRunMeta({
      id: "2026-01-02-smoke",
      suite: "smoke",
      status: RunStatus.IN_PROGRESS,
    });
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
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("No runs found."));
    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
  });

  it("status filter group has aria-label and All is pressed by default", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("No runs found."));
    expect(screen.getByRole("group", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "In Progress" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("filters runs by status", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await userEvent.click(screen.getByText("In Progress"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.IN_PROGRESS }),
        expect.anything()
      )
    );
  });

  it("filters runs by Completed status", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("Completed"));
    await userEvent.click(screen.getByText("Completed"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.COMPLETED }),
        expect.anything()
      )
    );
  });

  it("filters runs by Aborted status", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("Aborted"));
    await userEvent.click(screen.getByText("Aborted"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.ABORTED }),
        expect.anything()
      )
    );
  });

  it("switches back to All filter after selecting In Progress", async () => {
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("In Progress"));
    await userEvent.click(screen.getByText("In Progress"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.IN_PROGRESS }),
        expect.anything()
      )
    );
    await userEvent.click(screen.getByText("All"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.UNSPECIFIED }),
        expect.anything()
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
    render(
      <RunsTab
        repoId="owner/repo"
        basePath="/repositories/owner/repo"
        onStatusFilterChange={onStatusFilterChange}
      />
    );
    await waitFor(() => screen.getByText("No runs found."));
    await userEvent.click(screen.getByRole("button", { name: "Completed" }));
    expect(onStatusFilterChange).toHaveBeenCalledWith(RunStatus.COMPLETED);
  });

  it("initializes statusFilter from initialStatusFilter prop", async () => {
    render(
      <RunsTab
        repoId="owner/repo"
        basePath="/repositories/owner/repo"
        initialStatusFilter={RunStatus.ABORTED}
      />
    );
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: RunStatus.ABORTED }),
        expect.anything()
      )
    );
    expect(screen.getByRole("button", { name: "Aborted" })).toHaveAttribute("aria-pressed", "true");
  });

  it("expands in-progress run and shows pending cases", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(screen.getByText("Save Result")).toBeInTheDocument());
    expect(client.getCase).not.toHaveBeenCalled();
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      pending: pendingOf(mockCase, case2),
      totalInScope: 2,
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.bulkRecordResults).mockResolvedValue({
      results: [],
      pendingCount: 0,
      totalInScope: 1,
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
      cases: [],
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
      cases: [mockCase],
    } as never);
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
      cases: [],
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => expect(screen.getByText("fetch error")).toBeInTheDocument());
  });

  it('shows "No results recorded" for completed run with empty results', async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [] },
      cases: [],
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows no results when getRun returns undefined run field for completed run", async () => {
    const completedRun = { ...mockRun, status: RunStatus.COMPLETED } as unknown as RunMeta;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({ run: undefined } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows error when deleteRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.deleteRun).mockRejectedValue(new Error("delete error"));
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete 2026-01-01-smoke" }));
    await waitFor(() => expect(screen.getByText("delete error")).toBeInTheDocument());
  });

  it("shows progressbar with aria-valuetext for completion progress", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      pending: pendingOf(mockCase),
      totalInScope: 3,
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByRole("progressbar"));
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(bar).toHaveAttribute("aria-valuenow", "2");
    expect(bar).toHaveAttribute("aria-valuetext", "2 of 3 cases complete");
  });

  it('shows "all cases recorded" message when pending is empty', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({ cases: [], totalInScope: 1 } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() =>
      expect(screen.getByText("All cases have results recorded.")).toBeInTheDocument()
    );
  });

  it("shows error when createRun fails", async () => {
    vi.mocked(client.createRun).mockRejectedValue(new Error("create error"));
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "smoke");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() => expect(screen.getByText("create error")).toBeInTheDocument());
  });

  it("shows error when handleBulkPass fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.bulkRecordResults).mockRejectedValue(new Error("bulk error"));
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
    await waitFor(() => screen.getByText("Pass all?"));
    await userEvent.click(screen.getByRole("button", { name: /Confirm pass all/ }));
    await waitFor(() => expect(screen.getByText("bulk error")).toBeInTheDocument());
  });

  it("collapses selected run when it is deleted", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText("Save Result")).not.toBeInTheDocument());
  });

  it("collapses expanded run when clicked again", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.queryByText("Record")).not.toBeInTheDocument());
  });

  it("shows error when recordResult fails in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.recordResult).mockRejectedValue(new Error("record error"));
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => screen.getByText("Save Result"));
    await userEvent.click(screen.getByText("Save Result"));
    await waitFor(() => expect(screen.getByText("record error")).toBeInTheDocument());
  });

  it("shows correct placeholder for BLOCKED status in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("select error")).toBeInTheDocument());
  });

  it("shows error when finalizeRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue(makeListRunsResponse({ runs: [mockRun] }));
    vi.mocked(client.finalizeRun).mockRejectedValue(new Error("finalize failed"));
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    expect(screen.getByText("Save Result")).toBeInTheDocument();
    expect(client.getCase).not.toHaveBeenCalled();
  });

  it("handles getRun response with no results field", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({ run: { meta: completedRun } } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows no case body in record form when case body is empty string", async () => {
    const noBodyCase = makeCase({ path: "auth/login", title: "User Login", body: "" });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: "" } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    expect(screen.getByText("Save Result")).toBeInTheDocument();
    expect(client.getCase).not.toHaveBeenCalled();
  });

  it("does not call bulkRecordResults when bulk pass inline confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      pending: pendingOf(mockCase, mockCase2 as unknown as Case),
      totalInScope: 2,
    } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
    await waitFor(() => screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" }));
    await waitFor(() => screen.getByText("Delete?"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(client.deleteRun).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete 2026-01-01-smoke" })).toBeInTheDocument();
  });

  it("shows Blocked styling and placeholder in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" basePath="/repositories/owner/repo" />);
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
});
