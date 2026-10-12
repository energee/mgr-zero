// QboOAuthClient customer client against a faked transport: queryCustomers (paged, all-or-error reads)
// and createCustomer/updateCustomer (frozen-body writes, typed faults).
import { describe, expect, it, vi } from "vitest";
import { QboHttpError, QboOAuthClient } from "@/lib/qbo";

const config = {
  clientId: "client-id", clientSecret: "client-secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

function wire(n: number, overrides: Record<string, unknown> = {}) {
  return {
    Id: String(n), SyncToken: "0", DisplayName: `Customer ${n}`, Active: true,
    MetaData: { CreateTime: "2026-01-01T00:00:00-07:00", LastUpdatedTime: "2026-10-01T12:00:00.123-07:00" },
    ...overrides,
  };
}
const page = (customers: unknown[]) =>
  new Response(JSON.stringify({ QueryResponse: customers.length ? { Customer: customers } : {} }), { status: 200 });
const range = (from: number, count: number) => Array.from({ length: count }, (_, i) => wire(from + i));
const setup = (...responses: (Response | Error)[]) => {
  const transport = vi.fn<typeof globalThis.fetch>();
  for (const r of responses) {
    if (r instanceof Error) transport.mockRejectedValueOnce(r);
    else transport.mockResolvedValueOnce(r);
  }
  return { transport, client: new QboOAuthClient(config, transport) };
};
const queryOf = (transport: ReturnType<typeof setup>["transport"], call: number) =>
  new URL(String(transport.mock.calls[call][0])).searchParams.get("query");

describe("queryCustomers pages", () => {
  it("returns an empty completed query", async () => {
    const { client, transport } = setup(page([]));
    expect(await client.queryCustomers("realm-fixture", "access-fixture")).toEqual([]);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("reads a full page of 1000 then the remainder, with inactive customers included", async () => {
    const { client, transport } = setup(page(range(1, 1000)), page(range(1001, 1)));
    const result = await client.queryCustomers("realm-fixture", "access-fixture");
    expect(result).toHaveLength(1001);
    expect(transport).toHaveBeenCalledTimes(2);
    const first = new URL(String(transport.mock.calls[0][0]));
    expect(first.pathname).toBe("/v3/company/realm-fixture/query");
    expect(first.searchParams.get("minorversion")).toBe("75");
    expect(queryOf(transport, 0)).toBe("SELECT * FROM Customer WHERE Active IN (true, false) STARTPOSITION 1 MAXRESULTS 1000");
    expect(queryOf(transport, 1)).toBe("SELECT * FROM Customer WHERE Active IN (true, false) STARTPOSITION 1001 MAXRESULTS 1000");
    expect(transport.mock.calls[0][1]).toMatchObject({
      method: "GET", redirect: "error",
      headers: expect.objectContaining({ Authorization: "Bearer access-fixture", Accept: "application/json" }),
    });
  });

  it("asks for one more page when the last page is exactly full, and accepts it empty", async () => {
    const { client, transport } = setup(page(range(1, 1000)), page([]));
    expect(await client.queryCustomers("realm-fixture", "access-fixture")).toHaveLength(1000);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("fails the whole query when a later page errors", async () => {
    const { client } = setup(page(range(1, 1000)), new Response("{}", { status: 500 }));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/customer query failed \(500\)/);
  });

  it("fails when a later page throws at the network layer", async () => {
    const { client } = setup(page(range(1, 1000)), new Error("socket hang up"));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow();
  });

  it("fails rather than loop when the provider repeats a page", async () => {
    const { client } = setup(page(range(1, 1000)), page(range(1, 1000)));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
  });

  it.each([[401], [429], [503]])("rejects HTTP %i with a numeric status a caller can branch on", async (status) => {
    const { client } = setup(new Response("{}", { status }));
    const error = await client.queryCustomers("realm-fixture", "access-fixture").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(QboHttpError);
    expect((error as QboHttpError).status).toBe(status);
    expect((error as Error).message).toMatch(new RegExp(`\\(${status}\\)`));
  });

  it("rejects a page with more than 1000 rows", async () => {
    const { client } = setup(page(range(1, 1001)));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
  });
});

const badMoments = [
  "2026-02-30T12:00:00Z", "2026-04-31T12:00:00Z", "2026-02-29T12:00:00Z",
  "2026-10-01T24:00:00Z", "2026-10-01T12:60:00Z", "2026-10-01T12:00:60Z", "2026-10-01T12:00:00+25:00",
];

describe("queryCustomers changedSince", () => {
  it("filters inclusively on Metadata.LastUpdatedTime with the timestamp unchanged", async () => {
    const { client, transport } = setup(page([]));
    await client.queryCustomers("realm-fixture", "access-fixture", "2026-10-01T12:00:00.123-07:00");
    expect(queryOf(transport, 0)).toBe(
      "SELECT * FROM Customer WHERE Active IN (true, false) AND Metadata.LastUpdatedTime >= '2026-10-01T12:00:00.123-07:00' STARTPOSITION 1 MAXRESULTS 1000",
    );
  });

  it.each(["", "yesterday", "2026-10-01", "2026-10-01T12:00:00Z' OR Active = true", "2026-13-01T12:00:00Z", ...badMoments])(
    "rejects unsafe or unparseable timestamp %j without calling QuickBooks",
    async (bad) => {
      const { client, transport } = setup();
      await expect(client.queryCustomers("realm-fixture", "access-fixture", bad)).rejects.toThrow(/changedSince/);
      expect(transport).not.toHaveBeenCalled();
    },
  );
});

describe("queryCustomers parsing", () => {
  it("maps required and nested optional fields, nulling absent or blank ones", async () => {
    const { client } = setup(page([
      wire(1, {
        CompanyName: "Acme Co", PrimaryEmailAddr: { Address: "a@acme.test" }, PrimaryPhone: { FreeFormNumber: "555-0100" },
        BillAddr: { Line1: "1 Main", Line2: "Suite 2", City: "Town", CountrySubDivisionCode: "PA", PostalCode: "19000", Lat: "1" },
        Active: false, SyncToken: "7",
      }),
      wire(2, { CompanyName: "  ", BillAddr: {} }),
    ]));
    expect(await client.queryCustomers("realm-fixture", "access-fixture")).toEqual([
      {
        id: "1", displayName: "Customer 1", companyName: "Acme Co", email: "a@acme.test", phone: "555-0100",
        billAddress1: "1 Main", billAddress2: "Suite 2", billCity: "Town", billState: "PA", billZip: "19000",
        active: false, syncToken: "7", updatedAt: "2026-10-01T12:00:00.123-07:00",
      },
      {
        id: "2", displayName: "Customer 2", companyName: null, email: null, phone: null,
        billAddress1: null, billAddress2: null, billCity: null, billState: null, billZip: null,
        active: true, syncToken: "0", updatedAt: "2026-10-01T12:00:00.123-07:00",
      },
    ]);
  });

  it.each([
    ["missing Id", { Id: undefined }],
    ["missing DisplayName", { DisplayName: undefined }],
    ["missing SyncToken", { SyncToken: undefined }],
    ["missing Active", { Active: undefined }],
    ["string Active", { Active: "true" }],
    ["missing MetaData", { MetaData: undefined }],
    ["unparseable LastUpdatedTime", { MetaData: { LastUpdatedTime: "soon" } }],
    ["numeric email address", { PrimaryEmailAddr: { Address: 5 } }],
    ["non-object BillAddr", { BillAddr: "1 Main" }],
  ])("rejects a customer with %s", async (_label, overrides) => {
    const { client } = setup(page([wire(1), wire(2, overrides)]));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
  });

  it.each(badMoments)("rejects a response row with impossible LastUpdatedTime %s", async (bad) => {
    const { client } = setup(page([wire(1, { MetaData: { LastUpdatedTime: bad } })]));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
  });

  it("accepts a real leap day and keeps the timestamp string exactly", async () => {
    const t = "2028-02-29T23:59:59.1234567+05:30";
    const { client } = setup(page([wire(1, { MetaData: { LastUpdatedTime: t } })]));
    expect((await client.queryCustomers("realm-fixture", "access-fixture"))[0].updatedAt).toBe(t);
  });

  it("keeps provider values verbatim (whitespace included); blank-only optionals become null", async () => {
    const { client } = setup(page([wire(1, { Id: " 1 ", DisplayName: " Acme ", CompanyName: " Acme Co ", PrimaryPhone: { FreeFormNumber: "  " } })]));
    const [c] = await client.queryCustomers("realm-fixture", "access-fixture");
    expect([c.id, c.displayName, c.companyName, c.phone]).toEqual([" 1 ", " Acme ", " Acme Co ", null]);
  });

  it.each([["Id", { Id: "  " }], ["DisplayName", { DisplayName: "\t" }], ["SyncToken", { SyncToken: " " }]])(
    "rejects a whitespace-only %s", async (_l, overrides) => {
      const { client } = setup(page([wire(1, overrides)]));
      await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
    });

  it("rejects an unparseable JSON body", async () => {
    const { client } = setup(new Response('{"QueryResponse":{"Customer":[', { status: 200 }));
    await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
  });

  it("rejects duplicate ids, a Fault body, and non-array Customer", async () => {
    for (const body of [
      { QueryResponse: { Customer: [wire(1), wire(1)] } },
      { QueryResponse: { Fault: { Error: [{ Message: "bad" }] } } },
      { Fault: { Error: [{ Message: "bad" }] }, QueryResponse: {} },
      { Fault: { Error: [{ Message: "bad" }] } },
      { QueryResponse: { Customer: wire(1) } },
      { nope: true },
    ]) {
      const { client } = setup(new Response(JSON.stringify(body), { status: 200 }));
      await expect(client.queryCustomers("realm-fixture", "access-fixture")).rejects.toThrow(/invalid/);
    }
  });
});

// createCustomer / updateCustomer: frozen-body transport and typed faults.
const fault = (status: number, code: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ Fault: { Error: [{ Message: "Stale Object Error", Detail: "secret@customer.test", code }], type: "ValidationFault" } }),
    { status, headers });
const created = (id = "42", token = "1") => new Response(JSON.stringify({ Customer: wire(Number(id), { SyncToken: token }) }), { status: 200 });
const REQ = "req-1";
const CREATE = '{"DisplayName":"A  B",  "PrimaryEmailAddr":{"Address":"a@b.test"}}';
const UPDATE = '{ "Id":"42","SyncToken":"3","sparse":true,"DisplayName":"New" }';
const sentOf = (t: ReturnType<typeof setup>["transport"]) => ({ url: new URL(String(t.mock.calls[0][0])), init: t.mock.calls[0][1]! });

describe("customer writes: sparse frozen transport", () => {
  it("sends create bytes unchanged with requestid, version 75, and no redirects", async () => {
    const { client, transport } = setup(created());
    const r = await client.createCustomer("realm-1", REQ, CREATE, "tok");
    const { url, init } = sentOf(transport);
    expect(init.body).toBe(CREATE);
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(url.pathname).toBe("/v3/company/realm-1/customer");
    expect(url.searchParams.get("requestid")).toBe(REQ);
    expect(url.searchParams.get("minorversion")).toBe("75");
    expect(r).toMatchObject({ ok: true, customer: { id: "42", syncToken: "1" } });
  });

  it("sends update bytes unchanged and returns the new token", async () => {
    const { client, transport } = setup(created("42", "4"));
    const r = await client.updateCustomer("realm-1", REQ, "42", "3", UPDATE, "tok");
    expect(sentOf(transport).init.body).toBe(UPDATE);
    expect(r).toMatchObject({ ok: true, customer: { id: "42", syncToken: "4" } });
  });

  // Proves only that the client sends identical arguments twice. It is NOT evidence that QuickBooks replays by requestid.
  it("sends an identical request id and body bytes on a repeated call", async () => {
    const { client, transport } = setup(new Error("socket hang up"), created());
    await expect(client.createCustomer("realm-1", REQ, CREATE, "tok")).rejects.toThrow("socket hang up");
    await client.createCustomer("realm-1", REQ, CREATE, "tok");
    const [a, b] = transport.mock.calls;
    expect(new URL(String(a[0])).searchParams.get("requestid")).toBe(new URL(String(b[0])).searchParams.get("requestid"));
    expect(a[1]!.body).toBe(b[1]!.body);
  });

  it("rejects an update envelope that disagrees with its arguments before any request, as a rejection", async () => {
    const { client, transport } = setup();
    for (const [id, token, body] of [
      ["43", "3", UPDATE], ["42", "9", UPDATE],
      ["42", "3", '{"Id":"42","SyncToken":"3","DisplayName":"x"}'],
      ["42", "3", '{"Id":"42","SyncToken":"3","sparse":false}'],
      ["42", "3", "not json"], ["", "", '{"sparse":true}'],
    ]) await expect(client.updateCustomer("r", REQ, id, token, body, "tok")).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a create body that carries Id/SyncToken or is not an object, as a rejection", async () => {
    const { client, transport } = setup();
    for (const body of ['{"Id":"1","DisplayName":"x"}', '{"SyncToken":"0"}', "[]", "nope"]) {
      await expect(client.createCustomer("r", REQ, body, "tok")).rejects.toThrow();
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it("rejects a blank request id before any request", async () => {
    const { client, transport } = setup();
    await expect(client.createCustomer("r", " ", CREATE, "tok")).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });

  it("types a stale token fault (5010) and does not retry or re-read", async () => {
    const { client, transport } = setup(fault(400, "5010", { intuit_tid: "tid-9" }));
    const r = await client.updateCustomer("r", REQ, "42", "3", UPDATE, "tok");
    expect(r).toEqual({ ok: false, status: 400, code: "5010", message: "Stale Object Error", intuitRequestId: "tid-9", requestId: REQ, kind: "stale_token" });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("surfaces duplicate name (6240) as validation and never leaks Detail or headers", async () => {
    const { client } = setup(fault(400, "6240", { "set-cookie": "s=1", authorization: "Bearer leak" }));
    const r = await client.createCustomer("r", REQ, CREATE, "tok");
    expect(r).toMatchObject({ ok: false, code: "6240", kind: "validation", intuitRequestId: null });
    expect(JSON.stringify(r)).not.toMatch(/secret@customer|Bearer|set-cookie|tok/);
  });

  it("classifies 401/403 as authorization, only 400/422 as a definite validation failure, every other status as retryable (outcome unknown)", async () => {
    const statuses = [[401, "authorization"], [403, "authorization"], [400, "validation"], [422, "validation"],
      [408, "retryable"], [409, "retryable"], [413, "retryable"], [404, "retryable"], [429, "retryable"], [500, "retryable"], [503, "retryable"]] as const;
    for (const [status, kind] of statuses) {
      const { client } = setup(new Response("<html>gateway</html>", { status }));
      const r = await client.createCustomer("r", REQ, CREATE, "tok");
      expect(r).toMatchObject({ ok: false, status, kind, code: null });
    }
  });

  it("never reports success for a malformed or mismatched 200", async () => {
    const bad = [
      new Response("not json", { status: 200 }),
      new Response("{}", { status: 200 }),
      new Response(JSON.stringify({ Fault: { Error: [] } }), { status: 200 }),
      new Response(JSON.stringify({ Customer: { Id: "42" } }), { status: 200 }),
      created("99", "1"), // update response for a different customer
    ];
    for (const response of bad) {
      const { client } = setup(response);
      await expect(client.updateCustomer("r", REQ, "42", "3", UPDATE, "tok")).rejects.toThrow("QuickBooks customer response was invalid");
    }
  });

  it("propagates network failure as an unknown outcome", async () => {
    const { client } = setup(new Error("ECONNRESET"));
    await expect(client.updateCustomer("r", REQ, "42", "3", UPDATE, "tok")).rejects.toThrow("ECONNRESET");
  });
});
