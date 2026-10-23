import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importRowKey, parseCsv, mapCsvRows, readyImportRowNumbers, readyImportRows, validateImportRow } from "@/lib/import-csv";
it("parses BOM, CRLF, quoted commas/newlines and escaped quotes", () => {
  expect(parseCsv('\uFEFFname,note\r\n"A, B","one\r\ntwo ""quoted"""\r\n')).toEqual({ headers: ["name", "note"], rows: [["A, B", 'one\r\ntwo "quoted"']] });
});
it("skips blank lines, admits a bare quote inside a value, and drops Excel's sep= line (#472)", () => {
  expect(parseCsv("a,b\n1,2\n\n")).toEqual({ headers: ["a", "b"], rows: [["1", "2"]] });
  expect(parseCsv("a,b\r\n1,2\r\n\r\n3,4\r\n")).toEqual({ headers: ["a", "b"], rows: [["1", "2"], ["3", "4"]] });
  expect(parseCsv("name\nIPA\n\nPils\n")).toEqual({ headers: ["name"], rows: [["IPA"], ["Pils"]] });
  expect(parseCsv('name\n16" keg\n')).toEqual({ headers: ["name"], rows: [['16" keg']] });
  expect(parseCsv("sep=,\r\nname\r\nIPA\r\n")).toEqual({ headers: ["name"], rows: [["IPA"]] });
  expect(parseCsv('name\n""\n')).toEqual({ headers: ["name"], rows: [[""]] });
});
it("rejects malformed CSV, ambiguous headers and mismatched widths", () => {
  for (const value of ['a\n"open', 'a\n"closed"oops', 'a,a\n1,2', 'a,b\n1']) expect(() => parseCsv(value)).toThrow();
});
it("names the row cap the way the upload step writes it (#1150)", () => {
  expect(() => parseCsv(`a\n${"1\n".repeat(5001)}`)).toThrow("At most 5,000 rows per batch");
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
  expect(validateImportRow("channel_prices", { saleChannelId: "Missing channel", priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1" }, { channels: [] })).toContain("saleChannelId was not found");
});

describe("named import references (#819)", () => {
  const channel = "2dcfae24-3898-4a49-9a7a-6b699302adcc";
  const location = "405a16c9-8b19-4f21-9d5c-c48dccddcfa5";
  const bin = "65d01e96-1635-4626-a5b8-4d57f2d7fb4f";
  const sku = "c4fba617-d414-450c-9d71-28f599456169";
  const lookups = {
    channels: [{ id: channel, name: "Wholesale" }],
    skus: [{ id: sku, name: "Lager half keg" }],
    locations: [{ id: location, name: "Cooler A" }],
    bins: [{ id: bin, name: "Shelf 1", location_id: location }],
  };
  const customer = { name: "Named reference", type: "retailer", state: "PA", saleChannelId: "  wHoLeSaLe  " };
  it("accepts a trimmed exact reference name without rewriting the command payload", () => {
    expect(validateImportRow("customers", customer)).toEqual([]);
    expect(validateImportRow("customers", customer, lookups)).toEqual([]);
    expect(customer.saleChannelId).toBe("  wHoLeSaLe  ");
    expect(validateImportRow("customers", { ...customer, saleChannelId: channel.toUpperCase() }, lookups)).toEqual([]);
  });
  it("reads any hex id as an id, as the RPC does, not only RFC-variant UUIDs", () => {
    const legacy = "00000000-0000-0000-0000-000000000001";
    expect(validateImportRow("customers", { ...customer, saleChannelId: legacy }, { ...lookups, channels: [{ id: legacy, name: "Legacy" }] })).toEqual([]);
  });
  it("blocks missing and ambiguous names instead of picking the first match", () => {
    expect(validateImportRow("customers", { ...customer, saleChannelId: "Whole" }, lookups)).toEqual(["saleChannelId was not found"]);
    expect(validateImportRow("customers", customer, { ...lookups, channels: [...lookups.channels, { id: crypto.randomUUID(), name: " WHOLESALE " }] })).toEqual(['saleChannelId: "wHoLeSaLe" matches 2 records; use the ID']);
  });
  it("matches a bin name only within the resolved location", () => {
    const bins = [...lookups.bins, { id: crypto.randomUUID(), name: "Shelf 1", location_id: crypto.randomUUID() }];
    expect(validateImportRow("opening_balances", { skuId: sku, locationId: "Cooler A", binId: "Shelf 1", qty: "2" }, { ...lookups, bins })).toEqual([]);
  });
  it("matches price formats within their resolved group and products against packaged formats", () => {
    const group = "a7d14f15-d9d4-45b2-b6d9-e5d96ae654a3";
    const formats = [
      { id: bin, name: "Pint", basis: "poured", price_group_id: group },
      { id: location, name: "Pint", basis: "poured", price_group_id: channel },
    ];
    const references = { ...lookups, groups: [{ id: group, name: "House beer" }], formats };
    expect(validateImportRow("channel_prices", { saleChannelId: "Wholesale", priceGroupId: "House beer", formatId: "Pint", unitPriceCents: "600" }, references)).toEqual([]);
    expect(validateImportRow("products_skus", { product: "Lager", formatId: "Pint" }, references)).toEqual(["formatId was not found"]);
  });
  it("checks bin membership using resolved location and bin identities", () => {
    const row = { skuId: "Lager half keg", locationId: "cooler a", binId: "Shelf 1", qty: "2" };
    expect(validateImportRow("opening_balances", row, lookups)).toEqual([]);
    expect(validateImportRow("opening_balances", { ...row, binId: bin }, { ...lookups, bins: [{ ...lookups.bins[0], location_id: crypto.randomUUID() }] })).toEqual(["binId must belong to locationId"]);
  });
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
  expect(adapter).toContain('send.run("import_csv", { kind: action.kind, rows: action.rows }, data => setResult(data as ImportResult),');
  expect(adapter).toContain("{ requestId: action.requestId, owner: { id: IMPORT_OWNER, data: action.previewRows }, refresh: false }");
  expect(adapter).toContain('readRecoveries(sessionStorage, renderedContext).find(row => row.owner?.id === IMPORT_OWNER)');
  expect(adapter).toContain('result.outcomes.filter(row => row.status === "blocked")');
  expect(adapter).toContain("discardRecovery(sessionStorage, batch.expectedContext, batch.requestId)");
  expect(adapter).toContain("onDiscard={discard}");
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

// #758: import_csv serializes rows that share a key, so they keep file order.
describe("importRowKey", () => {
  it("groups exactly the rows that can collide in the database", () => {
    const key = (kind: Parameters<typeof importRowKey>[0], row: Record<string, string>, index = 0) => importRowKey(kind, row, index);
    expect(key("customers", { name: " Acme " })).toBe(key("customers", { name: "Acme" }, 1));
    expect(key("customers", { name: "Acme" })).not.toBe(key("customers", { name: "acme" }, 1));
    expect(key("products_skus", { product: "IPA", formatId: "a" })).toBe(key("products_skus", { product: "IPA", formatId: "b" }, 1));
    const cell = { saleChannelId: "s", priceGroupId: "g", formatId: "F" };
    expect(key("channel_prices", cell)).toBe(key("channel_prices", { ...cell, formatId: "f" }, 1));
    expect(key("ship_tos", { customerId: "c" })).not.toBe(key("ship_tos", { customerId: "c" }, 1));
    expect(key("opening_balances", { skuId: "s" })).not.toBe(key("opening_balances", { skuId: "s" }, 1));
  });
});

// docs/plans/lolev-orders.md task 2: country and alias are optional CSV columns;
// state, and a ship-to's street, city and ZIP, are required only for US rows.
describe("country and alias columns", () => {
  const channel = crypto.randomUUID();
  it("a customer row takes country and alias; state is required only for US", () => {
    expect(validateImportRow("customers", { name: "Odyssey", type: "distributor", country: "CN", alias: "china", saleChannelId: channel })).toEqual([]);
    expect(validateImportRow("customers", { name: "Sarene", type: "distributor", saleChannelId: channel })).toEqual(["state is required"]);
    expect(validateImportRow("customers", { name: "Sarene", type: "distributor", country: "US", saleChannelId: channel })).toEqual(["state is required"]);
    expect(validateImportRow("customers", { name: "Sarene", type: "distributor", state: "PA", saleChannelId: channel })).toEqual([]);
    expect(validateImportRow("customers", { name: "Odyssey", type: "distributor", country: "XX", saleChannelId: channel }).join(" ")).toMatch(/country/);
    expect(validateImportRow("customers", { name: "Odyssey", type: "distributor", country: "CN", state: "PA", saleChannelId: channel }).join(" ")).toMatch(/state/);
  });
  it("a foreign ship-to row needs only its customer and label", () => {
    const customerId = crypto.randomUUID();
    expect(validateImportRow("ship_tos", { customerId, label: "Main", country: "JP" })).toEqual([]);
    // A US ship-to needs only its state; street, city and ZIP are optional (user, 2026-10-15).
    expect(validateImportRow("ship_tos", { customerId, label: "Main" })).toEqual(["state is required"]);
    expect(validateImportRow("ship_tos", { customerId, label: "Main", state: "OH" })).toEqual([]);
  });
});
