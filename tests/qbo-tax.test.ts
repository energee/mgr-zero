import { describe, expect, it, vi } from "vitest";
import { QboOAuthClient } from "@/lib/qbo";

const config = {
  clientId: "client", clientSecret: "secret", redirectUri: "https://mgr.test/qbo",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
  taxApiBaseUrl: "https://qb-sandbox.api.intuit.com/graphql",
};
const input = {
  transactionDate: "2026-10-10", customerId: "qbo-customer",
  sourceAddress: "10 Brewery Rd, Town, PA 19000",
  destinationAddress: "1 Main St, Town, PA 19100",
  lines: [{ itemId: "qbo-item", qty: 2, unitPriceCents: 3600 }],
};

describe("QuickBooks sales-tax calculation", () => {
  it("uses the documented GraphQL shape and adds line and shipping tax exactly once", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: { indirectTaxCalculateSaleTransactionTax: { taxCalculation: {
        taxTotals: { totalTaxAmountExcludingShipping: { value: "7.25", currency: "USD" } },
        shipping: { taxAmount: { value: "1.00", currency: "USD" } },
      } } },
    }), { status: 200 }));
    const client = new QboOAuthClient(config as any, fetch) as any;

    await expect(client.calculateSalesTax(input, "access-secret")).resolves.toBe(825);
    expect(String(fetch.mock.calls[0][0])).toBe(config.taxApiBaseUrl);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer access-secret" }) });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.query).toContain("indirectTaxCalculateSaleTransactionTax");
    expect(body.variables.input).toMatchObject({
      transactionDate: "2026-10-10",
      subject: { qbCustomerId: "qbo-customer" },
      lineItems: [{ numberOfUnits: 2, productVariantTaxability: { productVariantId: "qbo-item" }, pricePerUnitExcludingTaxes: { value: "36.00", currency: "USD" } }],
    });
  });

  it("refuses HTTP, GraphQL, malformed, foreign-currency, and fractional-cent results", async () => {
    const responses = [
      new Response("down", { status: 503 }),
      new Response(JSON.stringify({ errors: [{ message: "access-secret denied" }] }), { status: 200 }),
      new Response(JSON.stringify({ data: {} }), { status: 200 }),
      taxResponse("1.00", "CAD", "0.00", "CAD"),
      taxResponse("1.001", "USD", "0.00", "USD"),
    ];
    for (const response of responses) {
      const client = new QboOAuthClient(config as any, vi.fn<typeof globalThis.fetch>().mockResolvedValue(response)) as any;
      await expect(client.calculateSalesTax(input, "access-secret")).rejects.toThrow("QuickBooks tax calculation unavailable");
    }
  });
});

function taxResponse(line: string, lineCurrency: string, shipping: string, shippingCurrency: string) {
  return new Response(JSON.stringify({ data: { indirectTaxCalculateSaleTransactionTax: { taxCalculation: {
    taxTotals: { totalTaxAmountExcludingShipping: { value: line, currency: lineCurrency } },
    shipping: { taxAmount: { value: shipping, currency: shippingCurrency } },
  } } } }), { status: 200 });
}
