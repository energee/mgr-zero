import { expect, it } from "vitest";
import { stepQuantity } from "../lib/mgr/quantity-input";

it.each([
  ["2.01", -1, "1.01"],
  ["1.01", -1, "0.01"],
  ["0.01", 1, "1.01"],
  ["2.3456", 1, "3.3456"],
  ["-2.01", 1, "-1.01"],
  ["1.2345e-3", 1, "1.0012345"],
  ["2.01e2", -1, "200"],
  ["", 1, "1"],
  ["24", -1, "23"],
] as const)("steps %s by %s without changing decimal precision", (value, direction, expected) => {
  expect(stepQuantity(value, direction)).toBe(expected);
});

it("clamps to the original bounds without rounding them", () => {
  expect(stepQuantity("0.01", -1, 0)).toBe("0");
  expect(stepQuantity("0", -1, 0.005)).toBe("0.005");
  expect(stepQuantity("5.9", 1, 0, 6.25)).toBe("6.25");
});
