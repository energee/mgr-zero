// tests/search.test.ts — Program 10 task 3: one registered search across the
// entity kinds the caller may read. A document number (ORD-0001) matches
// exactly and sorts first; names match on prefix; a customer role is refused.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { asUser, channelId, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku } from "./helpers";
import { runCommand, type Ctx as CommandCtx } from "@/lib/commands/registry";
import { SEARCH_KINDS, type SearchHit } from "@/lib/commands/search";
import "@/lib/commands/all";
import { POST } from "@/app/api/command/route";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let b: { id: string }, adminCtx: Ctx, salesCtx: Ctx, orderId: string, skuId: string, customerId: string;

beforeAll(async () => {
  b = await makeBrewery();
  adminCtx = await makeStaffCtx(b.id, "admin");
  salesCtx = await makeStaffCtx(b.id, "sales");
  const wh = await ins("locations", { brewery_id: b.id, name: "WH", uses: ["warehouse"] });
  const brand = await ins("brands", { brewery_id: b.id, name: "Hazy IPA" });
  const format = await ins("formats", { brewery_id: b.id, name: "1/2 bbl keg", basis: "packaged", package_type: "keg", keg_size: "half_bbl", bbl_per_unit: 0.5 });
  skuId = (await ins("skus", { brewery_id: b.id, brand_id: brand.id, format_id: format.id, name: "Hazy IPA 1/2 bbl" })).id;
  const wholesale = await channelId(b.id, "Wholesale");
  customerId = (await ins("customers", { brewery_id: b.id, name: "Ridgeline Tap Room", type: "retailer", state: "PA", sale_channel_id: wholesale })).id;
  await priceSku(b.id, { saleChannelId: wholesale, brandId: brand.id, formatId: format.id, cents: 12000 });
  const shipTo = await ins("ship_tos", { brewery_id: b.id, customer_id: customerId, label: "m", address1: "1", city: "P", state: "PA", zip: "19100" });
  orderId = ((await runCommand("create_order", { kind: "wholesale", customerId, shipToId: shipTo.id, fromLocationId: wh.id, lines: [{ skuId, qty: 1 }] }, adminCtx)) as { order_id: string }).order_id;
});

const search = (q: string, ctx: CommandCtx = adminCtx, kinds?: string[]) => runCommand("search_entities", { q, kinds }, ctx) as Promise<SearchHit[]>;

describe("search_entities", () => {
  it("a document number matches exactly and sorts first", async () => {
    const hits = await search("ORD-0001");
    expect(hits[0]).toMatchObject({ kind: "order", id: orderId, href: `/orders/${orderId}` });
  });
  it("reaches an old open order after it falls beyond the newest fifty", async () => {
    const original = await adminCtx.db.from("orders").select("order_no,status").eq("id", orderId).single();
    expect(original.error).toBeNull();
    expect(original.data!.status).toBe("draft");
    const base = await adminCtx.db.from("orders").select("customer_id,ship_to_id,from_location_id").eq("id", orderId).single();
    expect(base.error).toBeNull();
    for (let index = 0; index < 55; index += 1) {
      await runCommand("create_order", {
        kind: "wholesale", customerId: base.data!.customer_id!, shipToId: base.data!.ship_to_id!,
        fromLocationId: base.data!.from_location_id!, lines: [{ skuId, qty: 1 }],
      }, adminCtx);
    }
    const { rows: newest } = await runCommand("list_orders", {}, adminCtx) as { rows: { id: string }[] };
    expect(newest).toHaveLength(50);
    expect(newest.map((row) => row.id)).not.toContain(orderId);

    const hits = await search(`ORD-${original.data!.order_no}`);
    expect(hits).toContainEqual(expect.objectContaining({ kind: "order", id: orderId, href: `/orders/${orderId}` }));
    expect((await runCommand("get_order", { orderId }, adminCtx) as { order: { status: string } }).order.status).toBe("draft");
  });
  it("a name matches on prefix across kinds", async () => {
    const hits = await search("Haz");
    expect(hits.map((h) => `${h.kind}:${h.id}`)).toContain(`sku:${skuId}`);
    expect((await search("ridge")).map((h) => h.id)).toContain(customerId);
    expect(await search("zzz-nothing")).toEqual([]);
  });
  it("a document number past the column's range is no match, not an error", async () => {
    await expect(search("ORD-99999999999999999999")).resolves.toEqual([]);
    await expect(search("INV-2147483648")).resolves.toEqual([]);
  });

  it("kinds narrow the search and never widen it", async () => {
    const hits = await search("Haz", adminCtx, ["customer"]);
    expect(hits.map((h) => h.kind)).not.toContain("sku");
  });
  it.each([SEARCH_KINDS.length + 1, 16])("rejects %i kinds before any database reads", async (count) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      await expect(search("Haz", salesCtx, Array(count).fill("sku"))).rejects.toMatchObject({ status: 400, code: "invalid_input" });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it.each([2, SEARCH_KINDS.length])("searches %i repeated SKU kinds only once", async (count) => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const hits = await search("Haz", salesCtx, Array(count).fill("sku"));
      expect(hits).toEqual([expect.objectContaining({ kind: "sku", id: skuId })]);
      expect(fetch.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual(["/rest/v1/skus", "/rest/v1/skus"]);
    } finally {
      fetch.mockRestore();
    }
  });
  it("accepts all eight kinds while retaining role-filtered results", async () => {
    const expected = await search("Haz", salesCtx);
    expect(expected).toContainEqual(expect.objectContaining({ kind: "sku", id: skuId }));
    expect(await search("Haz", salesCtx, [...SEARCH_KINDS])).toEqual(expected);
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      expect(await search("PO-0001", salesCtx, ["po", "po"])).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("bounds actual search reads through the authenticated HTTP endpoint", async () => {
    const { data: { session } } = await salesCtx.db.auth.getSession();
    expect(session).not.toBeNull();
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      for (const count of [1, 2, 16]) {
        fetch.mockClear();
        const response = await POST(new Request("http://localhost/api/command", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${session!.access_token}` },
          body: JSON.stringify({ breweryId: b.id, name: "search_entities", input: { q: "Haz", kinds: Array(count).fill("sku") } }),
        }));
        const body = await response.json();
        const skuReads = fetch.mock.calls.filter(([url]) => new URL(String(url)).pathname === "/rest/v1/skus");
        if (count > SEARCH_KINDS.length) {
          expect(response.status).toBe(400);
          expect(body).toMatchObject({ ok: false, error: { code: "invalid_input" } });
          expect(skuReads).toHaveLength(0);
        } else {
          expect(response.status).toBe(200);
          expect(body).toMatchObject({ ok: true, data: [expect.objectContaining({ kind: "sku", id: skuId })] });
          expect(body.data).toHaveLength(1);
          expect(skuReads).toHaveLength(2);
        }
      }
    } finally {
      fetch.mockRestore();
    }
  });
  it("refuses a customer role", async () => {
    const u = await makeCustomerUser(customerId);
    const db = await asUser(u.email);
    await expect(search("Haz", { db, userId: u.id, breweryId: b.id, role: "customer", customerId })).rejects.toThrow(/permission denied/);
  });
});
