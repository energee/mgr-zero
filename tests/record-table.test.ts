// tests/record-table.test.ts — the shared register contract (#1025): rich
// cells, wrapping names, index-keyed columns, and an explicit destination.
import { createElement, Fragment } from "react";
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

/** The class attribute of every <tag> in the markup, in order. */
const classesOf = (out: string, tag: string) => [...out.matchAll(new RegExp(`<${tag}\\s[^>]*class="([^"]*)"`, "g"))].map((m) => m[1]);

it("#1030 never breaks a number inside its value, while text cells still wrap", () => {
  const [name, status, count] = classesOf(html([{ key: "a", cells: ["Alpha", "Long status text", "$1,040.00"] }]), "td");
  expect(count).toContain("whitespace-nowrap");
  expect(count).toContain("tabular-nums");
  expect(count).not.toContain("wrap-anywhere");
  expect(status).toContain("wrap-anywhere");
  expect(name).not.toContain("whitespace-nowrap");
});

it("#1037 keeps a printed date on one line, while other text cells still wrap", () => {
  const [, due, other] = classesOf(renderToStaticMarkup(createElement(RecordTable, { headers: ["Name", "Due", "Note"], align: ["l", "l", "l"], rows: [{ key: "a", cells: ["Alpha", "Sep 12, 2026", "Sep 12, 2026 was the old date"] }] })), "td");
  expect(due).toContain("whitespace-nowrap");
  expect(due).not.toContain("wrap-anywhere");
  expect(other).toContain("wrap-anywhere");
});

it("#1037 keeps a badge-led date (Overdue, then the date) on one line too", () => {
  const cell = createElement(Fragment, null, createElement("span", null, "Overdue"), " ", "Oct 3, 2026");
  const [, due] = classesOf(renderToStaticMarkup(createElement(RecordTable, { headers: ["Name", "Due"], align: ["l", "l"], rows: [{ key: "a", cells: ["Alpha", cell] }] })), "td");
  expect(due).toContain("whitespace-nowrap");
});

it("#1030 aligns each column's header and its cells the same way", () => {
  const out = html([{ key: "a", cells: ["Alpha", "ok", "1"] }]);
  const side = (cls: string) => (cls.includes("text-right") ? "r" : "l");
  expect(classesOf(out, "th").map(side)).toEqual(["l", "l", "r"]);
  expect(classesOf(out, "td").map(side)).toEqual(["l", "l", "r"]);
});

it("#1030 starts every phone value at one left edge, numbers included, and never wraps a label", () => {
  const out = html([{ key: "a", cells: ["Alpha", "ok", "12"] }]);
  const values = classesOf(out, "dd");
  expect(values).toHaveLength(2);
  for (const cls of values) expect(cls).not.toContain("text-right");
  for (const cls of classesOf(out, "dt")) expect(cls).toContain("whitespace-nowrap");
});

/** Each header cell's markup, in order. */
const heads = (out: string) => [...out.matchAll(/<th\b[^>]*>[\s\S]*?<\/th>/g)].map((m) => m[0]);

it("draws a header with text cells as a sort button, unsorted until clicked", () => {
  const out = heads(html([{ key: "a", cells: ["Alpha", "ok", "1"] }]));
  expect(out).toHaveLength(3);
  for (const head of out) {
    expect(head).toContain('aria-sort="none"');
    expect(head).toMatch(/<button\b/);
  }
});

it("gives a column with nothing to sort (empty or component cells) a plain header", () => {
  const Comp = () => createElement("span", null, "3 kegs");
  const out = heads(renderToStaticMarkup(createElement(RecordTable, {
    headers: ["Name", "Available", "Note"], align: ["l", "r", "l"],
    rows: [{ key: "a", cells: ["Alpha", createElement(Comp), null] }],
  })));
  expect(out[0]).toMatch(/<button\b/);
  for (const head of out.slice(1)) {
    expect(head).not.toContain("aria-sort");
    expect(head).not.toMatch(/<button\b/);
  }
});

it("sorts a component column by the row's explicit sort value", () => {
  const Comp = () => createElement("span", null, "3 kegs");
  const out = heads(renderToStaticMarkup(createElement(RecordTable, {
    headers: ["Name", "Available"], align: ["l", "r"],
    rows: [{ key: "a", cells: ["Alpha", createElement(Comp)], sort: [null, 3] }],
  })));
  expect(out[1]).toContain('aria-sort="none"');
});

it("draws plain headers when the table is not sortable", () => {
  const out = heads(renderToStaticMarkup(createElement(RecordTable, { headers: ["Name", "Status"], align: ["l", "l"], rows: [{ key: "a", cells: ["Alpha", "ok"] }], sortable: false })));
  for (const head of out) {
    expect(head).not.toContain("aria-sort");
    expect(head).not.toMatch(/<button\b/);
  }
});

it("keeps the server's row order before any sort is chosen", () => {
  const out = html([{ key: "b", cells: ["Bravo", "", "2"] }, { key: "a", cells: ["Alpha", "", "1"] }]);
  const table = out.slice(0, out.indexOf("</table>"));
  expect(table.indexOf("Bravo")).toBeLessThan(table.indexOf("Alpha"));
  const list = out.slice(out.indexOf("</table>"));
  expect(list.indexOf("Bravo")).toBeLessThan(list.indexOf("Alpha"));
});
