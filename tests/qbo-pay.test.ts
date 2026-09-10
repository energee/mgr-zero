import { describe, expect, it, vi } from "vitest";
import { QboOAuthClient, validateQboPaymentUrl } from "@/lib/qbo";

const config = {
  clientId: "client",
  clientSecret: "secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

describe("QuickBooks portal payment link", () => {
  it("reads InvoiceLink with a fixed authenticated request that refuses redirects", async () => {
    const transport = vi.fn(async () => Response.json({
      Invoice: { Id: "invoice-7", InvoiceLink: "https://pay.example.test/session/secret" },
    }));
    const client = new QboOAuthClient(config, transport);

    await expect(client.readInvoiceLink("realm-1", "invoice-7", "access-secret"))
      .resolves.toEqual({ ok: true, invoiceLink: "https://pay.example.test/session/secret" });
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe("https://sandbox-quickbooks.api.intuit.com/v3/company/realm-1/invoice/invoice-7?include=invoiceLink&minorversion=75");
    expect(init).toMatchObject({
      method: "GET",
      redirect: "error",
      headers: { Authorization: "Bearer access-secret", Accept: "application/json" },
    });
  });

  it("fails closed for redirects and unsafe or unverified payment URLs", async () => {
    const transport = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://pay.example.test/session/secret" },
    }));
    const client = new QboOAuthClient(config, transport);

    await expect(client.readInvoiceLink("realm-1", "invoice-7", "access-secret"))
      .resolves.toEqual({ ok: false, status: 302 });

    const allowed = new Set(["pay.example.test"]);
    expect(validateQboPaymentUrl("https://pay.example.test/session/secret", allowed)?.href)
      .toBe("https://pay.example.test/session/secret");
    for (const value of [
      "", "not a url", "http://pay.example.test/session", "https://user@pay.example.test/session",
      "https://pay.example.test:8443/session", "https://evilpay.example.test/session",
      "https://pay.example.test.evil.test/session",
    ]) expect(validateQboPaymentUrl(value, allowed)).toBeNull();
    expect(validateQboPaymentUrl("https://pay.example.test/session/secret", new Set())).toBeNull();
  });
});
