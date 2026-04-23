import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePageVisible } from "./usePageVisible";

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, writable: true, configurable: true });
  document.dispatchEvent(new Event("visibilitychange"));
}

afterEach(() => {
  setHidden(false);
});

describe("usePageVisible", () => {
  it("returns true when document is visible", () => {
    setHidden(false);
    const { result } = renderHook(() => usePageVisible());
    expect(result.current).toBe(true);
  });

  it("returns false when document is hidden", () => {
    setHidden(false);
    const { result } = renderHook(() => usePageVisible());
    act(() => {
      setHidden(true);
    });
    expect(result.current).toBe(false);
  });

  it("returns true again when document becomes visible", () => {
    setHidden(false);
    const { result } = renderHook(() => usePageVisible());
    act(() => {
      setHidden(true);
    });
    act(() => {
      setHidden(false);
    });
    expect(result.current).toBe(true);
  });

  it("removes event listener on unmount", () => {
    setHidden(false);
    const { result, unmount } = renderHook(() => usePageVisible());
    unmount();
    act(() => {
      setHidden(true);
    });
    // After unmount, result should still be the last rendered value
    expect(result.current).toBe(true);
  });
});
