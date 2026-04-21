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

  it("marks Cases as active when pathname is /cases", () => {
    mockUsePathname.mockReturnValue("/cases");
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute("aria-current");
  });

  it("marks Runs as active when pathname is /runs", () => {
    mockUsePathname.mockReturnValue("/runs");
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("marks Suites as active when pathname is /suites", () => {
    mockUsePathname.mockReturnValue("/suites");
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Suites" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
  });

  it("marks Repositories as active when pathname is /repositories", () => {
    mockUsePathname.mockReturnValue("/repositories");
    render(<NavBar />);
    expect(screen.getByRole("link", { name: "Repositories" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("renders Ameliso logo", () => {
    render(<NavBar />);
    expect(screen.getByText("Ameliso")).toBeInTheDocument();
  });

  it('has aria-label="Main navigation" on nav element', () => {
    render(<NavBar />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("logo is a link to /overview", () => {
    render(<NavBar />);
    const logoLink = screen.getByRole("link", { name: "Ameliso" });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute("href", "/overview");
  });
});
