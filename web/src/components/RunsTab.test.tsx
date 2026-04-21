import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import RunsTab from "./RunsTab";
import { client } from "../client";
import { RunStatus, ResultStatus } from "../gen/ameliso/v1/types_pb";
import { makeCase, makeCaseResult, makeRunMeta } from "../test/factories";

vi.mock("../client");

const mockRun = makeRunMeta({ tester: "alice", environment: "staging" });

const mockCase = makeCase({ createdAt: "2026-01-01", updatedAt: "2026-01-01" });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listRuns).mockResolvedValue({ runs: [] } as never);
  vi.mocked(client.createRun).mockResolvedValue({
    run: mockRun,
    dirPath: "runs/2026-01-01-smoke",
  } as never);
  vi.mocked(client.getPendingCases).mockResolvedValue({
    cases: [mockCase],
    totalInScope: 1,
  } as never);
  vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never);
  vi.mocked(client.getCase).mockResolvedValue({
    case: mockCase,
    body: "## Steps\n\n1. Login",
  } as never);
  vi.mocked(client.recordResult).mockResolvedValue({ result: undefined } as never);
  vi.mocked(client.finalizeRun).mockResolvedValue({
    run: { ...mockRun, status: RunStatus.COMPLETED },
  } as never);
  vi.mocked(client.deleteRun).mockResolvedValue({ dirPath: "runs/2026-01-01-smoke" } as never);
});

describe("RunsTab", () => {
  it("renders empty state when no repo path", () => {
    render(<RunsTab repoId="" />);
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument();
  });

  it("shows empty runs list", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("No runs found.")).toBeInTheDocument());
  });

  it("shows runs from list", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("2026-01-01-smoke")).toBeInTheDocument());
  });

  it("opens create form when New Run clicked", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument();
  });

  it("pre-fills suite when initialSuite provided", async () => {
    render(<RunsTab repoId="owner/repo" initialSuite="smoke" onInitialSuiteConsumed={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Create Run" })).toBeInTheDocument()
    );
    const suiteInput = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLInputElement).value === "smoke");
    expect(suiteInput).toBeDefined();
  });

  it("creates run and auto-expands on submit", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "smoke");
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

  it("filters runs by status", async () => {
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("In Progress"));
    await waitFor(() =>
      expect(client.listRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: RunStatus.IN_PROGRESS })
      )
    );
  });

  it("expands in-progress run and shows pending cases", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    await waitFor(() =>
      expect(client.finalizeRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke", status: RunStatus.COMPLETED })
      )
    );
  });

  it("calls finalizeRun with ABORTED when Abort Run clicked", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Abort Run"));
    await userEvent.click(screen.getByText("Abort Run"));
    await waitFor(() =>
      expect(client.finalizeRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke", status: RunStatus.ABORTED })
      )
    );
  });

  it("calls recordResult for each pending case when All Passed clicked", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
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

  it("calls deleteRun when Delete confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
    } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
    } as never);
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
    } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [] },
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows error when deleteRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.deleteRun).mockRejectedValue(new Error("delete error"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(screen.getByText("delete error")).toBeInTheDocument());
  });

  it('shows "all cases recorded" message when pending is empty', async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({ cases: [], totalInScope: 1 } as never);
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
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "smoke");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() => expect(screen.getByText("create error")).toBeInTheDocument());
  });

  it("shows error when handleBulkPass fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.recordResult).mockRejectedValue(new Error("bulk error"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText(/All Passed/));
    await userEvent.click(screen.getByText(/All Passed/));
    await waitFor(() => expect(screen.getByText("bulk error")).toBeInTheDocument());
  });

  it("collapses selected run when it is deleted", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    await waitFor(() =>
      expect(client.deleteRun).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });

  it("closes record form when Cancel clicked", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.queryByText("Record")).not.toBeInTheDocument());
  });

  it("shows error when recordResult fails in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockRejectedValue(new Error("select error"));
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("select error")).toBeInTheDocument());
  });

  it("shows error when finalizeRun fails", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.finalizeRun).mockRejectedValue(new Error("finalize failed"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    await waitFor(() => expect(screen.getByText("finalize failed")).toBeInTheDocument());
  });

  it("does not finalize run when confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Complete Run"));
    await userEvent.click(screen.getByText("Complete Run"));
    expect(client.finalizeRun).not.toHaveBeenCalled();
  });

  it("opens record form even when getCase fails to fetch body", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({ run: { meta: completedRun } } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("No results recorded.")).toBeInTheDocument());
  });

  it("shows no case body in record form when body is empty string", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: "" } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("Record"));
    await userEvent.click(screen.getByText("Record"));
    await waitFor(() => expect(screen.getByText("Save Result")).toBeInTheDocument());
  });

  it("does not call recordResult when bulk pass confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("All Passed (1)"));
    await userEvent.click(screen.getByText("All Passed (1)"));
    expect(client.recordResult).not.toHaveBeenCalled();
  });

  it("uses plural in bulk pass confirm when multiple cases pending", async () => {
    const mockCase2 = {
      ...mockCase,
      path: "auth/signup",
      title: "User Signup",
    } as unknown as typeof mockCase;
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases).mockResolvedValue({
      cases: [mockCase, mockCase2],
      totalInScope: 2,
    } as never);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => screen.getByText("All Passed (2)"));
    await userEvent.click(screen.getByText("All Passed (2)"));
    expect(confirmSpy).toHaveBeenCalledWith("Mark all 2 pending cases as Passed?");
  });

  it("does not delete run when confirm cancelled", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    expect(client.deleteRun).not.toHaveBeenCalled();
  });

  it("shows Blocked styling and placeholder in record form", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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

  it("toggles result filter off when same filter clicked twice", async () => {
    const completedRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.COMPLETED,
    });
    const mockResult = makeCaseResult();
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results: [mockResult] },
    } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    vi.mocked(client.getPendingCases)
      .mockResolvedValueOnce({ cases: [mockCase], totalInScope: 1 } as never)
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Run"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "smoke-2");
    await userEvent.type(inputs[1], "bob");
    await userEvent.type(inputs[2], "prod");
    await userEvent.type(inputs[3], "regression");
    await userEvent.click(screen.getByRole("button", { name: "Create Run" }));
    await waitFor(() =>
      expect(client.createRun).toHaveBeenCalledWith(
        expect.objectContaining({ tester: "bob", environment: "prod", suite: "regression" })
      )
    );
  });

  it("types in notes field when recording result", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [abortedRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Aborted")).toBeInTheDocument());
  });

  it("renders run with unknown status using default label and color", async () => {
    const unknownRun = makeRunMeta({
      tester: "alice",
      environment: "staging",
      status: RunStatus.UNSPECIFIED,
    });
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [unknownRun] } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results },
    } as never);
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
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [completedRun] } as never);
    vi.mocked(client.getRun).mockResolvedValue({
      run: { meta: completedRun, results },
    } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    await userEvent.click(screen.getByText("2026-01-01-smoke"));
    await waitFor(() => expect(screen.getByText("Unknown")).toBeInTheDocument());
  });

  it("expands run on Enter key", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    const runRow = screen.getByRole("button", { name: /2026-01-01-smoke/ });
    await userEvent.type(runRow, "{Enter}");
    await waitFor(() =>
      expect(client.getPendingCases).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });

  it("expands run on Space key", async () => {
    vi.mocked(client.listRuns).mockResolvedValue({ runs: [mockRun] } as never);
    render(<RunsTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("2026-01-01-smoke"));
    const runRow = screen.getByRole("button", { name: /2026-01-01-smoke/ });
    runRow.focus();
    await userEvent.keyboard(" ");
    await waitFor(() =>
      expect(client.getPendingCases).toHaveBeenCalledWith(
        expect.objectContaining({ runId: "2026-01-01-smoke" })
      )
    );
  });
});
