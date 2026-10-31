import { describe, expect, it } from "vitest";
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, IMPORT_KINDS, canReviewImport, importRowKey, importTemplateCsv, importTemplateName, parseCsv, mapCsvRows, readyImportRowNumbers, readyImportRows, validateImportRow, validateImportRows } from "@/lib/import-csv";
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
it("explains how to fix empty and non-CSV files (#1395)", () => {
  for (const input of ["", "\n\n", "\uFEFFsep=,\r\n\r\n"]) {
    expect(() => parseCsv(input)).toThrow("This file is empty. Add a header row and at least one data row.");
  }
  for (const input of ["\0", "name\njunk\0", 'name\n"unclosed\0']) {
    expect(() => parseCsv(input)).toThrow("This file is not a CSV. In Excel or Google Sheets, save it as CSV and choose it again.");
  }
});
it("writes header-only and bad-header errors as full sentences with a fix (#1497)", () => {
  expect(() => parseCsv("name,type\n")).toThrow("This file has column headers but no data rows. Add at least one record below the header row and choose the file again.");
  for (const input of ["a,a\n1,2", "a,\n1,2"]) {
    expect(() => parseCsv(input)).toThrow("Every column in the header row needs its own name, and no two can match. Fix the first row and choose the file again.");
  }
});
it("ignores capitals and spaces in customer type and payment terms, so the batch sends stored values (#1497)", () => {
  const [row] = mapCsvRows("customers", [["Ridgeline", " Retailer ", "NET30", "PA", "Wholesale"]], { name: 0, type: 1, paymentTerms: 2, state: 3, saleChannelId: 4 });
  expect(row).toEqual({ name: "Ridgeline", type: "retailer", paymentTerms: "net30", state: "PA", saleChannelId: "Wholesale" });
  expect(validateImportRow("customers", row)).toEqual([]);
});
it("names the row cap the way the upload step writes it (#1150)", () => {
  expect(() => parseCsv(`a\n${"1\n".repeat(5001)}`)).toThrow("At most 5,000 rows per batch");
});
it("maps explicit fields and rejects blank, fractional cents and nondecimal numbers", () => {
  expect(mapCsvRows("products_skus", [["IPA", "2"]], { product: 0 })).toEqual([{ product: "IPA" }]);
  const ids = { skuId: crypto.randomUUID(), locationId: crypto.randomUUID(), binId: crypto.randomUUID() };
  for (const qty of ["", "NaN", "Infinity", "0x10", "1e3", "0", "-2"]) expect(validateImportRow("opening_balances", { ...ids, qty })).not.toEqual([]);
  expect(validateImportRow("opening_balances", { ...ids, qty: "1.25" })).toEqual([]);
  // record_inventory_movement refuses qty <> round(qty, 2); the preview must too.
  expect(validateImportRow("opening_balances", { ...ids, qty: "1.234" })).toEqual(["Quantity must be a positive number with at most two decimal places"]);
  expect(validateImportRow("opening_balances", { ...ids, qty: "1.230" })).toEqual([]);
  expect(validateImportRow("channel_prices", { saleChannelId: ids.skuId, priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1.2" })).not.toEqual([]);
  expect(validateImportRow("channel_prices", { saleChannelId: "Missing channel", priceGroupId: ids.skuId, formatId: ids.skuId, unitPriceCents: "1" }, { channels: [] })).toContain("Sale channel was not found");
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
    expect(validateImportRow("customers", { ...customer, saleChannelId: "Whole" }, lookups)).toEqual(["Sale channel was not found"]);
    expect(validateImportRow("customers", customer, { ...lookups, channels: [...lookups.channels, { id: crypto.randomUUID(), name: " WHOLESALE " }] })).toEqual(['Sale channel: "wHoLeSaLe" matches 2 records; use the ID']);
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
    expect(validateImportRow("products_skus", { product: "Lager", formatId: "Pint" }, references)).toEqual(["Format was not found"]);
  });
  it("checks bin membership using resolved location and bin identities", () => {
    const row = { skuId: "Lager half keg", locationId: "cooler a", binId: "Shelf 1", qty: "2" };
    expect(validateImportRow("opening_balances", row, lookups)).toEqual([]);
    expect(validateImportRow("opening_balances", { ...row, binId: bin }, { ...lookups, bins: [{ ...lookups.bins[0], location_id: crypto.randomUUID() }] })).toEqual(["Bin must belong to Location"]);
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

describe("within-file customer duplicates (#1314)", () => {
  const customer = { name: "QA dup", type: "retailer", state: "PA", saleChannelId: crypto.randomUUID() };
  it("blocks later ready rows by the server's name identity, not type or alias", () => {
    const rows = [customer, { ...customer, name: " QA dup ", type: "distributor", alias: "different" }, { ...customer, name: "Other", alias: "different" }];
    const validation = validateImportRows("customers", rows);
    expect(validation).toEqual([[], ["Duplicate of row 1: customer name"], []]);
    expect(readyImportRows(rows, validation)).toEqual([rows[0], rows[2]]);
    expect(readyImportRowNumbers(validation)).toEqual([1, 3]);
    expect(rows[1].name).toBe(" QA dup ");
  });
  it("keeps case significant but shares trimmed preview and execution identity", () => {
    expect(validateImportRows("customers", [customer, { ...customer, name: "qa dup" }])).toEqual([[], []]);
    for (const whitespace of ["\t", "\r\n", "\u00a0"]) {
      const padded = { ...customer, name: `${whitespace}QA dup${whitespace}` };
      expect(importRowKey("customers", padded, 1)).toBe(importRowKey("customers", customer, 0));
      expect(validateImportRows("customers", [customer, padded])).toEqual([[], ["Duplicate of row 1: customer name"]]);
      padded.name = `${whitespace}Different${whitespace}`;
      expect(validateImportRows("customers", [customer, padded])).toEqual([[], []]);
    }
  });
  it("lets a ready row through when an earlier same-name row is blocked, and recomputes after edits", () => {
    const rows = [{ ...customer, type: "" }, customer, { ...customer }];
    expect(readyImportRowNumbers(validateImportRows("customers", rows))).toEqual([2]);
    rows[0].type = "retailer";
    expect(validateImportRows("customers", rows)).toEqual([[], ["Duplicate of row 1: customer name"], ["Duplicate of row 1: customer name"]]);
    rows[0].name = "Different";
    expect(validateImportRows("customers", rows)).toEqual([[], [], ["Duplicate of row 2: customer name"]]);
  });
  it("does not mistake serialization keys or append rows for duplicate identities", () => {
    const product = { product: "Lager", formatId: crypto.randomUUID() };
    expect(validateImportRows("products_skus", [product, { ...product, formatId: crypto.randomUUID() }])).toEqual([[], []]);
    const shipTo = { customerId: crypto.randomUUID(), label: "Main", state: "PA" };
    expect(validateImportRows("ship_tos", [shipTo, shipTo])).toEqual([[], []]);
    const opening = { skuId: crypto.randomUUID(), locationId: crypto.randomUUID(), binId: crypto.randomUUID(), qty: "1" };
    expect(validateImportRows("opening_balances", [opening, opening])).toEqual([[], []]);
    const price = { saleChannelId: customer.saleChannelId, priceGroupId: crypto.randomUUID(), formatId: product.formatId, unitPriceCents: "100" };
    expect(validateImportRows("channel_prices", [price, price])).toEqual([[], []]);
  });
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
    expect(validateImportRow("customers", { name: "River", type: "distributor", country: "CN", alias: "china", saleChannelId: channel })).toEqual([]);
    expect(validateImportRow("customers", { name: "Cedar Distribution", type: "distributor", saleChannelId: channel })).toEqual(["State is required"]);
    expect(validateImportRow("customers", { name: "Cedar Distribution", type: "distributor", country: "US", saleChannelId: channel })).toEqual(["State is required"]);
    expect(validateImportRow("customers", { name: "Cedar Distribution", type: "distributor", state: "PA", saleChannelId: channel })).toEqual([]);
    expect(validateImportRow("customers", { name: "River", type: "distributor", country: "XX", saleChannelId: channel }).join(" ")).toMatch(/Country/);
    expect(validateImportRow("customers", { name: "River", type: "distributor", country: "CN", state: "PA", saleChannelId: channel }).join(" ")).toMatch(/State/);
  });
  it("a foreign ship-to row needs only its customer and label", () => {
    const customerId = crypto.randomUUID();
    expect(validateImportRow("ship_tos", { customerId, label: "Main", country: "JP" })).toEqual([]);
    // A US ship-to needs only its state; street, city and ZIP are optional (user, 2026-10-15).
    expect(validateImportRow("ship_tos", { customerId, label: "Main" })).toEqual(["State is required"]);
    expect(validateImportRow("ship_tos", { customerId, label: "Main", state: "OH" })).toEqual([]);
  });
});

it("downloads friendly template filenames and stable keys with an example that cannot import (#1315)", () => {
  for (const kind of IMPORT_KINDS) {
    const fields = IMPORT_FIELDS[kind], names = fields.map(field => field.name);
    const template = importTemplateCsv(kind), parsed = parseCsv(template);
    expect(importTemplateName(kind)).toMatch(/^[a-z-]+-template\.csv$/);
    expect(template).not.toMatch(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    expect(parsed.headers).toEqual(names);
    expect(parsed.rows).toHaveLength(1);
    const [example] = mapCsvRows(kind, parsed.rows, Object.fromEntries(names.map((name, index) => [name, index])));
    const blankRequired = fields.find(field => field.required && !example[field.name]);
    expect(blankRequired).toBeDefined();
    expect(validateImportRow(kind, example)).toContain(`${IMPORT_FIELD_LABELS[blankRequired!.name]} is required`);
    expect(readyImportRows([example], [validateImportRow(kind, example)])).toEqual([]);
  }
});

it("requires valid column matches for all kinds without requiring US-only fields on foreign rows (#1315)", () => {
  for (const kind of IMPORT_KINDS) {
    const headers = IMPORT_FIELDS[kind].map(field => field.name);
    const mapping = Object.fromEntries(headers.map((name, index) => [name, index]));
    expect(canReviewImport(kind, mapping, headers, [{}])).toBe(true);
    expect(canReviewImport(kind, mapping, headers, [])).toBe(false);
    expect(canReviewImport(kind, {}, headers, [{}])).toBe(false);
    for (const field of IMPORT_FIELDS[kind].filter(field => field.required)) {
      for (const column of [-1, headers.length, 0.5, NaN]) {
        expect(canReviewImport(kind, { ...mapping, [field.name]: column }, headers, [{}])).toBe(false);
      }
    }
  }
  const headers = ["name", "type", "saleChannelId", "country"];
  const mapping = { name: 0, type: 1, saleChannelId: 2, country: 3 };
  expect(canReviewImport("customers", mapping, headers, [{ country: "JP" }])).toBe(true);
  expect(canReviewImport("customers", mapping, headers, [{ country: "US" }])).toBe(false);
  expect(canReviewImport("customers", mapping, headers, [{ country: "JP" }, { country: "" }])).toBe(false);
});

it("explains price bounds in readable cents while leaving payload values untouched (#1315)", () => {
  const row = { saleChannelId: "Wholesale", priceGroupId: "House beer", formatId: "Half keg", unitPriceCents: "1.5" };
  expect(validateImportRow("channel_prices", row)).toEqual(["Unit price (cents) must be a whole number from 0 to 2,147,483,647 (100 cents = $1)"]);
  expect(row.unitPriceCents).toBe("1.5");
});
