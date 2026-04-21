import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "./App";

vi.mock("./components/OverviewTab", () => ({
  default: ({ repoId, onGoToRuns }: { repoId: string; onGoToRuns?: () => void }) => (
    <div>
      <span data-testid="overview-repo">{repoId}</span>
      {onGoToRuns && <button onClick={onGoToRuns}>GoToRuns</button>}
    </div>
  ),
}));

vi.mock("./components/CasesTab", () => ({
  default: ({ repoId }: { repoId: string }) => <div data-testid="cases-tab">{repoId}</div>,
}));

vi.mock("./components/SuitesTab", () => ({
  default: ({ repoId, onRunSuite }: { repoId: string; onRunSuite?: (s: string) => void }) => (
    <div>
      <span data-testid="suites-repo">{repoId}</span>
      {onRunSuite && <button onClick={() => onRunSuite("smoke")}>RunSuite</button>}
    </div>
  ),
}));

vi.mock("./components/RunsTab", () => ({
  default: ({
    repoId,
    initialSuite,
    onInitialSuiteConsumed,
  }: {
    repoId: string;
    initialSuite?: string;
    onInitialSuiteConsumed?: () => void;
  }) => (
    <div>
      <span data-testid="runs-repo">{repoId}</span>
      {initialSuite && <span data-testid="initial-suite">{initialSuite}</span>}
      {onInitialSuiteConsumed && <button onClick={onInitialSuiteConsumed}>ConsumedSuite</button>}
    </div>
  ),
}));

vi.mock("./components/RepositoriesTab", () => ({
  default: ({
    activeRepoId,
    onRepoSelect,
  }: {
    activeRepoId: string;
    onRepoSelect: (id: string) => void;
  }) => (
    <div>
      <span data-testid="repos-active">{activeRepoId}</span>
      <button onClick={() => onRepoSelect("owner/repo")}>SelectRepo</button>
    </div>
  ),
}));

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  localStorage.clear();
});

describe("App", () => {
  it("renders nav buttons for all tabs", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cases" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Suites" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Runs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repositories" })).toBeInTheDocument();
  });

  it("starts on Overview tab by default", () => {
    render(<App />);
    expect(screen.getByTestId("overview-repo")).toBeInTheDocument();
  });

  it("starts on Repositories tab when URL has installation_id", () => {
    window.history.replaceState({}, "", "/?installation_id=123&setup_action=install");
    render(<App />);
    expect(screen.getByTestId("repos-active")).toBeInTheDocument();
  });

  it("navigates between tabs via nav buttons", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Cases" }));
    expect(screen.getByTestId("cases-tab")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Runs" }));
    expect(screen.getByTestId("runs-repo")).toBeInTheDocument();
  });

  it("persists repoId to localStorage on repo select", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Repositories" }));
    await userEvent.click(screen.getByRole("button", { name: "SelectRepo" }));
    expect(localStorage.getItem("ameliso:repoId")).toBe("owner/repo");
  });

  it("loads repoId from localStorage on mount", () => {
    localStorage.setItem("ameliso:repoId", "saved/repo");
    render(<App />);
    expect(screen.getByTestId("overview-repo").textContent).toBe("saved/repo");
  });

  it("passes repoId down to active tab", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Repositories" }));
    await userEvent.click(screen.getByRole("button", { name: "SelectRepo" }));
    await userEvent.click(screen.getByRole("button", { name: "Cases" }));
    expect(screen.getByTestId("cases-tab").textContent).toBe("owner/repo");
  });

  it("onGoToRuns switches to Runs tab", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "GoToRuns" }));
    expect(screen.getByTestId("runs-repo")).toBeInTheDocument();
  });

  it("onRunSuite navigates to Runs tab with initialSuite", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Suites" }));
    await userEvent.click(screen.getByRole("button", { name: "RunSuite" }));
    expect(screen.getByTestId("runs-repo")).toBeInTheDocument();
    expect(screen.getByTestId("initial-suite").textContent).toBe("smoke");
  });

  it("onInitialSuiteConsumed clears initialSuite", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Suites" }));
    await userEvent.click(screen.getByRole("button", { name: "RunSuite" }));
    expect(screen.getByTestId("initial-suite")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "ConsumedSuite" }));
    expect(screen.queryByTestId("initial-suite")).not.toBeInTheDocument();
  });

  it("onRepoSelect sets repoId and navigates to Overview", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Repositories" }));
    await userEvent.click(screen.getByRole("button", { name: "SelectRepo" }));
    expect(screen.getByTestId("overview-repo").textContent).toBe("owner/repo");
    expect(localStorage.getItem("ameliso:repoId")).toBe("owner/repo");
  });
});
