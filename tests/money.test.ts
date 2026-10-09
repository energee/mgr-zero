// tests/money.test.ts — dollars field text to integer cents, the inverse of dollarsInput (#764).
import { describe, expect, it } from "vitest";
import { dollarsInput, toCents } from "@/lib/mgr/money";

describe("toCents", () => {
  it("rounds a dollars string to whole cents", () => {
    expect(toCents("12.5")).toBe(1250);
    expect(toCents("0.07")).toBe(7);
    expect(toCents("3")).toBe(300);
  });
  it("reads an empty field as no value", () => expect(toCents("")).toBeUndefined());
  it("round-trips dollarsInput", () => expect(toCents(dollarsInput(1999))).toBe(1999));
});
