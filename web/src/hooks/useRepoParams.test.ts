import { renderHook } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { useRepoParams } from "./useRepoParams";

vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({ org: "acme", repo: "api" })),
}));

describe("useRepoParams", () => {
  it("returns org and repo from params", () => {
    const { result } = renderHook(() => useRepoParams());
    expect(result.current.org).toBe("acme");
    expect(result.current.repo).toBe("api");
  });

  it("combines org/repo into repoId", () => {
    const { result } = renderHook(() => useRepoParams());
    expect(result.current.repoId).toBe("acme/api");
  });

  it("builds basePath from org and repo", () => {
    const { result } = renderHook(() => useRepoParams());
    expect(result.current.basePath).toBe("/repositories/acme/api");
  });
});
