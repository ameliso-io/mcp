import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import NavBar from "./NavBar";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(() => "/repositories/org/alpha/overview"),
}));

vi.mock("next/navigation", () => ({
  usePathname: mockUsePathname,
}));

vi.mock("./ServerStatus", () => ({
  default: () => null,
}));

vi.mock("next/link", () => ({
  useLinkStatus: () => ({ pending: false }),
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

const BASE_PATH = "/repositories/org/alpha";

describe("NavBar", () => {
  beforeEach(() => {
    mockUsePathname.mockReturnValue(`${BASE_PATH}/overview`);
  });

  it("renders all nav links", () => {
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cases" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Suites" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Runs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repositories" })).toBeInTheDocument();
  });

  it('marks active route with aria-current="page"', () => {
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute("aria-current");
  });

  it("links point to correct href values", () => {
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute(
      "href",
      `${BASE_PATH}/cases`
    );
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("href", `${BASE_PATH}/runs`);
    expect(screen.getByRole("link", { name: "Suites" })).toHaveAttribute(
      "href",
      `${BASE_PATH}/suites`
    );
    expect(screen.getByRole("link", { name: "Repositories" })).toHaveAttribute(
      "href",
      "/repositories"
    );
  });

  it("marks Cases as active when on cases path", () => {
    mockUsePathname.mockReturnValue(`${BASE_PATH}/cases`);
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Runs" })).not.toHaveAttribute("aria-current");
  });

  it("marks Runs as active when on runs path", () => {
    mockUsePathname.mockReturnValue(`${BASE_PATH}/runs`);
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Runs" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("marks Suites as active when on suites path", () => {
    mockUsePathname.mockReturnValue(`${BASE_PATH}/suites`);
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Suites" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Cases" })).not.toHaveAttribute("aria-current");
  });

  it("marks Repositories as active when pathname is /repositories", () => {
    mockUsePathname.mockReturnValue("/repositories");
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("link", { name: "Repositories" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("renders Ameliso logo", () => {
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByText("Ameliso")).toBeInTheDocument();
  });

  it('has aria-label="Main navigation" on nav element', () => {
    render(<NavBar basePath={BASE_PATH} />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  });

  it("logo is a link to /repositories", () => {
    render(<NavBar basePath={BASE_PATH} />);
    const logoLink = screen.getByRole("link", { name: "Ameliso" });
    expect(logoLink).toBeInTheDocument();
    expect(logoLink).toHaveAttribute("href", "/repositories");
  });

  it("renders only logo when basePath is omitted", () => {
    render(<NavBar />);
    expect(screen.getByText("Ameliso")).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Cases" })).not.toBeInTheDocument();
  });
});
