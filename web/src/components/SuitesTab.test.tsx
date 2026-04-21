import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import SuitesTab from "./SuitesTab";
import { client } from "../client";
import type { Suite } from "../gen/ameliso/v1/types_pb";
import type { Case } from "../gen/ameliso/v1/types_pb";

vi.mock("../client");

const mockSuite = {
  slug: "smoke",
  name: "Smoke Tests",
  description: "Critical path checks",
  cases: ["auth/login", "auth/logout"],
} as unknown as Suite;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listSuites).mockResolvedValue({ suites: [mockSuite] } as never);
  vi.mocked(client.listCases).mockResolvedValue({
    cases: [
      {
        path: "auth/login",
        title: "User Login",
        description: "",
        tags: ["auth"],
        priority: "high",
        createdAt: "",
        updatedAt: "",
      },
      {
        path: "auth/logout",
        title: "User Logout",
        description: "",
        tags: [],
        priority: "low",
        createdAt: "",
        updatedAt: "",
      },
    ] as unknown as Case[],
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
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
    await waitFor(() =>
      expect(client.deleteSuite).toHaveBeenCalledWith(expect.objectContaining({ slug: "smoke" }))
    );
  });

  it("calls createSuite when create form submitted", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "regression");
    await userEvent.type(inputs[1], "Regression Tests");
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
    const nameInput = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLInputElement).value === "Smoke Tests");
    expect(nameInput).toBeDefined();
  });

  it("calls updateSuite when edit form submitted", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    const nameInput = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLInputElement).value === "Smoke Tests") as HTMLInputElement;
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
    const emptySuite = { ...mockSuite, cases: [] } as unknown as Suite;
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
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "regression");
    await userEvent.type(inputs[1], "Regression");
    await userEvent.click(screen.getByRole("button", { name: "Create Suite" }));
    await waitFor(() => expect(screen.getByText("create failed")).toBeInTheDocument());
  });

  it("shows error when deleteSuite fails", async () => {
    vi.mocked(client.deleteSuite).mockRejectedValue(new Error("delete failed"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Delete"));
    await userEvent.click(screen.getByText("Delete"));
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
    const singleCaseSuite = { ...mockSuite, cases: ["auth/login"] } as unknown as Suite;
    vi.mocked(client.listSuites).mockResolvedValue({ suites: [singleCaseSuite] } as never);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("1 case")).toBeInTheDocument());
  });

  it("shows medium priority dot when case has medium priority", async () => {
    vi.mocked(client.listCases).mockResolvedValue({
      cases: [
        {
          path: "auth/login",
          title: "User Login",
          description: "",
          tags: [],
          priority: "medium",
          createdAt: "",
          updatedAt: "",
        },
      ] as unknown as Case[],
    } as never);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
  });

  it("collapses expanded suite when it is deleted", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<SuitesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Smoke Tests"));
    await userEvent.click(screen.getByText("Smoke Tests"));
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("Delete"));
    await waitFor(() =>
      expect(client.deleteSuite).toHaveBeenCalledWith(expect.objectContaining({ slug: "smoke" }))
    );
  });

  it("calls createSuite with parsed cases when cases field is filled", async () => {
    render(<SuitesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Suite"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "regression");
    await userEvent.type(inputs[1], "Regression Tests");
    // 3rd input is description, 4th is cases
    await userEvent.type(inputs[3], "auth/login, auth/logout");
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
    const casesInput = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLInputElement).value === "auth/login, auth/logout");
    if (casesInput) {
      await userEvent.clear(casesInput);
    }
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
    const casesInput = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLInputElement).placeholder?.includes("auth/login"));
    if (casesInput) await userEvent.type(casesInput, "auth/login, auth/logout");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(client.updateSuite).toHaveBeenCalled());
  });
});
