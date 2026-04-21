import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import NavLink from "./NavLink";

const { mockUsePathname, mockUseLinkStatus } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/overview"),
  mockUseLinkStatus: vi.fn(() => ({ pending: false })),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

vi.mock("next/link", () => ({
  useLinkStatus: mockUseLinkStatus,
  default: ({
    href,
    children,
    className,
    "aria-current": ariaCurrent,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    "aria-current"?: React.AriaAttributes["aria-current"];
  }) => (
    <a href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

describe("NavLink", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue("/overview");
    mockUseLinkStatus.mockReturnValue({ pending: false });
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

  it("sets data-pending on label span when navigation is pending", () => {
    mockUseLinkStatus.mockReturnValue({ pending: true });
    render(<NavLink href="/cases" label="Cases" />);
    const span = screen.getByText("Cases");
    expect(span).toHaveAttribute("data-pending", "true");
  });

  it("does not set data-pending when navigation is not pending", () => {
    render(<NavLink href="/cases" label="Cases" />);
    const span = screen.getByText("Cases");
    expect(span).not.toHaveAttribute("data-pending");
  });
});
