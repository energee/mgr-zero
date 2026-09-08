// tests/portal-invoices-view.test.ts — Portal invoice views share adapters
// with portal_invoices / portal_invoice. Views own no sample data. Tests
// paint the views; they do not import SCREENS or app/.
import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCREENS } from "../components/mgr/screens";
import { PortalInvoiceView } from "../components/mgr/views/portal-invoice";
import { PortalInvoicesView } from "../components/mgr/views/portal-invoices";
import { QuestionInvoiceView } from "../components/mgr/views/question-invoice";
import { RIDGELINE } from "../lib/mgr/fixtures/demo";
import { portalInvoicePaid, portalInvoiceUnpaid, portalInvoicesRidgeline } from "../lib/mgr/fixtures/portal-invoices";
import { toPortalInvoiceViewProps } from "../lib/mgr/portal-invoice-view";
import { toPortalInvoicesViewProps } from "../lib/mgr/portal-invoices-view";
import { toQuestionInvoiceViewProps } from "../lib/mgr/question-invoice-view";

const htmlOf = (node: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(createElement("div", null, node));

describe("Invoice history view", () => {
  it("maps portal_invoices rows, summing invoice_lines", () => {
    const model = toPortalInvoicesViewProps(portalInvoicesRidgeline);
    expect(model.subtitle).toBe(RIDGELINE.name);
    expect(model.empty).toBeUndefined();
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0]).toMatchObject({
      title: "INV-1042",
      detail: "due 2026-10-03",
      total: "$948.00",
      unpaid: true,
      tone: "",
      href: "/portal/invoices/00000000-0000-4000-8000-000000001042",
    });
    expect(model.rows[1]).toMatchObject({
      title: "INV-1037",
      detail: "paid 2026-08-29",
      total: "$980.00",
      unpaid: false,
      tone: "ok",
    });
  });

  it("names an empty list without inventing rows", () => {
    const model = toPortalInvoicesViewProps({ customerName: RIDGELINE.name, invoices: [] });
    expect(model.empty).toBe("No invoices yet");
    expect(model.rows).toEqual([]);
  });

  it("treats a credit memo as settled money, not Pay", () => {
    const model = toPortalInvoicesViewProps({
      customerName: RIDGELINE.name,
      invoices: [{
        id: "cm-12",
        invoice_no: 12,
        kind: "credit_memo",
        due_on: null,
        paid_at: null,
        invoice_lines: [{ amount_cents: -10600 }],
      }],
    });
    expect(model.rows[0]).toMatchObject({
      title: "CM-0012",
      detail: "credit",
      total: "−$106.00",
      unpaid: false,
      tone: "ok",
    });
  });

  it("the inventory drawing still offers Pay on the unpaid row", () => {
    const html = htmlOf(createElement(PortalInvoicesView, { model: toPortalInvoicesViewProps(portalInvoicesRidgeline) }));
    expect(html).toMatch(/Invoices/);
    expect(html).toContain(RIDGELINE.name);
    expect(html).toMatch(/INV-1042/);
    expect(html).toMatch(/due 2026-10-03 · \$948\.00/);
    expect(html).toMatch(/>Pay</);
    expect(html).toMatch(/INV-1037/);
    expect(html).toMatch(/paid 2026-08-29/);
    expect(html).toMatch(/\$980\.00/);
    expect(html).not.toMatch(/href="\/portal\/invoices/);
    expect(html).not.toMatch(/→/);
  });

  it("linkRows turns the unpaid total into the invoice link", () => {
    const html = htmlOf(createElement(PortalInvoicesView, {
      model: toPortalInvoicesViewProps(portalInvoicesRidgeline),
      linkRows: true,
    }));
    expect(html).toMatch(/href="\/portal\/invoices\/00000000-0000-4000-8000-000000001042"/);
    expect(html).toMatch(/>\$948\.00</);
    expect(html).not.toMatch(/>Pay</);
    expect(html).toMatch(/due 2026-10-03/);
    expect(html).not.toMatch(/due 2026-10-03 · \$948\.00/);
  });
});

describe("Portal invoice view", () => {
  it("maps portal_invoice onto number, total, due, lines, and brewery phone", () => {
    const model = toPortalInvoiceViewProps(portalInvoiceUnpaid);
    expect(model.title).toBe("INV-1042");
    expect(model.backHref).toBe("/portal/invoices");
    expect(model.total).toBe("$948.00");
    expect(model.due).toBe("2026-10-03");
    expect(model.paid).toBe(false);
    expect(model.breweryName).toBe("Demo Brewing");
    expect(model.breweryPhone).toBe("(610) 555-0142");
    expect(model.lines.map((l) => [l.item, l.qty, l.amount])).toEqual([
      ["Hazy IPA · ½ bbl", "4", "$600.00"],
      ["Pils · 16 oz case", "6", "$228.00"],
      ["Keg deposit · NON", "4", "$120.00"],
    ]);
  });

  it("maps a paid invoice onto the paid date", () => {
    const model = toPortalInvoiceViewProps(portalInvoicePaid);
    expect(model.title).toBe("INV-1037");
    expect(model.total).toBe("$980.00");
    expect(model.paid).toBe(true);
    expect(model.paidOn).toBe("2026-08-29");
    expect(model.lines).toHaveLength(2);
  });

  it("the pay drawing still shows Pay invoice, Download PDF, and Question", () => {
    const html = htmlOf(createElement(PortalInvoiceView, {
      model: toPortalInvoiceViewProps(portalInvoiceUnpaid),
      variant: "pay",
    }));
    expect(html).toMatch(/INV-1042/);
    expect(html).toMatch(/\$948\.00/);
    expect(html).toMatch(/Unpaid/);
    expect(html).toMatch(/>Pay invoice</);
    expect(html).toMatch(/>Download PDF</);
    expect(html).toMatch(/Question this invoice/);
    expect(html).toMatch(/QuickBooks/);
    expect(html).not.toMatch(/→/);
  });

  it("the unavailable drawing has no Pay and still offers Question", () => {
    const html = htmlOf(createElement(PortalInvoiceView, {
      model: toPortalInvoiceViewProps(portalInvoiceUnpaid),
      variant: "unavailable",
    }));
    expect(html).toMatch(/Online payment isn’t available/);
    expect(html).toMatch(/Contact Demo Brewing/);
    expect(html).toMatch(/Demo Brewing/);
    expect(html).toMatch(/\(610\) 555-0142/);
    expect(html).toMatch(/Question this invoice/);
    expect(html).not.toMatch(/>Pay invoice</);
    expect(html).not.toMatch(/>Download PDF</);
  });

  it("omitting variant on an unpaid invoice is the unavailable drawing", () => {
    const html = htmlOf(createElement(PortalInvoiceView, {
      model: toPortalInvoiceViewProps(portalInvoiceUnpaid),
    }));
    expect(html).toMatch(/Online payment isn’t available/);
    expect(html).not.toMatch(/>Pay invoice</);
    expect(html).toMatch(/Question this invoice/);
  });

  it("the paid drawing keeps Question alongside its fixture PDF action", () => {
    const html = htmlOf(createElement(PortalInvoiceView, {
      model: toPortalInvoiceViewProps(portalInvoicePaid),
      variant: "paid",
    }));
    expect(html).toMatch(/INV-1037/);
    expect(html).toMatch(/\$980\.00/);
    expect(html).toMatch(/Paid/);
    expect(html).toMatch(/2026-08-29/);
    expect(html).toMatch(/>Download PDF</);
    expect(html).not.toMatch(/>Pay invoice</);
    expect(html).toMatch(/Question this invoice/);
    expect(html).not.toMatch(/Unpaid/);
  });

  it("a question slot replaces the inventory Question nav", () => {
    const html = htmlOf(createElement(PortalInvoiceView, {
      model: toPortalInvoiceViewProps(portalInvoiceUnpaid),
      variant: "unavailable",
      question: "Ask about this invoice" as unknown as ReactNode,
    }));
    expect(html).toMatch(/Ask about this invoice/);
    expect(html).not.toMatch(/Question this invoice/);
  });

  it("a footer slot replaces the default Pay and PDF buttons", () => {
    const html = htmlOf(createElement(PortalInvoiceView, {
      model: toPortalInvoiceViewProps(portalInvoiceUnpaid),
      variant: "pay",
      footer: "Custom pay" as unknown as ReactNode,
    }));
    expect(html).toMatch(/Custom pay/);
    expect(html).not.toMatch(/>Pay invoice</);
    expect(html).not.toMatch(/>Download PDF</);
    expect(html).toMatch(/Question this invoice/);
  });
});

describe("Question invoice view", () => {
  it("maps portal_invoice onto the invoice label and brewery name", () => {
    const model = toQuestionInvoiceViewProps(portalInvoiceUnpaid);
    expect(model.label).toBe("INV-1042 · $948.00");
    expect(model.breweryName).toBe("Demo Brewing");
  });

  it("the inventory drawing still offers Send to Demo Brewing", () => {
    const html = htmlOf(createElement(QuestionInvoiceView, {
      model: toQuestionInvoiceViewProps(portalInvoiceUnpaid),
    }));
    expect(html).toMatch(/INV-1042 · \$948\.00/);
    expect(html).toMatch(/What’s wrong with this invoice\?/);
    expect(html).toMatch(/>Send to Demo Brewing</);
    expect(html).not.toMatch(/→/);
  });

  it("a footer slot replaces the send button", () => {
    const html = htmlOf(createElement(QuestionInvoiceView, {
      model: toQuestionInvoiceViewProps(portalInvoiceUnpaid),
      footer: "Send now" as unknown as ReactNode,
    }));
    expect(html).toMatch(/Send now/);
    expect(html).not.toMatch(/Send to Demo Brewing/);
  });
});

describe("inventory and live portal invoices", () => {
  it("the Invoice history inventory record is PortalInvoicesView", () => {
    const body = SCREENS.find((s) => s.name === "Invoice history")!.body as { type: unknown; props: { model: unknown } };
    expect(isValidElement(SCREENS.find((s) => s.name === "Invoice history")!.body)).toBe(true);
    expect(body.type).toBe(PortalInvoicesView);
    expect(body.props.model).toEqual(toPortalInvoicesViewProps(portalInvoicesRidgeline));
  });

  it("Pay / unavailable / paid inventory records share PortalInvoiceView", () => {
    const pay = SCREENS.find((s) => s.name === "Pay invoice")!.body as { type: unknown; props: { model: unknown; variant?: string } };
    const unavailable = SCREENS.find((s) => s.name === "Payment unavailable")!.body as { type: unknown; props: { variant?: string } };
    const paid = SCREENS.find((s) => s.name === "Paid invoice")!.body as { type: unknown; props: { variant?: string } };
    expect(pay.type).toBe(PortalInvoiceView);
    expect(pay.props.model).toEqual(toPortalInvoiceViewProps(portalInvoiceUnpaid));
    expect(pay.props.variant).toBe("pay");
    expect(unavailable.type).toBe(PortalInvoiceView);
    expect(unavailable.props.variant).toBe("unavailable");
    expect(paid.type).toBe(PortalInvoiceView);
    expect(paid.props.variant).toBe("paid");
  });

  it("the Question invoice inventory record is QuestionInvoiceView", () => {
    const body = SCREENS.find((s) => s.name === "Question invoice")!.body as { type: unknown; props: { model: unknown } };
    expect(body.type).toBe(QuestionInvoiceView);
    expect(body.props.model).toEqual(toQuestionInvoiceViewProps(portalInvoiceUnpaid));
  });

  it("the live portal invoice pages mount the views with no second E.* tree", () => {
    const list = readFileSync("app/(portal)/portal/invoices/page.tsx", "utf8");
    const detail = readFileSync("app/(portal)/portal/invoices/[id]/page.tsx", "utf8");
    expect(list).toMatch(/<PortalInvoicesView\b/);
    expect(list).not.toMatch(/from "@\/components\/mgr\/e"/);
    expect(detail).toMatch(/<PortalInvoiceView\b/);
    expect(detail).not.toMatch(/from "@\/components\/mgr\/e"/);
  });
});
