import { renderHook, act } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useAbortController } from "./useAbortController";

describe("useAbortController", () => {
  it("returns a signal that is not yet aborted", () => {
    const { result } = renderHook(() => useAbortController());
    const signal = result.current();
    expect(signal.aborted).toBe(false);
  });

  it("aborts previous signal when next() is called again", () => {
    const { result } = renderHook(() => useAbortController());
    let signal1: AbortSignal;
    act(() => {
      signal1 = result.current();
    });
    act(() => {
      result.current();
    });
    expect(signal1!.aborted).toBe(true);
  });

  it("new signal is not aborted after calling next() again", () => {
    const { result } = renderHook(() => useAbortController());
    act(() => {
      result.current(); // first call
    });
    let signal2: AbortSignal;
    act(() => {
      signal2 = result.current(); // second call
    });
    expect(signal2!.aborted).toBe(false);
  });

  it("aborts the active signal on unmount", () => {
    const { result, unmount } = renderHook(() => useAbortController());
    const signal = result.current();
    expect(signal.aborted).toBe(false);
    unmount();
    expect(signal.aborted).toBe(true);
  });

  it("does not error on unmount when no signal was created", () => {
    const { unmount } = renderHook(() => useAbortController());
    expect(() => unmount()).not.toThrow();
  });

  it("returns the same function reference across re-renders", () => {
    const { result, rerender } = renderHook(() => useAbortController());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
