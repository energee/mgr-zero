// #491: state codes, ZIP codes, UPCs and phone numbers are checked for shape at
// the command boundary, so "ZZ", "abcde", "not-a-upc!!" and "abc" never save.
// Pure: only parses command input schemas, never runs a handler.
import { describe, expect, it } from "vitest";
import { getCommandDefinition } from "@/lib/commands/registry";
import { validateImportRow } from "@/lib/import-csv";
import "@/lib/commands/all";

/** Whether `command` raises an issue at the top-level field `field` for `value`; other fields may be missing. */
function fieldRejects(command: string, field: string, value: string): boolean {
  const parsed = getCommandDefinition(command)!.input.safeParse({ [field]: value });
  return !parsed.success && parsed.error.issues.some((i) => i.path.length === 1 && i.path[0] === field);
}

describe("field shapes are validated (#491)", () => {
  it.each([
    ["upsert_customer", "state"], ["upsert_ship_to", "state"], ["upsert_brewery_state_license", "state"], ["upsert_state_registration", "state"],
  ])("%s rejects a two-letter code that is not a US state, accepts a real one", (command, field) => {
    expect(fieldRejects(command, field, "ZZ")).toBe(true);
    expect(fieldRejects(command, field, "OR")).toBe(false);
    expect(fieldRejects(command, field, "DC")).toBe(false);
  });

  it("upsert_ship_to takes a 5-digit ZIP or ZIP+4, not letters", () => {
    expect(fieldRejects("upsert_ship_to", "zip", "abcde")).toBe(true);
    expect(fieldRejects("upsert_ship_to", "zip", "1234")).toBe(true);
    expect(fieldRejects("upsert_ship_to", "zip", "97201")).toBe(false);
    expect(fieldRejects("upsert_ship_to", "zip", "97201-1234")).toBe(false);
  });

  it.each(["create_sku", "update_sku"])("%s takes a UPC/EAN/GTIN of 8, 12, 13 or 14 digits, or none", (command) => {
    expect(fieldRejects(command, "upc", "not-a-upc!!")).toBe(true);
    expect(fieldRejects(command, "upc", "12345")).toBe(true);
    expect(fieldRejects(command, "upc", "012345678905")).toBe(false);
    expect(fieldRejects(command, "upc", "4006381333931")).toBe(false);
    expect(fieldRejects(command, "upc", "")).toBe(false);
  });

  it.each([["upsert_vendor", "phone"], ["update_brewery", "customerPhone"]])("%s %s takes a phone number, not letters", (command, field) => {
    expect(fieldRejects(command, field, "abc")).toBe(true);
    expect(fieldRejects(command, field, "12")).toBe(true);
    expect(fieldRejects(command, field, "(503) 555-0142")).toBe(false);
    expect(fieldRejects(command, field, "+1 503.555.0142")).toBe(false);
  });

  it("CSV import rejects a state that is not a US state code", () => {
    const row = { name: "Bar", type: "retailer", state: "ZZ", saleChannelId: crypto.randomUUID() };
    expect(validateImportRow("customers", row).join(" ")).toMatch(/state/);
    expect(validateImportRow("customers", { ...row, state: "OR" })).toEqual([]);
  });
});
