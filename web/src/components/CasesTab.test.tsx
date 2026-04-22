import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import CasesTab from "./CasesTab";
import { client } from "@/client";
import type { Case } from "@/gen/ameliso/v1/types_pb";
import { Priority } from "@/gen/ameliso/v1/types_pb";
import { makeCase } from "@/test/factories";

vi.mock("@/client");

const mockCase = makeCase({
  description: "Verify login flow",
  tags: ["auth", "smoke"],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase] } as never);
  vi.mocked(client.getCase).mockResolvedValue({
    case: mockCase,
    body: "## Steps\n\n1. Go to /login",
  } as never);
  vi.mocked(client.updateCase).mockResolvedValue({ case: mockCase } as never);
});

describe("CasesTab", () => {
  it("renders empty state when no repo path", () => {
    render(<CasesTab repoId="" />);
    expect(screen.getByText(/Set a repository path/i)).toBeInTheDocument();
  });

  it("shows cases after load", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    expect(screen.getByText("auth/login")).toBeInTheDocument();
  });

  it("shows case count in filter bar", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("1 case")).toBeInTheDocument());
  });

  it("shows plural case count when multiple cases", async () => {
    const mockCase2 = { ...mockCase, path: "auth/signup", title: "User Signup" } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase, mockCase2] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("2 cases")).toBeInTheDocument());
  });

  it("expands case body on click", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => expect(screen.getByText(/Go to \/login/)).toBeInTheDocument());
  });

  it("opens create form when New Case clicked", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    expect(screen.getByText("Create Case")).toBeInTheDocument();
  });

  it("does not create case when title is empty", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Path (e.g. auth/login)" }),
      "auth/new"
    );
    // Leave Title empty — guard at top of handleCreate fires
    await userEvent.click(screen.getByText("Create"));
    expect(client.createCase).not.toHaveBeenCalled();
  });

  it("calls createCase on form submit", async () => {
    vi.mocked(client.createCase).mockResolvedValue({
      case: mockCase,
      filePath: "cases/auth/login.md",
    } as never);
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Path (e.g. auth/login)" }),
      "auth/new"
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "New Case Title");
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() =>
      expect(client.createCase).toHaveBeenCalledWith(
        expect.objectContaining({ casePath: "auth/new", title: "New Case Title" })
      )
    );
  });

  it("calls deleteCase when delete confirmed", async () => {
    vi.mocked(client.deleteCase).mockResolvedValue({ filePath: "cases/auth/login.md" } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByRole("button", { name: "Delete auth/login" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete auth/login" }));
    await waitFor(() =>
      expect(client.deleteCase).toHaveBeenCalledWith(
        expect.objectContaining({ casePath: "auth/login" })
      )
    );
  });

  it("does not call deleteCase when inline confirm cancelled", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByRole("button", { name: "Delete auth/login" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel delete" }));
    expect(client.deleteCase).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Delete auth/login" })).toBeInTheDocument();
  });

  it("hides expanded body panel when case switches from expanded to edit mode", async () => {
    render(<CasesTab repoId="owner/repo" />);
    // Expand the case — MarkdownBody renders "## Steps" as an <h2>
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Steps" })).toBeInTheDocument());
    // Click Edit — expanded body panel hides (edit textarea replaces MarkdownBody rendering)
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    // The rendered <h2> from MarkdownBody should be gone
    expect(screen.queryByRole("heading", { name: "Steps" })).not.toBeInTheDocument();
  });

  it("opens edit form with pre-filled values when Edit clicked", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value).toBe(
        "User Login"
      );
    });
  });

  it("calls updateCase when edit form submitted", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({
          repoId: "owner/repo",
          casePath: "auth/login",
          title: "User Login",
        })
      )
    );
  });

  it("collapses expanded case when clicked again", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => expect(screen.getByText(/Go to \/login/)).toBeInTheDocument());
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => expect(screen.queryByText(/Go to \/login/)).not.toBeInTheDocument());
  });

  it("shows error banner when listCases rejects", async () => {
    vi.mocked(client.listCases).mockRejectedValue(new Error("server down"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("server down")).toBeInTheDocument());
  });

  it("changes sort order when Sort: Path selected", async () => {
    const secondCase = makeCase({ path: "auth/logout", title: "User Logout", priority: "low" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase, secondCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const sortSelect = screen.getByDisplayValue("Sort: Priority");
    await userEvent.selectOptions(sortSelect, "path");
    expect(screen.getByDisplayValue("Sort: Path")).toBeInTheDocument();
    await waitFor(() => expect(client.listCases).toHaveBeenCalled());
  });

  it("filters by priority when priority select changed", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const prioritySelect = screen.getByDisplayValue("All priorities");
    await userEvent.selectOptions(prioritySelect, "High");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ priority: expect.any(Number) })
      )
    );
  });

  it("shows error when deleteCase fails", async () => {
    vi.mocked(client.deleteCase).mockRejectedValue(new Error("delete failed"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByRole("button", { name: "Delete auth/login" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete auth/login" }));
    await waitFor(() => expect(screen.getByText("delete failed")).toBeInTheDocument());
  });

  it("shows error when updateCase fails", async () => {
    vi.mocked(client.updateCase).mockRejectedValue(new Error("update failed"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(screen.getByText("update failed")).toBeInTheDocument());
  });

  it("shows no-body placeholder when body is empty", async () => {
    vi.mocked(client.getCase).mockResolvedValue({ case: mockCase, body: "" } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => expect(screen.getByText("No body.")).toBeInTheDocument());
  });

  it("shows error when getCase fails on expand", async () => {
    vi.mocked(client.getCase).mockRejectedValue(new Error("case fetch error"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => expect(screen.getByText("case fetch error")).toBeInTheDocument());
  });

  it("shows error when createCase fails", async () => {
    vi.mocked(client.createCase).mockRejectedValue(new Error("create case error"));
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Path (e.g. auth/login)" }),
      "auth/new"
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "New Title");
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() => expect(screen.getByText("create case error")).toBeInTheDocument());
  });

  it("handles fetchBody failure silently in edit form", async () => {
    vi.mocked(client.getCase).mockRejectedValue(new Error("body unavailable"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => {
      expect((screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement).value).toBe(
        "User Login"
      );
    });
  });

  it("calls updateCase with parsed tags when tags field is filled", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const tagsInput = screen.getByRole("textbox", { name: "Tags (comma-separated)" });
    await userEvent.clear(tagsInput);
    await userEvent.type(tagsInput, "auth, smoke, regression");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({ tags: expect.arrayContaining(["auth", "smoke", "regression"]) })
      )
    );
  });

  it("sorts by priority with path tiebreaker for equal-priority cases", async () => {
    const case2 = makeCase({ path: "auth/logout", title: "User Logout", priority: "high" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [case2, mockCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    const paths = screen.getAllByText(/auth\//);
    expect(paths[0]!.textContent).toBe("auth/login");
    expect(paths[1]!.textContent).toBe("auth/logout");
  });

  it("sorts unknown priority cases to end", async () => {
    const unknownCase = makeCase({ path: "other/thing", title: "Unknown", priority: "" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [unknownCase, mockCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    const paths = screen.getAllByText(/\//);
    const loginIdx = paths.findIndex((el) => el.textContent === "auth/login");
    const otherIdx = paths.findIndex((el) => el.textContent === "other/thing");
    expect(loginIdx).toBeLessThan(otherIdx);
  });

  it("sorts known before unknown priority from reversed order", async () => {
    const unknownCase = makeCase({ path: "other/thing", title: "Unknown", priority: "" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase, unknownCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("User Login")).toBeInTheDocument());
    const paths = screen.getAllByText(/\//);
    const loginIdx = paths.findIndex((el) => el.textContent === "auth/login");
    const otherIdx = paths.findIndex((el) => el.textContent === "other/thing");
    expect(loginIdx).toBeLessThan(otherIdx);
  });

  it("collapses expanded case when it is deleted", async () => {
    vi.mocked(client.deleteCase).mockResolvedValue({ filePath: "cases/auth/login.md" } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    await waitFor(() => screen.getByText(/Go to \/login/));
    await userEvent.click(screen.getByRole("button", { name: "Delete auth/login" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete auth/login" }));
    await waitFor(() =>
      expect(client.deleteCase).toHaveBeenCalledWith(
        expect.objectContaining({ casePath: "auth/login" })
      )
    );
  });

  it("filters by tag when tag select changed", async () => {
    const taggedCase = makeCase({ tags: ["smoke"] });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [taggedCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const tagSelect = screen.getByDisplayValue("All tags");
    await userEvent.selectOptions(tagSelect, "smoke");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ tags: ["smoke"] }))
    );
  });

  it("filters by suite when suite slug input is typed", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const suiteInput = screen.getByRole("searchbox", {
      name: "Filter by suite slug",
    }) as HTMLInputElement;
    await userEvent.type(suiteInput, "smoke");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ suite: "smoke" }))
    );
  });

  it("calls onFiltersChange when priority filter changes", async () => {
    const onFiltersChange = vi.fn();
    render(<CasesTab repoId="owner/repo" onFiltersChange={onFiltersChange} />);
    await waitFor(() => screen.getByText("User Login"));
    const prioritySelect = screen.getByDisplayValue("All priorities");
    await userEvent.selectOptions(prioritySelect, "High");
    await waitFor(() =>
      expect(onFiltersChange).toHaveBeenCalledWith(
        expect.objectContaining({ priority: Priority.HIGH })
      )
    );
  });

  it("initializes from initialSearch and initialPriorityFilter props", async () => {
    render(
      <CasesTab
        repoId="owner/repo"
        initialSearch="login"
        initialPriorityFilter={Priority.HIGH}
        initialSortBy="path"
      />
    );
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ query: "login", priority: Priority.HIGH })
      )
    );
    expect(screen.getByDisplayValue("Sort: Path")).toBeInTheDocument();
  });

  it("calls createCase with parsed tags when tags field is filled", async () => {
    vi.mocked(client.createCase).mockResolvedValue({
      case: mockCase,
      filePath: "cases/auth/new.md",
    } as never);
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Path (e.g. auth/login)" }),
      "auth/new"
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "New Case Title");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Tags (comma-separated)" }),
      "auth, smoke"
    );
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() =>
      expect(client.createCase).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["auth", "smoke"] })
      )
    );
  });

  it("calls updateCase with empty tags array when tags field is empty", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.clear(screen.getByRole("textbox", { name: "Tags (comma-separated)" }));
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }))
    );
  });

  it("cancels edit form when Cancel clicked", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText("Save")).not.toBeInTheDocument());
  });

  it("clears debounce timeout on rapid search input", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const searchInput = screen.getByRole("searchbox", { name: "Search cases" });
    await userEvent.type(searchInput, "lo");
    await waitFor(() => expect(client.listCases).toHaveBeenCalled());
  });

  it("calls listCases with search term after debounce fires", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    vi.mocked(client.listCases).mockClear();
    const searchInput = screen.getByRole("searchbox", { name: "Search cases" });
    fireEvent.change(searchInput, { target: { value: "xyz-unique-search" } });
    await waitFor(
      () =>
        expect(client.listCases).toHaveBeenCalledWith(
          expect.objectContaining({ query: "xyz-unique-search" })
        ),
      { timeout: 1000 }
    );
  });

  it("shows medium priority label and opens edit for medium priority case", async () => {
    const mediumCase = makeCase({
      priority: "medium",
      path: "auth/reset",
      title: "Reset Password",
    });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mediumCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Reset Password")).toBeInTheDocument());
    expect(screen.getAllByText("Medium").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
  });

  it("opens edit for low priority case", async () => {
    const lowCase = makeCase({ priority: "low", path: "auth/logout", title: "Logout" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [lowCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
  });

  it("opens edit for case with unknown priority (default branch)", async () => {
    const unknownCase = makeCase({ priority: "", path: "other/thing", title: "Unknown Priority" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [unknownCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
  });

  it("dismisses error when X button clicked", async () => {
    vi.mocked(client.listCases).mockRejectedValue(new Error("server down"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("server down")).toBeInTheDocument());
    await userEvent.click(screen.getByText("×"));
    expect(screen.queryByText("server down")).not.toBeInTheDocument();
  });

  it("retries load when Retry button clicked", async () => {
    vi.mocked(client.listCases)
      .mockRejectedValueOnce(new Error("server down"))
      .mockResolvedValueOnce({ cases: [] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("server down")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(client.listCases).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("server down")).not.toBeInTheDocument();
  });

  it("fills description and body textarea in create form", async () => {
    vi.mocked(client.createCase).mockResolvedValue({
      case: mockCase,
      filePath: "cases/auth/new.md",
    } as never);
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    await userEvent.type(
      screen.getByRole("textbox", { name: "Path (e.g. auth/login)" }),
      "auth/new"
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "New Title");
    await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "Some description");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Steps / Body (Markdown)" }),
      "## Steps"
    );
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() =>
      expect(client.createCase).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Some description" })
      )
    );
  });

  it("changes priority select in create form", async () => {
    vi.mocked(client.createCase).mockResolvedValue({
      case: mockCase,
      filePath: "cases/auth/new.md",
    } as never);
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    const prioritySelect = screen.getByDisplayValue("Medium");
    await userEvent.selectOptions(prioritySelect, "High");
    await userEvent.type(
      screen.getByRole("textbox", { name: "Path (e.g. auth/login)" }),
      "auth/new"
    );
    await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "New Title");
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() => expect(client.createCase).toHaveBeenCalled());
  });

  it("changes description in edit form", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const descInput = screen.getByRole("textbox", { name: "Description" }) as HTMLInputElement;
    await userEvent.clear(descInput);
    await userEvent.type(descInput, "Updated description");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Updated description" })
      )
    );
  });

  it("changes priority select in edit form", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const prioritySelect = screen.getByDisplayValue("High");
    await userEvent.selectOptions(prioritySelect, "Low");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({ repoId: "owner/repo", casePath: "auth/login" })
      )
    );
  });

  it("changes body textarea in edit form", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const bodyTextarea = screen.getByRole("textbox", {
      name: "Steps / Body (Markdown)",
    }) as HTMLTextAreaElement;
    await userEvent.clear(bodyTextarea);
    await userEvent.type(bodyTextarea, "## New Steps");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({ body: "## New Steps" })
      )
    );
  });

  it("changes title in edit form", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const titleInput = screen.getByRole("textbox", { name: "Title" }) as HTMLInputElement;
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, "Updated Login");
    await userEvent.click(screen.getByText("Save"));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Updated Login" })
      )
    );
  });

  it("pressing Escape in create form cancels it", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    expect(screen.getByText("Create Case")).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Create Case")).not.toBeInTheDocument();
  });

  it("pressing Escape in edit form cancels it", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("announces result count via live region when filter changes case count", async () => {
    const secondCase = makeCase({ path: "auth/logout", title: "User Logout", priority: "low" });
    vi.mocked(client.listCases)
      .mockResolvedValueOnce({ cases: [mockCase, secondCase] } as never)
      .mockResolvedValue({ cases: [mockCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.selectOptions(screen.getByDisplayValue("All priorities"), "High");
    await waitFor(() => {
      const regions = screen.getAllByRole("status");
      expect(regions.some((el) => el.textContent?.includes("1 case found"))).toBe(true);
    });
  });

  it("expands case on Enter key", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const caseRow = screen.getByRole("button", { name: /User Login/ });
    await userEvent.type(caseRow, "{Enter}");
    await waitFor(() => expect(client.getCase).toHaveBeenCalled());
  });

  it("expands case on Space key", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const caseRow = screen.getByRole("button", { name: /User Login/ });
    caseRow.focus();
    await userEvent.keyboard(" ");
    await waitFor(() => expect(client.getCase).toHaveBeenCalled());
  });

  it("shows loading state while fetching cases", async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.listCases).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<CasesTab repoId="owner/repo" />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve!({ cases: [] });
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it('shows "No cases found." when case list is empty', async () => {
    vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("No cases found.")).toBeInTheDocument());
  });

  it("cancels create form when Cancel button clicked", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    expect(screen.getByText("Create Case")).toBeInTheDocument();
    await userEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Create Case")).not.toBeInTheDocument();
    expect(screen.getByText("+ New Case")).toBeInTheDocument();
  });

  it("resets priority to Medium after creating a case with High priority", async () => {
    vi.mocked(client.createCase).mockResolvedValue({
      case: mockCase,
      filePath: "cases/auth/new.md",
    } as never);
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    const prioritySelect = screen.getByDisplayValue("Medium");
    await userEvent.selectOptions(prioritySelect, "High");
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0]!, "auth/new");
    await userEvent.type(inputs[1]!, "New Title");
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() => expect(client.createCase).toHaveBeenCalled());
    // Reopen form — priority should be reset to Medium
    await userEvent.click(screen.getByText("+ New Case"));
    await waitFor(() => expect(screen.getByDisplayValue("Medium")).toBeInTheDocument());
  });

  it("discards stale getCase response when a second expand fires before first resolves", async () => {
    const secondCase = makeCase({ path: "auth/logout", title: "User Logout", priority: "low" });
    vi.mocked(client.listCases).mockResolvedValue({ cases: [mockCase, secondCase] } as never);

    let resolveFirst!: (v: unknown) => void;
    const firstPromise = new Promise((res) => {
      resolveFirst = res;
    });
    vi.mocked(client.getCase)
      .mockImplementationOnce(() => firstPromise as never)
      .mockResolvedValue({ case: secondCase, body: "second body" } as never);

    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));

    await userEvent.click(screen.getByRole("button", { name: /User Login/ }));
    await userEvent.click(screen.getByRole("button", { name: /User Logout/ }));
    await waitFor(() => expect(screen.queryByText("second body")).toBeInTheDocument());

    // resolve stale first fetch — should not overwrite second body
    await act(async () => {
      resolveFirst({ case: mockCase, body: "first body" });
    });
    expect(screen.queryByText("first body")).not.toBeInTheDocument();
    expect(screen.getByText("second body")).toBeInTheDocument();
  });

  it("shows case tags as chips in case card list view", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    expect(screen.getAllByText("auth").length).toBeGreaterThan(0);
    expect(screen.getAllByText("smoke").length).toBeGreaterThan(0);
  });

  it('shows "Loading…" while case body is loading on expand', async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.getCase).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    await userEvent.click(screen.getByText("User Login"));
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    resolve!({ case: mockCase, body: "" });
    await waitFor(() => expect(screen.queryByText("Loading…")).not.toBeInTheDocument());
  });

  it('shows "Creating…" on Create button while case creation is in progress', async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.createCase).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0]!, "auth/new");
    await userEvent.type(inputs[1]!, "New Title");
    await userEvent.click(screen.getByText("Create"));
    expect(screen.getByText("Creating…")).toBeInTheDocument();
    resolve!({ case: mockCase, filePath: "cases/auth/new.md" });
    await waitFor(() => expect(screen.queryByText("Creating…")).not.toBeInTheDocument());
  });

  it('shows "Saving…" on Save button while case update is in progress', async () => {
    let resolve: (v: unknown) => void;
    vi.mocked(client.updateCase).mockReturnValue(
      new Promise((res) => {
        resolve = res;
      }) as never
    );
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    await userEvent.click(screen.getByText("Save"));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    resolve!({ case: mockCase });
    await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());
  });

  it("does not show description paragraph when case description is empty", async () => {
    const noDescCase = { ...mockCase, description: "" } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [noDescCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    expect(screen.queryByText("Verify login flow")).not.toBeInTheDocument();
  });

  it("does not show case count span when case list is empty", async () => {
    vi.mocked(client.listCases).mockResolvedValue({ cases: [] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("No cases found.")).toBeInTheDocument());
    expect(screen.queryByText(/\d+ cases?/)).not.toBeInTheDocument();
  });

  it("resets priority filter to unspecified when All priorities re-selected after filtering", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const prioritySelect = screen.getByDisplayValue("All priorities");
    await userEvent.selectOptions(prioritySelect, "High");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(
        expect.objectContaining({ priority: expect.any(Number) })
      )
    );
    await userEvent.selectOptions(prioritySelect, "All priorities");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ priority: 0 }))
    );
  });

  it("resets tag filter to empty tags when All tags re-selected after filtering", async () => {
    const taggedCase = { ...mockCase, tags: ["smoke"] } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [taggedCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    const tagSelect = screen.getByDisplayValue("All tags");
    await userEvent.selectOptions(tagSelect, "smoke");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ tags: ["smoke"] }))
    );
    await userEvent.selectOptions(tagSelect, "");
    await waitFor(() =>
      expect(client.listCases).toHaveBeenCalledWith(expect.objectContaining({ tags: [] }))
    );
  });

  it("tag filter select is not shown when cases have no tags", async () => {
    const noTagCase = { ...mockCase, tags: [] } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [noTagCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("User Login"));
    expect(screen.queryByDisplayValue("All tags")).not.toBeInTheDocument();
  });

  it('shows "Low" priority label for low-priority case', async () => {
    const lowCase = {
      ...mockCase,
      priority: "low",
      path: "auth/logout",
      title: "Logout",
    } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [lowCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Low")).toBeInTheDocument());
  });

  it("filters whitespace-only and empty entries from tags on create", async () => {
    vi.mocked(client.createCase).mockResolvedValue({
      case: mockCase,
      filePath: "cases/auth/new.md",
    } as never);
    render(<CasesTab repoId="owner/repo" />);
    await userEvent.click(screen.getByText("+ New Case"));
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0]!, "auth/new");
    await userEvent.type(inputs[1]!, "New Case");
    // Input with leading/trailing commas and whitespace-only segment
    await userEvent.type(inputs[3]!, "auth, , smoke,");
    await userEvent.click(screen.getByText("Create"));
    await waitFor(() =>
      expect(client.createCase).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ["auth", "smoke"] })
      )
    );
  });

  it('shows "—" priority label for unknown-priority case', async () => {
    const unknownCase = {
      ...mockCase,
      priority: "",
      path: "other/thing",
      title: "Unknown Priority Case",
    } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [unknownCase] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Unknown Priority Case")).toBeInTheDocument());
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("sort by path orders cases alphabetically when switched from priority", async () => {
    const caseA = {
      ...mockCase,
      path: "z/zebra",
      title: "Zebra Case",
      priority: "high",
    } as unknown as Case;
    const caseB = {
      ...mockCase,
      path: "a/apple",
      title: "Apple Case",
      priority: "low",
    } as unknown as Case;
    vi.mocked(client.listCases).mockResolvedValue({ cases: [caseA, caseB] } as never);
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => expect(screen.getByText("Zebra Case")).toBeInTheDocument());
    const sortSelect = screen.getByDisplayValue("Sort: Priority");
    await userEvent.selectOptions(sortSelect, "path");
    await waitFor(() => expect(screen.getByDisplayValue("Sort: Path")).toBeInTheDocument());
    const body = document.body.innerHTML;
    expect(body.indexOf("Apple Case")).toBeLessThan(body.indexOf("Zebra Case"));
  });

  it("opens edit form with empty body when fetchBody throws during startEdit", async () => {
    vi.mocked(client.getCase).mockRejectedValue(new Error("fetch failed"));
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());
    const bodyTextarea = screen
      .getAllByRole("textbox")
      .find((i) => (i as HTMLTextAreaElement).rows === 8) as HTMLTextAreaElement;
    expect(bodyTextarea.value).toBe("");
  });

  it("does not call createCase when create form submitted with empty path", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("+ New Case"));
    await userEvent.click(screen.getByText("+ New Case"));
    // fireEvent bypasses HTML5 required validation — triggers guard: !newPath
    fireEvent.submit(screen.getByRole("button", { name: "Create" }).closest("form")!);
    expect(client.createCase).not.toHaveBeenCalled();
  });

  it("calls updateCase with newPath when rename path field is filled", async () => {
    render(<CasesTab repoId="owner/repo" />);
    await waitFor(() => screen.getByText("Edit"));
    await userEvent.click(screen.getByText("Edit"));
    await waitFor(() => screen.getByText("Save"));
    const renameInput = screen.getByRole("textbox", {
      name: "Rename path (optional)",
    }) as HTMLInputElement;
    await userEvent.type(renameInput, "auth/sign-in");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(client.updateCase).toHaveBeenCalledWith(
        expect.objectContaining({ newPath: "auth/sign-in" })
      )
    );
  });
});
