// tests/invoice-view.test.ts — Invoice inventory and the live invoice page
// share InvoiceView. Fixtures are get_invoice + questions; mapping rows are
// presentation, not a mode flag. Tests paint the view, not SCREENS.
import { readFileSync } from "node:fs";
import { createElement, isValidElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { InvoiceView } from "../components/mgr/views/invoice";
import { invoiceFailedAls } from "../lib/mgr/fixtures/invoice";
import { ALS } from "../lib/mgr/fixtures/demo";
import { invoiceMappingRows, toInvoiceViewProps } from "../lib/mgr/invoice-view";

const htmlOf = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement("div", null, node));

describe("Invoice view", () => {
  it("checks mappings in the current realm, deduplicates SKUs, and gates unavailable fixes", () => {
    const customer = { name: "Actual customer", qbo_customer_id: "00227", qbo_realm_id: "current" };
    const line = { id: "line1", kind: "sku", sku_id: "sku1", description: "Actual SKU", skus: { name: "Actual SKU", qbo_item_id: "009", qbo_realm_id: "old" } };
    const rows = invoiceMappingRows(customer, [line, { ...line, id: "line2" }, { ...line, id: "deposit", kind: "keg_deposit", sku_id: null }], "current", null, "/invoices/actual/mapping");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ detail: "Actual customer · customer 00227", tone: "ok" });
    expect(rows[1]).toMatchObject({ title: "Actual SKU", detail: "QuickBooks item is missing", href: "/invoices/actual/mapping" });
    expect(rows[2]).toMatchObject({ unavailable: true, href: undefined });
    expect(invoiceMappingRows(customer, [{ ...line, skus: { ...line.skus, qbo_realm_id: "current" } }], "current", null, "/mapping")).toHaveLength(1);
    expect(invoiceMappingRows(null, [], "current", null, "/mapping")[0].unavailable).toBe(true);
  });
  it("keeps mappings and questions beside shared QuickBooks status and authorized actions", () => {
    const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps(invoiceFailedAls), quickbooks: { detail: "Push failed", balanceCents: 12000, healthy: false }, accountingActions: "Retry exact push" }));
    expect(html).toContain("Customer mapping");
    expect(html).toContain("$120.00 balance");
    expect(html).toContain("Retry exact push");
    expect(html).toContain("Mark answered");
    expect(html).not.toContain("Push invoice to QuickBooks Online");
  });
  it("maps get_invoice + questions through the adapter", () => {
    const model = toInvoiceViewProps(invoiceFailedAls);
    expect(model.title).toBe("INV-1039");
    expect(model.backHref).toBeUndefined();
    expect(model.customer).toBe(ALS.name);
    expect(model.summary).toBe("due Oct 3, 2026 · 3 lines");
    expect(toInvoiceViewProps({ ...invoiceFailedAls, invoice: { ...invoiceFailedAls.invoice, due_on: null } }).summary).toBe("issued Sep 3, 2026 · 3 lines");
    expect(model.total).toBe("$540.00");
    expect(model.headerTone).toBe("");
    expect(model.lines).toHaveLength(3);
    expect(model.lines[1]?.name).toMatch(/Pils/);
    expect(model.questions[0]?.detail).toMatch(/The Pils count looks short/);
    expect(model.questions[0]?.detail).toMatch(/Dana/);
    expect(model.questions[0]?.answered).toBe(false);
    expect(model.mappings).toEqual(invoiceFailedAls.mappings);
  });

  it("omits mapping rows when the snapshot has none", () => {
    const model = toInvoiceViewProps({
      invoice: invoiceFailedAls.invoice,
      lines: invoiceFailedAls.lines,
      questions: invoiceFailedAls.questions,
    });
    expect(model.mappings).toBeUndefined();
    const html = htmlOf(createElement(InvoiceView, { model }));
    expect(html).not.toMatch(/Push invoice/);
    expect(html).not.toMatch(/Customer mapping/);
    expect(html).toContain(ALS.name);
  });

  it("the inventory drawing still shows Mark answered, Push invoice, and Al’s Bar", () => {
    const html = htmlOf(createElement(InvoiceView, { model: toInvoiceViewProps(invoiceFailedAls) }));
    expect(html).toMatch(/Mark answered/);
    expect(html).toMatch(/Push invoice/);
    expect(html).toContain(ALS.name);
    expect(html).toMatch(/INV-1039/);
    expect(html).toMatch(/Customer mapping/);
    expect(html).toMatch(/QuickBooks item is missing/);
  });

  it("a qbo slot replaces mapping rows and the push button", () => {
    const html = htmlOf(createElement(InvoiceView, {
      model: toInvoiceViewProps(invoiceFailedAls),
      qbo: "QuickBooks mapping and push aren’t connected yet",
    }));
    expect(html).toMatch(/aren’t connected yet/);
    expect(html).not.toMatch(/Push invoice/);
    expect(html).not.toMatch(/Customer mapping/);
    expect(html).toMatch(/Mark answered/);
  });

  it("the Invoice inventory record is InvoiceView painted from that fixture", () => {
    const body = SCREENS.find((s) => s.name === "Invoice")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Invoice")!.body)).toBe(true);
    expect(body.type).toBe(InvoiceView);
    expect(body.props.model).toEqual(toInvoiceViewProps(invoiceFailedAls));
  });

  it("the live invoice page mounts InvoiceView with no second E.* tree", () => {
    const src = readFileSync("app/(app)/invoices/[id]/page.tsx", "utf8");
    expect(src).toMatch(/from "@\/components\/mgr\/views\/invoice"/);
    expect(src).toMatch(/<InvoiceView\b/);
    expect(src).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(src).not.toMatch(/qboGate=|<QboInvoiceRow/);
    expect(src).toMatch(/<QboInvoiceActions/);
    expect(src).toMatch(/<MarkAnswered\b/);
  });
});
