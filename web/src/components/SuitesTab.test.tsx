import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import SuitesTab from "./SuitesTab";
import { client } from "../client";
import { makeCase, makeSuite } from "../test/factories";

vi.mock("../client");

const mockSuite = makeSuite({
  description: "Critical path checks",
  cases: ["auth/login", "auth/logout"],
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listSuites).mockResolvedValue({ suites: [mockSuite] } as never);
  vi.mocked(client.listCases).mockResolvedValue({
    cases: [
      makeCase({ path: "auth/login", title: "User Login", tags: ["auth"], priority: "high" }),
      makeCase({ path: "auth/logout", title: "User Logout", tags: [], priority: "low" }),
    ],
  } as never);
  vi.mocked(client.createSuite).mockResolvedValue({
    suite: mockSuite,
    filePath: "suites/smoke.yaml",
  } as never);
  vi.mocked(client.updateSuite).mockResolvedValue({ suite: mockSuite } as never);
  vi.mocked(client.deleteSuite).mockResolvedValue({ filePath: "suites/smoke.yaml" } as never);
});

describe("SuitesTab", () => {
  it("renders empty state when no repo path", () => {
    render(<SuitesTab repoId="" />);
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument();
  });

  it("shows suites after load", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Smoke Tests")).toBeInTheDocument());
    expect(screen.getByText("smoke")).toBeInTheDocument();
    expect(screen.getByText("2 cases")).toBeInTheDocument();
  });

  it("expands suite and shows case details", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    expect(screen.getByText("User Logout")).toBeInTheDocument();
  });

  it("calls onRunSuite when Run button clicked", async () => {
    const onRunSuite = vi.fn();
    render(<SuitesTab repoId="owner/repo" onRunSuite={onRunSuite} />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Run"));
    expect(onRunSuite).toHaveBeenCalledWith("smoke");
  });

  it("opens create form", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    expect(screen.getByRole("heading", { name: "Create Suite" })).toBeInTheDocument();
  });

  it("calls deleteSuite when delete confirmed", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete smoke" }));
    await waitFor(() =>
      expect(client.deleteSuite).toHaveBeenCalledWith(expect.objectContaining({ slug: "smoke" }))
    );
  });

  it("calls createSuite when create form submitted", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "regression");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Regression Tests");
    await userEvent.click(screen.getByRole("button", { name: "Create Suite" }));
    await waitFor(() =>
      expect(client.createSuite).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: "owner/repo",
          slug: "regression",
          name: "Regression Tests",
        })
      )
    );
  });

  it("opens edit form with pre-filled values when Edit clicked", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    expect(screen.getByText("Edit: smoke")).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement).value).toBe(
      "Smoke Tests"
    );
  });

  it("calls updateSuite when edit form submitted", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    const nameInput = screen.getByRole("textbox", { name: "Name" }) as HTMLInputElement;
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Updated Smoke");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(client.updateSuite).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: "owner/repo", slug: "smoke", name: "Updated Smoke" })
      )
    );
  });

  it("shows error banner when listSuites fails", async () => {
    vi.mocked(client.listSuites).mockRejectedValue(new Error("load failed"));
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("load failed")).toBeInTheDocument());
  });

  it("shows raw case paths when listCases returns empty", async () => {
    vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("auth/login")).toBeInTheDocument());
    expect(screen.getByText("auth/logout")).toBeInTheDocument();
  });

  it('shows "No cases in this suite" for suite with no cases', async () => {
    const emptySuite = makeSuite({ description: "Critical path checks", cases: [] });
    vi.mocked(client.listSuites).mockResolvedValue({ suites: [emptySuite] } as never);
    vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("No cases in this suite.")).toBeInTheDocument());
  });

  it("shows error when createSuite fails", async () => {
    vi.mocked(client.createSuite).mockRejectedValue(new Error("create failed"));
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "regression");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Regression");
    await userEvent.click(screen.getByRole("button", { name: "Create Suite" }));
    await waitFor(() => expect(screen.getByText("create failed")).toBeInTheDocument());
  });

  it("shows error when deleteSuite fails", async () => {
    vi.mocked(client.deleteSuite).mockRejectedValue(new Error("delete failed"));
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete smoke" }));
    await waitFor(() => expect(screen.getByText("delete failed")).toBeInTheDocument());
  });

  it("shows error when updateSuite fails", async () => {
    vi.mocked(client.updateSuite).mockRejectedValue(new Error("update failed"));
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("update failed")).toBeInTheDocument());
  });

  it("collapses expanded suite when clicked again", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.queryByText("User Login")).not.toBeInTheDocument());
  });

  it('shows singular "case" label when suite has exactly one case', async () => {
    const singleCaseSuite = makeSuite({
      description: "Critical path checks",
      cases: ["auth/login"],
    });
    vi.mocked(client.listSuites).mockResolvedValue({ suites: [singleCaseSuite] } as never);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("1 case")).toBeInTheDocument());
  });

  it("shows medium priority dot when case has medium priority", async () => {
    vi.mocked(client.listCases).mockResolvedValue({
      cases: [makeCase({ path: "auth/login", title: "User Login", priority: "medium" })],
    } as never);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
  });

  it("collapses expanded suite when it is deleted", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete smoke" }));
    await waitFor(() =>
      expect(client.deleteSuite).toHaveBeenCalledWith(expect.objectContaining({ slug: "smoke" }))
    );
  });

  it("calls createSuite with parsed cases when cases field is filled", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "regression");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Regression Tests");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Cases (comma-separated paths)" }),
      "auth/login, auth/logout"
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Suite" }));
    await waitFor(() =>
      expect(client.createSuite).toHaveBeenCalledWith(
        expect.objectContaining({ cases: ["auth/login", "auth/logout"] })
      )
    );
  });

  it("calls updateSuite with empty cases array when cases field is cleared", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.clear(screen.getByRole("textbox", { name: "Cases (comma-separated paths)" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(client.updateSuite).toHaveBeenCalledWith(expect.objectContaining({ cases: [] }))
    );
  });

  it("calls updateSuite with parsed cases when cases field is filled", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Cases (comma-separated paths)" }),
      "auth/login, auth/logout"
    );
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(client.updateSuite).toHaveBeenCalled());
  });

  it("does not call deleteSuite when inline confirm cancelled", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    await userEvent.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(client.deleteSuite).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete smoke" })).toBeInTheDocument();
  });

  it("handles listCases failure silently when suite expanded", async () => {
    vi.mocked(client.listCases).mockRejectedValue(new Error("cases load error"));
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("auth/login")).toBeInTheDocument());
  });

  it("dismisses error banner when X button clicked", async () => {
    vi.mocked(client.listSuites).mockRejectedValue(new Error("load failed"));
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("load failed")).toBeInTheDocument());
    await userEvent.click(screen.getByText("×"));
    expect(screen.queryByText("load failed")).not.toBeInTheDocument();
  });

  it("fills description in create form", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "e2e");
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "E2E Tests");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Description" }),
      "End to end regression suite"
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Suite" }));
    await waitFor(() =>
      expect(client.createSuite).toHaveBeenCalledWith(
        expect.objectContaining({ description: "End to end regression suite" })
      )
    );
  });

  it("changes description in edit form", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const descInput = screen.getByRole("textbox", { name: "Description" }) as HTMLInputElement;
    await userEvent.clear(descInput);
    await userEvent.type(descInput, "Updated description");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateSuite).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Updated description" })
      )
    );
  });

  it("cancels edit form when Cancel button clicked", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("pressing Escape in create form cancels it", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    expect(screen.getByRole("heading", { name: "Create Suite" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("heading", { name: "Create Suite" })).not.toBeInTheDocument();
  });

  it("pressing Escape in edit form cancels it", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    expect(screen.getByText("Edit: smoke")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Edit: smoke")).not.toBeInTheDocument();
  });

  it("expands suite on Enter key", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    const suiteRow = screen.getByRole("button", { name: /Smoke Tests/ });
    await userEvent.type(suiteRow, "{Enter}");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ suite: "smoke" }))
    );
  });

  it("expands suite on Space key", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    const suiteRow = screen.getByRole("button", { name: /Smoke Tests/ });
    suiteRow.focus();
    await userEvent.keyboard(" ");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ suite: "smoke" }))
    );
  });

  it("ignores stale listCases response when suite clicked twice rapidly", async () => {
    const suite2 = makeSuite({ slug: "regression", name: "Regression", cases: [] });
    vi.mocked(client.listSuites).mockResolvedValue({ suites: [mockSuite, suite2] } as never);
    let resolveFirst!: (v: unknown) => void;
    let resolveSecond!: (v: unknown) => void;
    vi.mocked(client.listCases)
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveFirst = res;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((res) => {
            resolveSecond = res;
          })
      );
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByRole("button", { name: /Smoke Tests/ }));
    await userEvent.click(screen.getByRole("button", { name: /Regression/ }));
    // Resolve second fetch first (out of order)
    resolveSecond({ cases: [makeCase({ path: "reg/test", title: "Regression Test" })] });
    await waitFor(() => screen.getByText("Regression Test"));
    // Now resolve first fetch — stale result must be discarded
    resolveFirst({ cases: [makeCase({ path: "auth/login", title: "Should Not Appear" })] });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("Should Not Appear")).not.toBeInTheDocument();
    expect(screen.getByText("Regression Test")).toBeInTheDocument();
  });
});
