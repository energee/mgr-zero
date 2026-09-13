import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ImportView } from "../components/mgr/views/import";
import { importPreview } from "../lib/mgr/fixtures/import";

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
