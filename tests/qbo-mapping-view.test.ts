import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { QboMappingView, QboMappingsView } from "../components/mgr/views/qbo-mapping";

it("keeps exact provider IDs and blocks blank or pending mapping submissions", () => {
  const blank = renderToStaticMarkup(createElement(QboMappingView, { kind: "customer", value: " " }));
  expect(blank).toContain("QuickBooks customer ID");
  expect(blank).toContain("required");
  expect(blank).toContain("disabled");
  const pending = renderToStaticMarkup(createElement(QboMappingView, { kind: "deposit", value: "00184", busy: true, error: "Company changed" }));
  expect(pending).toContain('value="00184"');
  expect(pending).toContain("QuickBooks item ID");
  expect(pending).toContain("Company changed");
  expect(pending).toContain("Saving…");
});

it("keeps unavailable connections and explicit null actions from exposing save controls", () => {
  const props = { title: "QuickBooks mappings", backLabel: "Accounting", sections: [{ rows: [{ id: "actual", label: "Actual customer", kind: "customer" as const, currentId: "00184", action: null }] }] };
  const html = renderToStaticMarkup(createElement(QboMappingsView, props));
  expect(html).toContain("QuickBooks customer 00184");
  expect(html).not.toContain(">Change<");
  expect(html).not.toContain('href="/');
  const offline = renderToStaticMarkup(createElement(QboMappingsView, { ...props, connected: false }));
  expect(offline).toContain("Connect QuickBooks before saving mappings");
  expect(offline).not.toContain(">Map<");
});

it("keeps fixture mapping controls safe and does not invent ambiguity", () => {
  const html = renderToStaticMarkup(createElement(QboMappingView, { kind: "item", defaultValue: "307", label: "Actual SKU" }));
  expect(html).toContain("Actual SKU");
  expect(html).toContain("never chooses automatically");
  expect(html).not.toContain("Two QuickBooks customers");
  expect(html).not.toContain('href="/');
});
