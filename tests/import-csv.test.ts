import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseCsv, mapCsvRows, readyImportRowNumbers, readyImportRows, validateImportRow } from "@/lib/import-csv";
it("parses BOM, CRLF, quoted commas/newlines and escaped quotes", () => {
  expect(parseCsv('\uFEFFname,note\r\n"A, B","one\r\ntwo ""quoted"""\r\n')).toEqual({ headers: ["name", "note"], rows: [["A, B", 'one\r\ntwo "quoted"']] });
});
it("rejects malformed CSV, ambiguous headers and mismatched widths", () => {
  for (const value of ['a\n"open', 'a\n"closed"oops', 'a\nun"quoted', 'a,a\n1,2', 'a,b\n1']) expect(() => parseCsv(value)).toThrow();
});
it("maps explicit fields and rejects blank, fractional cents and nondecimal numbers", () => {
  expect(mapCsvRows([["IPA", "2"]], { product: 0 })).toEqual([{ product: "IPA" }]);
  const ids = { skuId: crypto.randomUUID(), locationId: crypto.randomUUID(), binId: crypto.randomUUID() };
  for (const qty of ["", "NaN", "Infinity", "0x10", "1e3", "0", "-2"]) expect(validateImportRow("opening_balances", { ...ids, qty })).not.toEqual([]);
  expect(validateImportRow("opening_balances", { ...ids, qty: "1.25" })).toEqual([]);
  // record_inventory_movement refuses qty <> round(qty, 2); the preview must too.
  expect(validateImportRow("opening_balances", { ...ids, qty: "1.234" })).toEqual(["qty must be a positive number with at most two decimal places"]);
  expect(validateImportRow("opening_balances", { ...ids, qty: "1.230" })).toEqual([]);
  expect(validateImportRow("channel_prices", { saleChannelId: ids.skuId, priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1.2" })).not.toEqual([]);
  expect(validateImportRow("channel_prices", { saleChannelId: "not-a-uuid", priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1" })).not.toEqual([]);
});

it("keeps only the rows the preview marked ready", () => {
  const rows = [{ name: "a" }, { name: "b" }, { name: "c" }];
  expect(readyImportRows(rows, [[], ["type is required"], []])).toEqual([{ name: "a" }, { name: "c" }]);
});

it("numbers each sent row by its preview row, so outcome row 2 is preview row 3 when row 2 was blocked", () => {
  const sent = readyImportRowNumbers([[], ["type is required"], []]);
  expect(sent).toEqual([1, 3]);
  expect(sent[2 - 1]).toBe(3);
});

it("the import wizard binds the shared explorer steps, Select, and Attachment controls", () => {
  const adapter = readFileSync("app/(app)/settings/import/import-wizard.tsx", "utf8");
  expect(adapter).toContain("<ImportView");
  expect(adapter).toContain("const action = batch ?? { requestId: crypto.randomUUID(), kind, rows: readyImportRows(rows, validation), previewRows: readyImportRowNumbers(validation), expectedContext: renderedContext }");
  expect(adapter).toContain('"import_csv", { kind: action.kind, rows: action.rows }, action.requestId, action.expectedContext');
  expect(adapter).toContain('result.outcomes.filter(row => row.status === "blocked")');
  const source = readFileSync("components/mgr/views/import.tsx", "utf8");
  expect(source).toMatch(/from "@\/components\/mgr\/e"/);
  expect(source).toContain("E.pick(field.name");
  expect(readFileSync("components/mgr/e.tsx", "utf8")).toContain("<SelectGroup>");
  expect(source).toMatch(/from "@\/components\/ui\/attachment"/);
  expect(source).toMatch(/<Attachment\b/);
  expect(source).toContain("E.stp");
  expect(source).toContain("<ToggleGroup");
  expect(source).toContain('E.tbl(["row", "record", "match", "state"]');
  expect(source).toContain("String(model.previewRows?.[row.row - 1] ?? row.row)");
  expect(source).not.toMatch(/<select\b/);
  expect(source).not.toMatch(/<input type="file"[^>]*className=\{control\}/);
});
