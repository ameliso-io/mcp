import { renderHook, act } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useRouteReplace } from "./useRouteReplace";

const { mockRouter, mockSearchParams } = vi.hoisted(() => ({
  mockRouter: { replace: vi.fn() },
  mockSearchParams: { toString: vi.fn(() => "") },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchParams.toString.mockReturnValue("");
});

describe("useRouteReplace", () => {
  it("calls router.replace with tab path when no params", () => {
    const { result } = renderHook(() => useRouteReplace("/repos/r/runs"));
    act(() => {
      result.current(() => {});
    });
    expect(mockRouter.replace).toHaveBeenCalledWith("/repos/r/runs", { scroll: false });
  });

  it("appends query string when mutator sets params", () => {
    mockSearchParams.toString.mockReturnValue("");
    const { result } = renderHook(() => useRouteReplace("/repos/r/runs"));
    act(() => {
      result.current((params) => {
        params.set("status", "completed");
      });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/repos/r/runs?status=completed",
      { scroll: false }
    );
  });

  it("preserves existing params and applies mutation", () => {
    mockSearchParams.toString.mockReturnValue("run=abc");
    const { result } = renderHook(() => useRouteReplace("/repos/r/runs"));
    act(() => {
      result.current((params) => {
        params.set("status", "completed");
      });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/repos/r/runs?run=abc&status=completed",
      { scroll: false }
    );
  });

  it("deletes params via mutation", () => {
    mockSearchParams.toString.mockReturnValue("status=in-progress&run=abc");
    const { result } = renderHook(() => useRouteReplace("/repos/r/runs"));
    act(() => {
      result.current((params) => {
        params.delete("status");
      });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/repos/r/runs?run=abc",
      { scroll: false }
    );
  });

  it("calls router.replace without ? when all params deleted", () => {
    mockSearchParams.toString.mockReturnValue("status=in-progress");
    const { result } = renderHook(() => useRouteReplace("/repos/r/runs"));
    act(() => {
      result.current((params) => {
        params.delete("status");
      });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith("/repos/r/runs", { scroll: false });
  });

  it("uses tabPath from argument", () => {
    const { result } = renderHook(() => useRouteReplace("/repos/r/overview"));
    act(() => {
      result.current((params) => {
        params.set("filter", "passed");
      });
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/repos/r/overview?filter=passed",
      { scroll: false }
    );
  });
});
