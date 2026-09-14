import { describe, expect, it } from "vitest";
import { formatCommandInput, formatSizing, toFormatViewProps } from "@/lib/mgr/format-view";

const format = (patch = {}) => toFormatViewProps({ format: { id: "f", name: "", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5, ...patch } });

describe("package sizing", () => {
  it("explains why a new can format cannot be created", () => {
    const model = format({ package_type: "can", bbl_per_unit: null });
    expect(formatSizing(model)).toMatchObject({ valid: false, error: "Enter the size of one container to continue." });
    expect(formatSizing({ ...model, volumeValue: "16", unitsPerCase: "" })).toMatchObject({ valid: false, error: "Enter a whole number of containers per package, at least 1." });
    expect(formatSizing({ ...model, composed: true })).toMatchObject({ valid: false, error: "Enter a format name to continue." });
    expect(formatSizing({ ...model, volumeValue: "16", unitsPerCase: "24" })).toMatchObject({ valid: true, error: undefined });
  });
  it("derives standard keg volume and name without a second input", () => {
    expect(formatSizing(format())).toMatchObject({ name: "½ bbl keg", bbl: 0.5, valid: true });
    expect(formatSizing({ ...format(), kegSize: "sixth_bbl" }).bbl).toBeCloseTo(1 / 6);
    expect(formatSizing({ ...format(), kegSize: "fifty_l" }).bbl).toBeCloseTo(50 / (31 * 3.785411784));
  });
  it("calculates a case from container size and count and restores them on edit", () => {
    const model = format({ package_type: "can", keg_size: null, units_per_case: 24, bbl_per_unit: 384 / 3968 });
    expect(model.volumeValue).toBe("16");
    expect(formatSizing(model)).toMatchObject({ name: "24 × 16 oz cans", bbl: 384 / 3968, valid: true });
    expect(formatSizing({ ...model, unitsPerCase: "12" }).volumeLabel).toBe("1.5 gal");
    for (const count of ["", "0", "1.5", "Infinity"]) expect(formatSizing({ ...model, unitsPerCase: count }).valid).toBe(false);
  });
  it("preserves custom volumes and existing names", () => {
    const model = format({ name: "Special keg", bbl_per_unit: 0.4 });
    expect(model.kegSize).toBe("custom");
    expect(formatSizing(model)).toMatchObject({ name: "Special keg", bbl: 0.4, valid: true });
  });
  it("does not invent volume for composed packages or invalid inputs", () => {
    expect(formatSizing({ ...format(), composed: true, name: "Case" })).toMatchObject({ bbl: undefined, valid: true });
    expect(formatSizing({ ...format(), kegSize: "custom", volumeValue: "" }).valid).toBe(false);
  });
});
it("a rename alone preserves legacy keg metadata and exact stored sizing", async () => {
  const { formatCommandInput } = await import("@/lib/mgr/format-view");
  const saved = { id: "legacy", name: "⅙ Keg", basis: "packaged" as const, package_type: "keg", keg_size: "sixth_bbl", units_per_case: null, bbl_per_unit: "0.16633065" };
  const model = toFormatViewProps({ format: saved });
  expect(formatCommandInput({ ...model, name: "Renamed" }, saved)).toMatchObject({ id: "legacy", name: "Renamed", kegSize: "sixth_bbl", bblPerUnit: 0.16633065 });
});

it("preserves a legacy fleet size on volume edits without applying it to other containers", () => {
  const saved = { id: "legacy", name: "⅙ Keg", basis: "packaged" as const, package_type: "keg", keg_size: "sixth_bbl", bbl_per_unit: "0.16633065" };
  const model = toFormatViewProps({ format: saved });
  expect(formatCommandInput({ ...model, volumeValue: "0.1663" }, saved)).toMatchObject({ kegSize: "sixth_bbl", bblPerUnit: 0.1663 });
  expect(formatCommandInput({ ...model, kegSize: "half_bbl" }, saved)).toMatchObject({ kegSize: "half_bbl", bblPerUnit: 0.5 });
  expect(formatCommandInput({ ...model, packageType: "can" }, saved).kegSize).toBeUndefined();
  expect(formatCommandInput({ ...model, volumeValue: "0.1663" }).kegSize).toBeUndefined();
});
