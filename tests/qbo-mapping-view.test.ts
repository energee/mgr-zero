import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { QboMappingView, QboMappingsView } from "../components/mgr/views/qbo-mapping";
import { qboMappingScopeOptions } from "../lib/mgr/accounting-view";

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

it("uses exact vendor and brewery-wide purchase account IDs for receipt Bills", () => {
  const vendor = renderToStaticMarkup(createElement(QboMappingView, { kind: "vendor", value: "00512" }));
  expect(vendor).toContain("QuickBooks vendor ID");
  expect(vendor).toContain('value="00512"');
  expect(vendor).toContain("never chooses automatically");
  const account = renderToStaticMarkup(createElement(QboMappingView, { kind: "purchase_account", value: "84" }));
  expect(account).toContain("QuickBooks account ID");
  expect(account).toContain("One brewery-wide purchase account");
  expect(account).toContain("Payments are managed only in QuickBooks");
});

it("says the never-by-name rule once, in the dialog, not again on the page (#1515)", () => {
  const page = renderToStaticMarkup(createElement(QboMappingsView, { title: "QuickBooks mappings", backLabel: "Accounting", company: "Demo Brewing LLC", sections: [] }));
  expect(page).toContain("Verify each record in Demo Brewing LLC.");
  expect(page).not.toContain("never chooses automatically");
  expect(renderToStaticMarkup(createElement(QboMappingView, { kind: "customer" })).match(/never chooses automatically/g)).toHaveLength(1);
});

it("scopes the page to unmapped rows through the URL, with the count (#1515)", () => {
  expect(qboMappingScopeOptions(4, true)).toEqual([
    { value: "all", label: "All", href: "/settings/accounting/mappings" },
    { value: "unmapped", label: "Unmapped (4)", href: "/settings/accounting/mappings?show=unmapped" },
  ]);
  expect(qboMappingScopeOptions(0, false).map(option => option.href)).toEqual([undefined, undefined]);
  const html = renderToStaticMarkup(createElement(QboMappingsView, { title: "QuickBooks mappings", backLabel: "Accounting", sections: [], scope: { value: "unmapped", options: qboMappingScopeOptions(4, false) } }));
  expect(html).toContain("Show");
  expect(html).toContain("Unmapped (4)");
});
