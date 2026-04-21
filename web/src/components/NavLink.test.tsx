import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import NavLink from "./NavLink";

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

describe("NavLink", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/overview");
  });

  it("renders an anchor with correct href and label", () => {
    render(<NavLink href="/cases" label="Cases" />);
    const link = screen.getByRole("link", { name: "Cases" });
    expect(link).toHaveAttribute("href", "/cases");
  });

  it('sets aria-current="page" when pathname matches href', () => {
    mockUsePathname.mockReturnValue("/cases");
    render(<NavLink href="/cases" label="Cases" />);
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("aria-current", "page");
  });

  it("does not set aria-current when pathname differs", () => {
    render(<NavLink href="/cases" label="Cases" />);
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
  });

  it('marks /overview link active when pathname is "/"', () => {
    mockUsePathname.mockReturnValue("/");
    render(<NavLink href="/overview" label="Overview" />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it('does not mark non-overview link active when pathname is "/"', () => {
    mockUsePathname.mockReturnValue("/");
    render(<NavLink href="/cases" label="Cases" />);
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
  });
});
