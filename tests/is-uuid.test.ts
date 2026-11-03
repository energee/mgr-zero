// tests/is-uuid.test.ts — the one UUID shape check shared by the command route,
// bearer context, and untrusted provider input (#764).
import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

describe("isUuid", () => {
  it("accepts a canonical UUID", () => expect(isUuid("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e")).toBe(true));
  it("accepts nil and max UUIDs but rejects a non-RFC variant", () => {
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
    expect(isUuid("ffffffff-ffff-ffff-ffff-ffffffffffff")).toBe(true);
    expect(isUuid("3f2b8c1e-4d5a-4b6c-0d7e-9f0a1b2c3d4e")).toBe(false);
  });
  it("rejects missing, empty, and malformed values", () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e' or 1=1")).toBe(false);
  });
});
