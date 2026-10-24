import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { E } from "../components/mgr/e";
import { ImportView } from "../components/mgr/views/import";
import { IMPORT_FIELDS, IMPORT_FIELD_LABELS, IMPORT_KINDS } from "../lib/import-csv";
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

it("shares the canonical field labels across matching and review for all five kinds (#1315)", () => {
  const pick = vi.spyOn(E, "pick"), edit = vi.spyOn(E, "edit");
  try {
    for (const kind of IMPORT_KINDS) {
      pick.mockClear(); edit.mockClear();
      const model = { ...importPreview, kind, rows: [{}], validation: [[]] };
      renderToStaticMarkup(createElement(ImportView, { model: { ...model, step: 1 } }));
      renderToStaticMarkup(createElement(ImportView, { model: { ...model, step: 2 } }));
      for (const field of IMPORT_FIELDS[kind]) {
        const label = IMPORT_FIELD_LABELS[field.name] + (field.required ? " *" : "");
        expect(pick.mock.calls.map(call => call[0])).toContain(label);
        expect(edit.mock.calls.map(call => call[0])).toContain(label);
      }
    }
  } finally {
    pick.mockRestore(); edit.mockRestore();
  }
});
