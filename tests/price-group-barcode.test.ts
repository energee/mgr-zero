// tests/price-group-barcode.test.ts — a SKU's barcode is not stored on the
// SKU. It resolves brand -> price group -> (group x format) UPC, with no
// override at any hop, so every brand in a group scans alike. Pure, so this
// walks the chain without a DOM or a database.
import { describe, expect, it } from "vitest";
import { resolveBarcode, type BarcodeLookup } from "../lib/mgr/price-group-barcode";

const lookup: BarcodeLookup = {
  brandGroup: (brand) =>
    ({ "Hazy IPA": "Standard", Pils: "Standard", "Barrel-aged Stout": "Specialty" })[brand],
  group: (name) =>
    ({
      Standard: { name: "Standard", formats: [
        { format: "case · 24×16oz", upc: "00810123450127" },
        { format: "½ bbl keg", upc: null },
      ] },
      Specialty: { name: "Specialty", formats: [
        { format: "case · 24×16oz", upc: "00810123450134" },
      ] },
    })[name],
};

describe("resolveBarcode", () => {
  it("gives every brand in a group the same code for a format", () => {
    expect(resolveBarcode(lookup, "Hazy IPA", "case · 24×16oz")).toBe("00810123450127");
    expect(resolveBarcode(lookup, "Pils", "case · 24×16oz")).toBe("00810123450127");
  });

  it("separates groups", () => {
    expect(resolveBarcode(lookup, "Barrel-aged Stout", "case · 24×16oz")).toBe("00810123450134");
  });

  it("returns null rather than throwing at every missing hop", () => {
    expect(resolveBarcode(lookup, "Hazy IPA", "½ bbl keg")).toBeNull();
    expect(resolveBarcode(lookup, "Hazy IPA", "sixtel")).toBeNull();
    expect(resolveBarcode(lookup, "Guest cider", "case · 24×16oz")).toBeNull();
    expect(resolveBarcode(lookup, "Barrel-aged Stout", "½ bbl keg")).toBeNull();
  });
});
