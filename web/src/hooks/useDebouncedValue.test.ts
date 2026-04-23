import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebouncedValue } from "./useDebouncedValue";

describe("useDebouncedValue", () => {
  it("returns initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("hello", 300));
    expect(result.current).toBe("hello");
  });

  it("debounces updates by delayMs", async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 50), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    expect(result.current).toBe("a");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(result.current).toBe("b");
  });

  it("cancels pending update when value changes rapidly", async () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 50), {
      initialProps: { value: "a" },
    });
    rerender({ value: "b" });
    rerender({ value: "c" });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(result.current).toBe("c");
  });
});
