import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { useAnnounce } from "./useAnnounce";

describe("useAnnounce", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with empty message", () => {
    const { result } = renderHook(() => useAnnounce());
    expect(result.current[0]).toBe("");
  });

  it("sets message after 50ms", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAnnounce());
    act(() => result.current[1]("Hello"));
    expect(result.current[0]).toBe("");
    await act(async () => vi.advanceTimersByTime(50));
    expect(result.current[0]).toBe("Hello");
  });

  it("re-announces same text by clearing first", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAnnounce());
    await act(async () => {
      result.current[1]("Saved");
      vi.advanceTimersByTime(50);
    });
    expect(result.current[0]).toBe("Saved");

    act(() => result.current[1]("Saved"));
    expect(result.current[0]).toBe("");
    await act(async () => vi.advanceTimersByTime(50));
    expect(result.current[0]).toBe("Saved");
  });

  it("second rapid announce cancels first, only final message appears", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAnnounce());
    act(() => result.current[1]("First"));
    act(() => result.current[1]("Second"));
    await act(async () => vi.advanceTimersByTime(50));
    expect(result.current[0]).toBe("Second");
  });

  it("returns stable announce function reference", () => {
    const { result, rerender } = renderHook(() => useAnnounce());
    const first = result.current[1];
    rerender();
    expect(result.current[1]).toBe(first);
  });
});
