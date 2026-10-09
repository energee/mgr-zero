// tests/is-uuid.test.ts — the one UUID shape check shared by the command route,
// bearer context, and untrusted provider input (#764).
import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/commands/context";

describe("isUuid", () => {
  it("accepts a canonical UUID", () => expect(isUuid("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e")).toBe(true));
  it("rejects missing, empty, and malformed values", () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e' or 1=1")).toBe(false);
  });
});
