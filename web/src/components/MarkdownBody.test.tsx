import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import MarkdownBody from "./MarkdownBody";

beforeEach(() => {
  document.getElementById("ameliso-md-styles")?.remove();
});

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
    expect(container.querySelector(".md-body")).toBeInTheDocument();
  });

  it("applies maxHeight style when prop provided", () => {
    const { container } = render(<MarkdownBody body="text" maxHeight="200px" />);
    const div = container.querySelector(".md-body") as HTMLElement;
    expect(div.style.maxHeight).toBe("200px");
    expect(div.style.overflowY).toBe("auto");
  });

  it("uses maxHeight none and no overflowY when prop omitted", () => {
    const { container } = render(<MarkdownBody body="text" />);
    const div = container.querySelector(".md-body") as HTMLElement;
    expect(div.style.maxHeight).toBe("none");
    expect(div.style.overflowY).toBe("");
  });

  it("injects style tag into document head on mount", () => {
    render(<MarkdownBody body="text" />);
    expect(document.getElementById("ameliso-md-styles")).toBeInTheDocument();
  });

  it("does not inject duplicate style tags on re-render", () => {
    render(<MarkdownBody body="first" />);
    render(<MarkdownBody body="second" />);
    const tags = document.querySelectorAll("#ameliso-md-styles");
    expect(tags.length).toBe(1);
  });

  it("renders inline code", () => {
    const { container } = render(<MarkdownBody body="use `npm install`" />);
    expect(container.querySelector("code")).toBeInTheDocument();
  });

  it("renders paragraph text", () => {
    render(<MarkdownBody body="plain paragraph" />);
    expect(screen.getByText("plain paragraph")).toBeInTheDocument();
  });
});
