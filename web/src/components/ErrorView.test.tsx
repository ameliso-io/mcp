import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import ErrorView from "./ErrorView";

describe("ErrorView", () => {
  it("renders error message", () => {
    const reset = vi.fn();
    render(<ErrorView error={new Error("Something failed")} reset={reset} />);
    expect(screen.getByText("Something failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("has role=alert", () => {
    render(<ErrorView error={new Error("oops")} reset={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows fallback message when error has no message", () => {
    const error = new Error("");
    render(<ErrorView error={error} reset={vi.fn()} />);
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
  });

  it("calls reset when Try again clicked", async () => {
    const reset = vi.fn();
    render(<ErrorView error={new Error("oops")} reset={reset} />);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
