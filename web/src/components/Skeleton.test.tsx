import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import Skeleton from "./Skeleton";

describe("Skeleton", () => {
  it("renders a span with aria-hidden", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("aria-hidden", "true");
  });

  it("applies width and height via style", () => {
    const { container } = render(<Skeleton width={200} height={20} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("20px");
  });

  it("applies string width and height", () => {
    const { container } = render(<Skeleton width="100%" height="2rem" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("100%");
    expect(el.style.height).toBe("2rem");
  });

  it("applies borderRadius via style", () => {
    const { container } = render(<Skeleton borderRadius={8} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderRadius).toBe("8px");
  });

  it("merges extra style prop", () => {
    const { container } = render(<Skeleton style={{ marginBottom: 12 }} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.marginBottom).toBe("12px");
  });

  it("appends className", () => {
    const { container } = render(<Skeleton className="extra" />);
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("extra");
  });

  it("renders without props", () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toBeTruthy();
  });
});
