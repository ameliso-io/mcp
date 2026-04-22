import { describe, it, expect } from "vitest";
import { pageMetadata } from "./metadata";

describe("pageMetadata", () => {
  it("returns title and description", () => {
    const meta = pageMetadata("My Page", "A description");
    expect(meta.title).toBe("My Page");
    expect(meta.description).toBe("A description");
  });

  it("sets openGraph title and description", () => {
    const meta = pageMetadata("My Page", "A description");
    expect(meta.openGraph?.title).toBe("My Page");
    expect(meta.openGraph?.description).toBe("A description");
  });

  it("sets twitter title and description", () => {
    const meta = pageMetadata("My Page", "A description");
    expect(meta.twitter?.title).toBe("My Page");
    expect(meta.twitter?.description).toBe("A description");
  });
});
