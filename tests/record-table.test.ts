// tests/record-table.test.ts — the shared register contract (#1025): rich
// cells, wrapping names, index-keyed columns, and an explicit destination.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { RecordTable } from "../components/mgr/views/record-table";

const html = (rows: Parameters<typeof RecordTable>[0]["rows"], headers: Parameters<typeof RecordTable>[0]["headers"] = ["Name", "Status", "Count"]) =>
  renderToStaticMarkup(createElement(RecordTable, { headers, align: ["l", "l", "r"], rows }));

afterEach(() => vi.restoreAllMocks());

it("draws a rich cell in both the table and the phone list", () => {
  const out = html([{ key: "a", cells: ["Alpha", createElement("em", null, "Rich"), "3"] }]);
  expect(out.match(/<em>Rich<\/em>/g)).toHaveLength(2);
});

it("lets a long name wrap instead of widening the table past the column", () => {
  expect(html([{ key: "a", cells: ["Alpha", "ok", "1"] }])).not.toContain("min-w-max");
});

it("keys columns by position, so repeated or empty header text is safe", () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  html([{ key: "a", cells: ["Alpha", "x", "y"] }], ["Name", "", ""]);
  expect(error).not.toHaveBeenCalled();
});

it("leaves an empty cell's label out of the phone list", () => {
  const out = html([{ key: "a", cells: ["Alpha", null, "1"] }]);
  expect(out).toContain("<dt");
  expect(out).not.toMatch(/<dt[^>]*>Status<\/dt>/);
  expect(out).toMatch(/<dt[^>]*>Count<\/dt>/);
});

it("names the destination screen on the name, live or inert", () => {
  expect(html([{ key: "a", cells: ["Alpha", "", ""], to: "SKU detail" }]).match(/data-to="SKU detail"/g)).toHaveLength(2);
  expect(html([{ key: "a", cells: ["Alpha", "", ""], to: "SKU detail", href: "/x" }])).toMatch(/href="\/x"[^>]*data-to="SKU detail"|data-to="SKU detail"[^>]*href="\/x"/);
});
