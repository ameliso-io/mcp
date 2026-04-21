import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { useRepoId } from "./useRepoId";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("useRepoId", () => {
  it("returns empty string when localStorage is empty", () => {
    const { result } = renderHook(() => useRepoId());
    expect(result.current[0]).toBe("");
  });

  it("loads initial value from localStorage", () => {
    localStorage.setItem("ameliso:repoId", "owner/repo");
    const { result } = renderHook(() => useRepoId());
    expect(result.current[0]).toBe("owner/repo");
  });

  it("updates state and localStorage on set", () => {
    const { result } = renderHook(() => useRepoId());
    act(() => result.current[1]("owner/new-repo"));
    expect(result.current[0]).toBe("owner/new-repo");
    expect(localStorage.getItem("ameliso:repoId")).toBe("owner/new-repo");
  });

  it("unsubscribes from events on unmount", () => {
    const { unmount } = renderHook(() => useRepoId());
    unmount();
  });
});
