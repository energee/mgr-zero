import { createServer } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { QboOAuthClient } from "@/lib/qbo";
import { SquareClient } from "@/lib/pos";

const nativeTimeout = AbortSignal.timeout.bind(AbortSignal);
let origin: string;
let stallBody = false;
const server = createServer((request, response) => {
  if (request.url?.includes("/invoice/linked")) {
    response.end(JSON.stringify({ Invoice: {
      Id: "linked", SyncToken: "1", TotalAmt: 10, Balance: 0,
      LinkedTxn: [{ TxnType: "Payment", TxnId: "payment" }],
    } }));
  } else if (stallBody) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"incomplete":');
  }
  // Otherwise leave headers pending to exercise native fetch cancellation.
});
const transport: typeof fetch = (input, init) => {
  const url = new URL(String(input));
  return fetch(`${origin}${url.pathname}${url.search}`, init);
};
const qbo = () => new QboOAuthClient({ clientId: "id", clientSecret: "secret",
  redirectUri: "https://example.test", apiBaseUrl: origin, taxApiBaseUrl: `${origin}/tax` }, transport);
const square = () => new SquareClient({ applicationId: "id", applicationSecret: "secret",
  redirectUri: "https://example.test", environment: "sandbox" }, transport);

beforeAll(async () => {
  const { promise, resolve } = Promise.withResolvers<void>();
  server.listen(0, "127.0.0.1", resolve);
  await promise;
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server has no TCP address");
  origin = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  stallBody = false;
  // Exercise native fetch's real abort behavior without waiting 20 seconds.
  vi.spyOn(AbortSignal, "timeout").mockImplementation(() => nativeTimeout(50));
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  server.closeAllConnections();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.close((error) => error ? reject(error) : resolve());
  await promise;
});

const qboCalls: Array<[string, (client: QboOAuthClient) => Promise<unknown>]> = [
  ["code exchange", client => client.exchange("code")],
  ["refresh", client => client.refresh("refresh")],
  ["customer query", client => client.queryCustomers("realm", "access")],
  ["item query", client => client.queryItems("realm", "access")],
  ["customer creation", client => client.createCustomer("realm", "request", "{}", "access")],
  ["customer update", client => client.updateCustomer("realm", "request", "customer", "1", JSON.stringify({ Id: "customer", SyncToken: "1", sparse: true }), "access")],
  ["company verification", client => client.verifyRealm("realm", "access")],
  ["revocation", client => client.revoke("access")],
  ["invoice write", client => client.createTransaction("realm", "Invoice", "request", "{}", "access")],
  ["bill recovery", client => client.findReceiptBill("realm", "request", JSON.stringify({ DocNumber: `MGR-${"a".repeat(17)}` }), "access")],
  ["invoice read", client => client.readInvoice("realm", "invoice", "access")],
  ["linked payment read", client => client.readInvoice("realm", "linked", "access")],
  ["payment link", client => client.readInvoiceLink("realm", "invoice", "access")],
  ["tax calculation", client => client.calculateSalesTax({ transactionDate: "2026-10-30", customerId: "customer", sourceAddress: "source", destinationAddress: "destination", lines: [] }, "access")],
];
const squareCalls: Array<[string, (client: SquareClient) => Promise<unknown>]> = [
  ["code exchange", client => client.exchange("code")],
  ["refresh", client => client.refresh("refresh")],
  ["revocation", client => client.revoke("access")],
  ["locations", client => client.listLocations("access", "merchant")],
  ["catalog pages", client => client.listCatalogVariations("access")],
  ["order pages", client => client.searchOrdersPage("access", ["location"], { startsAt: "2026-10-01", endsAt: "2026-10-30" }, null)],
  ["catalog read", client => client.retrieveCatalogObject("access", "item")],
  ["catalog write", client => client.upsertCatalogObject("access", "{}")],
];

describe("QuickBooks request deadlines", () => {
  it.each(qboCalls)("aborts a hung %s", async (_name, call) => {
    await expect(call(qbo())).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("also aborts a response that sends headers but never completes its body", async () => {
    stallBody = true;
    await expect(qbo().readInvoice("realm", "invoice", "access")).rejects.toMatchObject({
      name: expect.stringMatching(/^(Abort|Timeout)Error$/),
    });
  });
  it("keeps a caller's batch deadline when reading linked payments", async () => {
    vi.mocked(AbortSignal.timeout).mockImplementation(() => nativeTimeout(5_000));
    await expect(qbo().readInvoice("realm", "linked", "access", new Map(), "Invoice", nativeTimeout(50)))
      .rejects.toMatchObject({ name: "TimeoutError" });
  });
});
describe("Square request deadlines", () => {
  it.each(squareCalls)("aborts a hung %s", async (_name, call) => {
    await expect(call(square())).rejects.toMatchObject({ name: "TimeoutError" });
  });
  it("also fails when the response body stalls after headers", async () => {
    stallBody = true;
    await expect(square().listLocations("access", "merchant")).rejects.toThrow();
  });
});
