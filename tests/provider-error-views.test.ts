import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PointOfSaleView } from "@/components/mgr/views/pos";
import { PortalInvoiceView } from "@/components/mgr/views/portal-invoice";
import { toPortalInvoiceViewProps } from "@/lib/mgr/portal-invoice-view";
import { portalInvoiceUnpaid } from "@/lib/mgr/fixtures/portal-invoices";

it.each([true, false])("offers safe OAuth retry when connected is %s", (connected) => {
  const html = renderToStaticMarkup(createElement(PointOfSaleView, {
    model: { connected, merchant: "Seller", state: "connected", locations: "", lastSync: "", oauthFailed: true },
    paths: { connect: "/settings/pos/connect" },
  }));
  expect(html).toContain("Square connection was not completed");
  expect(html).toContain('href="/settings/pos/connect"');
  expect(html).toContain("Try connecting again");
});

it("keeps invoice context and a safe return destination after payment failure", () => {
  const html = renderToStaticMarkup(createElement(PortalInvoiceView, {
    model: toPortalInvoiceViewProps(portalInvoiceUnpaid), variant: "unavailable", paymentFailed: true, returnHref: "/portal/invoices/invoice-1", footer: null,
  }));
  expect(html).toContain("Payment unavailable");
  expect(html).toContain("Return to invoice");
  expect(html).toContain('href="/portal/invoices/invoice-1"');
  expect(html).toContain("Question this invoice");
});
