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
import { toInvoiceViewProps } from "../lib/mgr/invoice-view";

const htmlOf = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement("div", null, node));

describe("Invoice view", () => {
  it("maps get_invoice + questions through the adapter", () => {
    const model = toInvoiceViewProps(invoiceFailedAls);
    expect(model.title).toBe("INV-1039");
    expect(model.backHref).toBe("/invoices");
    expect(model.customer).toBe(ALS.name);
    expect(model.summary).toBe("due 10/03 · 3 lines");
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
    expect(src).toMatch(/qboGate=/);
    expect(src).toMatch(/<MarkAnswered\b/);
  });
});
