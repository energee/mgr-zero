import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { E } from "../components/mgr/e";
import { ImportView } from "../components/mgr/views/import";
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
  expect(html).toContain("Import 2 ready rows");
  expect(html).toContain("Edit row 2");
  expect(html).toContain('data-slot="toggle-group-item"');
  expect(html).not.toContain('href="/');
  const blocked = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, validation: importPreview.rows.map(() => ["Invalid row"]) } }));
  expect(blocked).toMatch(/<button[^>]*disabled[^>]*>Import 0 ready rows/);
});

it("retains exact-batch recovery identity and does not claim uncertain writes failed completely", () => {
  const html = renderToStaticMarkup(createElement(ImportView, { model: { ...importPreview, step: 3, batchId: "frozen-request", error: "Some rows may have committed" } }));
  expect(html).toContain("frozen-request");
  expect(html).toContain("Some rows may have committed");
  expect(html).toContain("Retry same batch");
  expect(html).not.toContain("Correct blocked rows in a new batch");
});
