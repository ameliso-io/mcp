import { describe, it, expect } from "vitest";
import { ConnectError, Code } from "@connectrpc/connect";
import { errorMessage } from "./errorMessage";

describe("errorMessage", () => {
  it("returns message from ConnectError", () => {
    const err = new ConnectError("permission denied", Code.PermissionDenied);
    expect(errorMessage(err)).toBe("[permission_denied] permission denied");
  });

  it("returns rawMessage from ConnectError when message is empty", () => {
    const err = new ConnectError("raw only", Code.Unknown);
    Object.defineProperty(err, "message", { value: "" });
    expect(errorMessage(err)).toBe("raw only");
  });

  it("returns message from plain Error", () => {
    expect(errorMessage(new Error("something broke"))).toBe("something broke");
  });

  it("stringifies non-Error values", () => {
    expect(errorMessage("oops")).toBe("oops");
    expect(errorMessage(42)).toBe("42");
    expect(errorMessage(null)).toBe("null");
  });

  it("falls back to String(e) when message and rawMessage are both empty", () => {
    const err = new ConnectError("fallback", Code.Unknown);
    Object.defineProperty(err, "message", { value: "" });
    Object.defineProperty(err, "rawMessage", { value: "" });
    expect(errorMessage(err)).toBe(String(err));
  });
});
