import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useInterval } from "./useInterval";

describe("useInterval", () => {
  it("does not call callback when delayMs is null", async () => {
    const cb = vi.fn();
    renderHook(() => useInterval(cb, null));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(cb).not.toHaveBeenCalled();
  });

  it("calls callback after delayMs", async () => {
    const cb = vi.fn();
    renderHook(() => useInterval(cb, 50));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("stops calling callback when delayMs changes to null", async () => {
    const cb = vi.fn();
    const { rerender } = renderHook(({ delay }) => useInterval(cb, delay), {
      initialProps: { delay: 50 as number | null },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 70));
    });
    const countAfterFirst = cb.mock.calls.length;
    rerender({ delay: null });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(cb.mock.calls.length).toBe(countAfterFirst);
  });

  it("always calls the latest callback ref", async () => {
    const results: string[] = [];
    const { rerender } = renderHook(({ label }) => useInterval(() => results.push(label), 50), {
      initialProps: { label: "a" },
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 70));
    });
    rerender({ label: "b" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 70));
    });
    expect(results.at(-1)).toBe("b");
  });
});
