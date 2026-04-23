import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("renders nav and children inside main", () => {
    render(
      <AppShell nav={<nav>NavContent</nav>}>
        <p>Page content</p>
      </AppShell>
    );
    expect(screen.getByText("NavContent")).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByText("Page content"));
  });

  it("renders skip link targeting main-content", () => {
    render(
      <AppShell nav={<nav />}>
        <span />
      </AppShell>
    );
    const skip = screen.getByText("Skip to main content");
    expect(skip).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});
