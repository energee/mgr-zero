import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseCsv, mapCsvRows, validateImportRow } from "@/lib/import-csv";
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
  expect(validateImportRow("channel_prices", { saleChannelId: ids.skuId, priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1.2" })).not.toEqual([]);
  expect(validateImportRow("channel_prices", { saleChannelId: "not-a-uuid", priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1" })).not.toEqual([]);
});

it("the import wizard composes shadcn Select and Attachment controls", () => {
  const source = readFileSync("app/(app)/settings/import/import-wizard.tsx", "utf8");
  expect(source).toMatch(/from "@\/components\/ui\/select"/);
  expect(source).toMatch(/<SelectGroup>/);
  expect(source).toMatch(/from "@\/components\/ui\/attachment"/);
  expect(source).toMatch(/<Attachment\b/);
  expect(source).toMatch(/from "@\/components\/ui\/timeline"/);
  expect(source).toMatch(/<Timeline\b/);
  expect(source).not.toMatch(/<select\b/);
  expect(source).not.toMatch(/E\.stp/);
  expect(source).not.toMatch(/<input type="file"[^>]*className=\{control\}/);
});
