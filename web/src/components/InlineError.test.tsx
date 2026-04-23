import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect } from "vitest";
import InlineError from "./InlineError";

describe("InlineError", () => {
  it("renders error message in an alert role", () => {
    render(<InlineError error="Something failed" onDismiss={() => {}} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something failed")).toBeInTheDocument();
  });

  it("calls onDismiss when dismiss button clicked", async () => {
    const onDismiss = vi.fn();
    render(<InlineError error="oops" onDismiss={onDismiss} />);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
