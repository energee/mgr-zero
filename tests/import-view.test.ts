import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { E } from "../components/mgr/e";
import { ImportView } from "../components/mgr/views/import";
import { IMPORT_FIELDS, validateImportRows, type ImportKind } from "../lib/import-csv";
import { importPreview } from "../lib/mgr/fixtures/import";

it("keeps missing mappings and preview cells empty rather than undefined", () => {
  const pick = vi.spyOn(E, "pick");
  const edit = vi.spyOn(E, "edit");
  try {
    renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step: 1, mapping: {} } }));
    expect(pick.mock.calls.length).toBeGreaterThan(0);
    expect(pick.mock.calls.every(call => call[1] === "-1")).toBe(true);
    renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, rows: [{}], validation: [[]] } }));
    expect(edit.mock.calls.length).toBeGreaterThan(0);
    expect(edit.mock.calls.every(call => call[1] === "")).toBe(true);
  } finally {
    pick.mockRestore();
    edit.mockRestore();
  }
});

it("shows rejected-file errors beside the picker with an error attachment (#1395)", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step: 0, fileName: "empty.csv", error: "File needs fixing" } }));
  expect(html).toMatch(/data-slot="attachment"[^>]*data-state="error"/);
  expect(html).toMatch(/<input[^>]*type="file"[^>]*aria-invalid="true"/);
  expect(html).toMatch(/data-slot="field"[^>]*data-invalid="true"/);
  expect(html.indexOf('data-slot="field-error"')).toBeGreaterThan(html.indexOf('type="file"'));
  expect(html).toMatch(/role="alert"[^>]*data-slot="field-error"[^>]*>File needs fixing<\/div><\/div>/);
  expect(html.match(/File needs fixing/g)).toHaveLength(1);
});

it("keeps non-file errors in the top alert and the picker neutral (#1395)", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step: 0, error: "Saved import could not be read" } }));
  expect(html).toContain('<p role="alert" class="text-destructive">Saved import could not be read</p>');
  expect(html.indexOf('role="alert"')).toBeLessThan(html.indexOf("Customers columns"));
  expect(html).toMatch(/data-slot="attachment"[^>]*data-state="idle"/);
  expect(html).not.toContain('data-slot="field-error"');
});

it("keeps later-step errors above the content even when the file has a name (#1395)", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, fileName: "customers.csv", error: "Import could not finish" } }));
  expect(html).toContain('<p role="alert" class="text-destructive">Import could not finish</p>');
  expect(html).not.toContain('data-slot="field-error"');
});

it("shares an editable mixed preview and prevents all-invalid batches from committing", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: importPreview }));
  expect(html).toContain("2 ready · 1 blocked");
  expect(html).toContain("Import 2 rows");
  expect(html).toContain("Edit row 2");
  expect(html).toContain('data-slot="toggle-group-item"');
  expect(html).not.toContain('href="/');
  const blocked = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, validation: importPreview.rows.map(() => ["Invalid row"]) } }));
  expect(blocked).toMatch(/<button[^>]*disabled[^>]*>Import 0 rows/);
});

it("shows duplicate customer rows as blocked before committing (#1314)", () => {
  const rows = [importPreview.rows[0], { ...importPreview.rows[0] }, { ...importPreview.rows[0], name: "  " }];
  const html = renderToStaticMarkup(createElement(ImportView, { model: {
    ...importPreview, rows, validation: validateImportRows("customers", rows, importPreview.lookups),
  } }));
  expect(html).toContain("1 ready · 2 blocked");
  expect(html).toContain("Duplicate of row 1: customer name");
});

it("shows only usable packaged format references when mapping product imports (#819)", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: {
    ...importPreview, kind: "products_skus", step: 1, rows: [], validation: [],
    lookups: { ...importPreview.lookups, formats: [
      { id: "package-id", name: "Half keg", basis: "packaged" },
      { id: "pour-id", name: "Draft pint", basis: "poured", price_group_id: "group-id" },
    ] },
  } }));
  expect(html).toContain("Half keg");
  expect(html).not.toContain("Draft pint");
});

it("retains exact-batch recovery identity and does not claim uncertain writes failed completely", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step: 3, batchId: "frozen-request", error: "Some rows may have committed" } }));
  expect(html).toContain("frozen-request");
  expect(html).toContain("Some rows may have committed");
  expect(html).toContain("Retry same batch");
  expect(html).not.toContain("Correct blocked rows in a new batch");
});

it("identifies committed results by CSV row without exposing record UUIDs (#1382)", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: {
    ...importPreview, step: 3, batchId: "frozen-request", previewRows: [2, 5],
    result: {
      committed: 1, blocked: 1,
      outcomes: [
        { row: 1, status: "committed", result: { id: "6dbdfec5-0000-4000-8000-000000000001" } },
        { row: 2, status: "blocked", error: "Customer name is required" },
      ],
    },
  } }));
  expect(html).toMatch(/>2<\/td><td[^>]*><a [^>]*>Al’s Bar<\/a><\/td><td[^>]*>Imported<\/td>/);
  expect(html).toMatch(/>5<\/td><td[^>]*><\/td><td[^>]*>Blocked: Customer name is required<\/td>/);
  // The id reaches only the link target, never the visible text.
  expect(html.replace(/href="[^"]*"/g, "")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  expect(html).toContain("frozen-request");
});

it("links each imported record to its page, and leaves kinds without one as text (#1497)", () => {
  const render = (kind: ImportKind, rows: Record<string, string>[], result: Record<string, string>) => renderToStaticMarkup(createElement(ImportView, { model: {
    ...importPreview, kind, rows, step: 3, batchId: "done", previewRows: [1],
    result: { committed: 1, blocked: 0, outcomes: [{ row: 1, status: "committed", result }] },
  } }));
  expect(render("customers", [{ name: "Al’s Bar" }], { id: "c1" })).toContain('<a href="/customers/c1"');
  // A ship-to is edited on its customer's page.
  expect(render("ship_tos", [{ label: "Dock" }], { id: "s1", customer_id: "c1" })).toContain('<a href="/customers/c1"');
  // A SKU is switched on and edited under its brand's Sells as.
  expect(render("products_skus", [{ product: "Pils" }], { id: "k1", brand_id: "b1" })).toContain('<a href="/catalog/brands/b1#sells-as"');
  for (const kind of ["channel_prices", "opening_balances"] as const) expect(render(kind, [{ name: "Row" }], { id: "x1" })).not.toContain("<a href");
  // A blocked row has no record to open.
  const blocked = renderToStaticMarkup(createElement(ImportView, { model: {
    ...importPreview, step: 3, batchId: "done", previewRows: [1],
    result: { committed: 0, blocked: 1, outcomes: [{ row: 1, status: "blocked", error: "Customer name is required" }] },
  } }));
  expect(blocked).not.toContain("<a href");
});

it("offers Discard for an unresolved batch only after a confirming step (#615)", () => {
  const unresolved = { ...importPreview, step: 3, batchId: "frozen-request", error: "Some rows may have committed" };
  expect(renderToStaticMarkup(createElement(ImportView, { model: unresolved, onDiscard: vi.fn() }))).toContain("Discard saved request");
  expect(renderToStaticMarkup(createElement(ImportView, { model: { ...unresolved, result: { committed: 1, blocked: 0, outcomes: [] } }, onDiscard: vi.fn() }))).not.toContain("Discard saved request");
  expect(renderToStaticMarkup(createElement(ImportView, { model: { ...unresolved, busy: true }, onDiscard: vi.fn() }))).not.toContain("Discard saved request");
});

it("offers Import another file only once results are recovered, never past an uncertain batch (#722)", () => {
  const recovered = { ...importPreview, step: 3, batchId: "done-request", result: { committed: 1, blocked: 1, outcomes: [] } };
  const html = renderToStaticMarkup(createElement(ImportView, { model: recovered, onNextFile: vi.fn() }));
  expect(html).toContain("Import another file");
  expect(html).toContain("Correct blocked rows in a new batch");
  expect(renderToStaticMarkup(createElement(ImportView, { model: { ...recovered, result: null, error: "Some rows may have committed" }, onNextFile: vi.fn() }))).not.toContain("Import another file");
  expect(renderToStaticMarkup(createElement(ImportView, { model: { ...recovered, busy: true }, onNextFile: vi.fn() }))).not.toContain("Import another file");
});

it("names its steps, labels the kind choice and lists the chosen kind's columns before upload (#1150)", () => {
  const upload = (kind: typeof importPreview.kind) => renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, kind, step: 0, rows: [], validation: [] } }));
  const html = upload("customers");
  for (const step of ["Upload", "Match columns", "Review", "Import"]) expect(html).toContain(`>${step}</span>`);
  expect(html).toMatch(/<legend[^>]*>What are you importing\?<\/legend>/);
  expect(html).not.toContain("Quoted commas");
  expect(html).toContain("Customers columns");
  for (const field of IMPORT_FIELDS.customers) expect(html).toContain(`<code>${field.name}</code>`);
  expect(html).toMatch(/<code>name<\/code> · required/);
  expect(html).toMatch(/<code>state<\/code> · required for a US address/);
  expect(html).toMatch(/<code>alias<\/code> · optional/);
  expect(html).toMatch(/<code>saleChannelId<\/code> · required · name or ID/);
  expect(html).toContain("up to 5,000 rows");
  for (const later of [1, 2]) expect(renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, kind: "customers", step: later } }))).not.toContain("Customers columns");
  const balances = upload("opening_balances");
  for (const field of IMPORT_FIELDS.opening_balances) expect(balances).toContain(`<code>${field.name}</code>`);
  expect(balances).not.toContain("<code>saleChannelId</code>");
});

it("names the buttons after the steps, offers the template only before upload, and explains each step in plain words (#1206)", () => {
  const at = (step: number) => renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step, headers: ["name"], csvRowCount: 3 } }));
  const upload = at(0), match = at(1), review = at(2), results = at(3);
  expect(upload).toMatch(/<button[^>]*>Download template<\/button>/);
  expect(upload).toContain(">Match columns</button>");
  for (const later of [match, review, results]) expect(later).not.toContain("Download template");
  expect(match).toContain(">Review 3 rows</button>");
  expect(review).toContain(">Back to matching columns</button>");
  expect(review).toContain(">Import 2 rows</button>");
  const html = upload + match + review + results;
  for (const jargon of ["Map", "map ", "mapping", "Preview", "References accept", "case-insensitive", "Retry returns original results", "commits independently", "Committing", "need recovery", "unresolved"]) {
    expect(html.replace(/<[^>]*>/g, " "), jargon).not.toContain(jargon);
  }
});

it("blocks Review until every required column is matched and uses the singular row label (#1315)", () => {
  const model = { ...importPreview, step: 1, rows: [importPreview.rows[0]], validation: [[]], headers: ["name", "type", "state", "saleChannelId"] };
  const render = (mapping: Record<string, number>) => renderToStaticMarkup(createElement(ImportView, { model: { ...model, mapping } }));
  expect(render({})).toMatch(/<button[^>]* disabled=""[^>]*>Review 1 row<\/button>/);
  const matched = render({ name: 0, type: 1, state: 2, saleChannelId: 3 }).match(/<button[^>]*>Review 1 row<\/button>/)?.[0];
  expect(matched).toBeDefined();
  expect(matched).not.toContain(' disabled=""');
  expect(render({ name: 0, type: 1, state: 2, saleChannelId: 99 })).toMatch(/<button[^>]* disabled=""[^>]*>Review 1 row<\/button>/);
});

it("uses friendly field labels and a readable import-kind fallback (#1315)", () => {
  const model = { ...importPreview, kind: "channel_prices" as const, step: 2, rows: [{ unitPriceCents: "1.5" }], validation: [["Unit price (cents) must be a whole number"]] };
  const html = renderToStaticMarkup(createElement(ImportView, { model }));
  expect(html).toContain("Sale channel");
  expect(html).toContain("Price group");
  expect(html).toContain("Unit price (cents)");
  expect(html).toContain("Edit row 1 · Channel prices");
  expect(html).not.toContain("saleChannelId");
  expect(html).not.toContain("priceGroupId");
  expect(html).not.toContain("unitPriceCents");
});


it("labels review columns as problem and status in sentence case (#1497)", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: importPreview }));
  for (const header of ["Row", "Record", "Problem", "Status"]) expect(html).toMatch(new RegExp(`<th[^>]*>(<[^>]*>)*${header}<`));
  expect(html).not.toMatch(/<th[^>]*>(<[^>]*>)*(Match|State)</);
  expect(html).toMatch(/>Validated<\/td><td[^>]*>Ready<\/td>/);
  expect(html).toMatch(/>Blocked<\/td>/);
  expect(html).not.toMatch(/>(validated|ready|blocked)<\/td>/);
});

it("reads a finished batch as imported, tucks the request ID away, and drops Retry once results return (#1497)", () => {
  const done = { ...importPreview, step: 3, batchId: "done-request", previewRows: [1], result: { committed: 1, blocked: 0, outcomes: [{ row: 1, status: "committed" as const }] } };
  const html = renderToStaticMarkup(createElement(ImportView, { model: done }));
  expect(html).toContain("1 imported · 0 blocked");
  expect(html).not.toContain("committed");
  expect(html).toMatch(/>1<\/td><td[^>]*>Ridgeline \+ Main<\/td><td[^>]*>Imported<\/td>/);
  expect(html).toMatch(/<details><summary>Batch request<\/summary>[^]*done-request[^]*<\/details>/);
  expect(html).not.toContain("Retry same batch");
});

it("lists allowed values and picker options by their labels (#1497)", () => {
  const match = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step: 1 } }));
  expect(match).toContain("Distributor, Retailer, Brewery, Other");
  expect(match).toContain("Due on receipt (due_on_receipt), Net 15 (net15), Net 30 (net30)");
  const pick = vi.spyOn(E, "pick");
  try {
    renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, rows: [{ ...importPreview.rows[0], paymentTerms: "net15" }], validation: [[]] } }));
    const terms = pick.mock.calls.find(call => call[0].startsWith("Payment terms"))!;
    expect(terms[2]).toContainEqual({ value: "net15", label: "Net 15" });
    expect(terms[3]?.displayValue).toBeUndefined();
    const type = pick.mock.calls.find(call => call[0].startsWith("Customer type"))!;
    expect(type[2]).toContainEqual({ value: "retailer", label: "Retailer" });
  } finally {
    pick.mockRestore();
  }
});
