import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import MarkdownBody from "./MarkdownBody";

describe("MarkdownBody", () => {
  it("renders markdown as HTML", () => {
    const { container } = render(<MarkdownBody body="# Hello" />);
    expect(container.querySelector("h1")).toHaveTextContent("Hello");
  });

  it("renders paragraph text", () => {
    const { container } = render(<MarkdownBody body="Some text" />);
    expect(container.querySelector("p")).toHaveTextContent("Some text");
  });

  it("renders ordered list", () => {
    const { container } = render(<MarkdownBody body={"1. First\n2. Second\n"} />);
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("First");
    expect(items[1]).toHaveTextContent("Second");
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownBody body="Use `foo()` here" />);
    expect(container.querySelector("code")).toHaveTextContent("foo()");
  });

  it("renders bold and italic", () => {
    const { container } = render(<MarkdownBody body="**bold** and *italic*" />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
    expect(container.querySelector("em")).toHaveTextContent("italic");
  });

  it("applies md-body class", () => {
    const { container } = render(<MarkdownBody body="text" />);
    expect(container.firstChild).toHaveClass("md-body");
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

  it("renders raw HTML passed through marked (caller is responsible for sanitization)", () => {
    const { container } = render(<MarkdownBody body="plain **bold** text" />);
    expect(container.querySelector("strong")).toHaveTextContent("bold");
  });
});
