import { describe, expect, it } from "vitest";
import { canComposeFormat, eligibleChildren, validFormatRows } from "../lib/format-edit-rules";

describe("format replacement controls", () => {
  const atomic = { id: "can", basis: "packaged", bbl_per_unit: "0.01", composed: false };
  it("admits only other atomic packaged children with a typed volume", () => {
    expect(eligibleChildren("parent", [atomic, { ...atomic, id: "parent" }, { ...atomic, id: "nested", composed: true }, { ...atomic, id: "pour", basis: "poured" }, { ...atomic, id: "empty", bbl_per_unit: null }])).toEqual([atomic]);
  });
  it("requires complete positive unique eligible rows and deliberate clearing", () => {
    expect(validFormatRows([{ id: "can", qty: "2" }], ["can"], false)).toBe(true);
    for (const rows of [[{ id: "", qty: "1" }], [{ id: "can", qty: "" }], [{ id: "can", qty: "-1" }], [{ id: "can", qty: "Infinity" }], [{ id: "parent", qty: "1" }], [{ id: "can", qty: "1" }, { id: "can", qty: "2" }]]) expect(validFormatRows(rows, ["can"], false)).toBe(false);
    expect(validFormatRows([], [], false)).toBe(false);
    expect(validFormatRows([], [], true)).toBe(true);
  });
  it("does not offer a replacement the baseline forbids, including clearing", () => {
    expect(canComposeFormat({ basis: "packaged", bbl_per_unit: null }, false)).toBe(true);
    expect(canComposeFormat(atomic, false)).toBe(false);
    expect(canComposeFormat({ basis: "packaged", bbl_per_unit: null }, true)).toBe(false);
    expect(canComposeFormat({ basis: "poured", bbl_per_unit: null }, false)).toBe(false);
  });
});
