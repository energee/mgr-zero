// tests/audit-quality-fixes.test.ts — pure proof for the audit quality fixes:
// QuickBooks money that cannot be an exact integer cent is rejected rather than
// carried as Infinity; a repack parent SKU with no format volume is withheld
// instead of shaped as 0 bbl; and the Square OAuth callback's recovery path
// records why it fell through instead of swallowing the cause.
import { describe, expect, it, vi } from "vitest";
import { QboOAuthClient } from "@/lib/qbo";
import { completeSquareOAuth, SquareClient } from "@/lib/pos";
import { shapeRepackParents } from "@/lib/commands/packaging";

const qboConfig = {
  clientId: "client", clientSecret: "secret",
  redirectUri: "https://mgr.test/api/integrations/qbo/oauth",
  apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
};

const squareConfig = {
  applicationId: "sandbox-app", applicationSecret: "sandbox-secret",
  redirectUri: "https://mgr.test/api/integrations/square/oauth", environment: "sandbox" as const,
};

describe("QuickBooks invoice money", () => {
  it("rejects a total that cannot round to an exact integer number of cents", async () => {
    const transport = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      Invoice: { Id: "invoice-7", SyncToken: "0", TotalAmt: 1e308, Balance: 0, LinkedTxn: [] },
    }));
    const client = new QboOAuthClient(qboConfig, transport);

    await expect(client.readInvoice("realm-1", "invoice-7", "access-secret"))
      .rejects.toThrow("QuickBooks response was invalid");
  });

  it("still reads an ordinary total", async () => {
    const transport = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      Invoice: { Id: "invoice-7", SyncToken: "0", TotalAmt: 12.34, Balance: 12.34, LinkedTxn: [] },
    }));
    const client = new QboOAuthClient(qboConfig, transport);

    await expect(client.readInvoice("realm-1", "invoice-7", "access-secret"))
      .resolves.toMatchObject({ ok: true, totalCents: 1234, balanceCents: 1234, taxCents: 0 });
  });
});

describe("repack parents", () => {
  const brands = { name: "Stout" };
  const parent = {
    id: "parent-sku", name: "Case", brand_id: "brand-1", format_id: "case",
    brands, formats: { name: "case" }, format_volume: { bbl_per_unit: 0.2 },
  };
  const child = {
    id: "child-sku", name: "Can", brand_id: "brand-1", format_id: "can",
    brands, formats: { name: "can" }, format_volume: { bbl_per_unit: 0.0083 },
  };
  const components = [{ parent_format_id: "case", child_format_id: "can", qty: 24 }];

  it("shapes a parent whose format has one component row and a known volume", () => {
    expect(shapeRepackParents(components, [parent, child])).toEqual([{
      id: "parent-sku", label: "Stout — Case", unit: "case", bblPerUnit: 0.2,
      child: { skuId: "child-sku", unit: "can", quantity: 24 },
    }]);
  });

  it("withholds a parent SKU that has no format volume rather than calling it 0 bbl", () => {
    const shaped = shapeRepackParents(components, [{ ...parent, format_volume: null }, child]);
    expect(shaped).toEqual([]);
  });

  it("withholds a parent SKU whose format volume row carries a null bbl_per_unit", () => {
    const shaped = shapeRepackParents(components, [{ ...parent, format_volume: { bbl_per_unit: null } }, child]);
    expect(shaped).toEqual([]);
  });
});

describe("Square OAuth callback", () => {
  it("records the cause before running the credential-cleanup branches", async () => {
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => { logged.push(args); });
    try {
      const fetch = vi.fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response("nope", { status: 503 }));
      const fail = vi.fn().mockResolvedValue(undefined);

      await expect(completeSquareOAuth({
        request: new Request("https://mgr.test/callback?code=one-time&state=opaque"),
        actorId: "actor-1", selectedBreweryId: "brewery-1", redirectUri: squareConfig.redirectUri,
        client: new SquareClient(squareConfig, fetch),
        store: {
          claim: vi.fn().mockResolvedValue({ intentId: "intent-1", breweryId: "brewery-1", providerIntent: "connect", requestedScopes: [] }),
          complete: vi.fn(), fail,
        },
      })).rejects.toThrow("Square is unavailable");

      // Control flow is unchanged: no token was issued, so the not_required branch ran.
      expect(fail.mock.calls[0].slice(2)).toEqual(["not_required", null]);
      const line = logged.find((args) => String(args[0]).includes("square oauth callback"));
      expect(line, "the callback logs why it fell through").toBeDefined();
      expect(JSON.stringify(line)).not.toContain("sandbox-secret");
    } finally {
      spy.mockRestore();
    }
  });
});
