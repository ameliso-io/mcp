import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import NotFoundView from "./NotFoundView";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

describe("NotFoundView", () => {
  it("renders the heading", () => {
    render(
      <NotFoundView heading="404 — Not found" backHref="/repositories" backLabel="Go back" />
    );
    expect(screen.getByRole("heading", { name: "404 — Not found" })).toBeInTheDocument();
  });

  it("renders a link with the back label pointing to backHref", () => {
    render(
      <NotFoundView heading="404 — Not found" backHref="/repositories" backLabel="Go back" />
    );
    const link = screen.getByRole("link", { name: "Go back" });
    expect(link).toHaveAttribute("href", "/repositories");
  });
});
