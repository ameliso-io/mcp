import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import NavBar from "./NavBar";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/overview"),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: string;
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

describe("NavBar", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/overview");
  });

  it("renders all nav links", () => {
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cases" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Suites" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repositories" })).toBeInTheDocument();
  });

  it('marks active route with aria-current="page"', () => {
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute("aria-current");
  });

  it("links point to correct href values", () => {
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "/cases");
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("href", "/runs");
    expect(screen.getByRole("link", { name: "Suites" })).toHaveAttribute("href", "/suites");
    expect(screen.getByRole("link", { name: "Repositories" })).toHaveAttribute(
      "href",
      "/repositories"
    );
  });

  it('marks Overview as active when pathname is "/"', () => {
    mockUsePathname.mockReturnValue("/");
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
  });
});
