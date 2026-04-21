import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import MarkdownBody from "./MarkdownBody";
import styles from "./MarkdownBody.module.css";

describe("MarkdownBody", () => {
  it("renders markdown heading", () => {
    const { container } = render(<MarkdownBody body="# Hello" />);
    expect(container.querySelector("h1")).toBeInTheDocument();
    expect(container.querySelector("h1")?.textContent).toBe("Hello");
  });

  it("renders markdown bold text", () => {
    const { container } = render(<MarkdownBody body="**bold**" />);
    expect(container.querySelector("strong")).toBeInTheDocument();
  });

  it("renders markdown list items", () => {
    const { container } = render(<MarkdownBody body={`- item1\n- item2`} />);
    const items = container.querySelectorAll("li");
    expect(items.length).toBeGreaterThan(0);
  });

  it("renders empty body without error", () => {
    const { container } = render(<MarkdownBody body="" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("sets --md-max-height CSS variable when maxHeight provided", () => {
    const { container } = render(<MarkdownBody body="text" maxHeight="200px" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.getPropertyValue("--md-max-height")).toBe("200px");
  });

  it("does not set inline style when maxHeight is omitted", () => {
    const { container } = render(<MarkdownBody body="text" />);
    const el = container.firstChild as HTMLElement;
    expect(el.getAttribute("style")).toBeFalsy();
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownBody body="use `npm install`" />);
    expect(container.querySelector("code")).toBeInTheDocument();
  });

  it("renders paragraph text", () => {
    render(<MarkdownBody body="plain paragraph" />);
    expect(screen.getByText("plain paragraph")).toBeInTheDocument();
  });

  it("renders markdown h2 and h3 headings", () => {
    const { container } = render(<MarkdownBody body={"## Section\n### Sub"} />);
    expect(container.querySelector("h2")).toBeInTheDocument();
    expect(container.querySelector("h3")).toBeInTheDocument();
  });

  it("applies body CSS module class", () => {
    const { container } = render(<MarkdownBody body="text" />);
    expect(container.firstChild).toHaveClass(styles.body);
  });

  it("renders ordered list", () => {
    const { container } = render(<MarkdownBody body={"1. first\n2. second"} />);
    expect(container.querySelector("ol")).toBeInTheDocument();
    const items = container.querySelectorAll("li");
    expect(items.length).toBeGreaterThanOrEqual(2);
  });

  it("renders italic text", () => {
    const { container } = render(<MarkdownBody body="*emphasis*" />);
    expect(container.querySelector("em")).toBeInTheDocument();
  });

  it("renders fenced code block", () => {
    const { container } = render(<MarkdownBody body={"```\nconst x = 1;\n```"} />);
    expect(container.querySelector("pre")).toBeInTheDocument();
  });

  it("renders horizontal rule", () => {
    const { container } = render(<MarkdownBody body={"---"} />);
    expect(container.querySelector("hr")).toBeInTheDocument();
  });
});
