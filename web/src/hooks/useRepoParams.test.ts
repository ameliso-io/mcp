import { renderHook } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { useRepoParams } from "./useRepoParams";

const { mockUseParams } = vi.hoisted(() => ({
  mockUseParams: vi.fn(() => ({ org: "acme", repo: "api" })),
}));

vi.mock("next/navigation", () => ({
  useParams: mockUseParams,
}));

describe("useRepoParams", () => {
  it("derives repoId and basePath from route params", () => {
    const { result } = renderHook(() => useRepoParams());
    expect(result.current.org).toBe("acme");
    expect(result.current.repo).toBe("api");
    expect(result.current.repoId).toBe("acme/api");
    expect(result.current.basePath).toBe("/repositories/acme/api");
  });

  it("updates when params change", () => {
    mockUseParams.mockReturnValue({ org: "corp", repo: "backend" });
    const { result } = renderHook(() => useRepoParams());
    expect(result.current.repoId).toBe("corp/backend");
    expect(result.current.basePath).toBe("/repositories/corp/backend");
  });
});
