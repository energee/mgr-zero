// tests/portal-releases.test.ts — what a buyer can order (docs/plans/portal-release-windows.md,
// Phase A tasks A4–A5): Orderable from stock hides the stock offer, releases
// lower the stock badge by what they still claim, portal_releases is scoped like
// portal_availability, and submit refuses every closed or oversold release.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, ins, sql, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type StaffCtx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Buyer = { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; roles: ["customer"]; customerId: string };
type Release = { id: string; sku_id: string };
let breweryId: string, adminCtx: StaffCtx, salesCtx: StaffCtx;
let warehouse: Awaited<ReturnType<typeof seedLocation>>;
let saleChannelId: string, shipToId: string, buyer: Buyer;

async function makeBuyer(customerId: string): Promise<Buyer> {
  const user = await makeCustomerUser(customerId);
  return { db: await asUser(user.email), userId: user.id, breweryId, roles: ["customer"], customerId };
}

/** A priced SKU with `onHand` units in the warehouse. */
async function pricedSku(name: string, onHand = 0) {
  const cat = await seedCatalog(breweryId, { product: name, sku: `${name} case` });
  await priceSku(breweryId, { saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 1000 });
  if (onHand) await ins("inventory_movements", { brewery_id: breweryId, sku_id: cat.skuId, location_id: warehouse.id, bin_id: warehouse.binId, qty: onHand, bbl: onHand * 0.0645, type: "production_in", created_by: adminCtx.userId });
  return cat;
}

async function planBatch(brandId: string) {
  const { data, error } = await admin.from("batches").insert({ brewery_id: breweryId, intended_brand_id: brandId, planned_on: "2030-01-02", planned_bbl: 10, created_by: adminCtx.userId }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function release(input: Record<string, unknown>) {
  return ((await runCommand("release_sku", input, salesCtx)) as { releases: Release[] }).releases[0];
}

async function badges(who: Buyer = buyer) {
  const rows = (await who.db.rpc("portal_availability", { p_customer: who.customerId })).data as { sku_id: string; badge: string }[];
  return new Map(rows.map((r) => [r.sku_id, r.badge]));
}

async function submit(lines: { skuId: string; qty: number; releaseId?: string }[], requestedShipDate: string | null = "2030-02-01", who: Buyer = buyer) {
  const quote = await runCommand("portal_quote_order", { shipToId, requestedShipDate, lines }, who) as { quoteId: string };
  return runCommand("portal_submit_quote", { quoteId: quote.quoteId }, who) as Promise<{ order_id: string }>;
}

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  [adminCtx, salesCtx] = await Promise.all([makeStaffCtx(breweryId, "admin"), makeStaffCtx(breweryId, "sales")]);
  warehouse = await seedLocation(breweryId);
  await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, adminCtx);
  const customer = await seedCustomer(breweryId);
  ({ saleChannelId, shipToId } = customer);
  buyer = await makeBuyer(customer.customerId);
});

describe("portal offers", () => {
  it("drops the stock offer of a SKU that is not orderable from stock, and the SKU with it", async () => {
    const hidden = await pricedSku("Hidden Helles", 40);
    expect((await badges()).get(hidden.skuId)).toBe("in");
    await runCommand("update_sku", { skuId: hidden.skuId, active: true, portalFromStock: false }, salesCtx);
    expect((await badges()).has(hidden.skuId)).toBe(false);
    const catalog = await runCommand("portal_catalog", {}, buyer) as { skuId: string }[];
    expect(catalog.some((i) => i.skuId === hidden.skuId)).toBe(false);
    // A release brings the SKU back, with only the release offer.
    const r = await release({ lines: [{ skuId: hidden.skuId, qty: 10 }] });
    const items = await runCommand("portal_catalog", {}, buyer) as { skuId: string; badge: string | null; releases: { releaseId: string }[] }[];
    expect(items.find((i) => i.skuId === hidden.skuId)).toMatchObject({ badge: null, releases: [{ releaseId: r.id }] });
  });

  it("keeps a stock quote line's shape: releaseId appears only on a release line", async () => {
    const sku = await pricedSku("Shape Shandy", 30);
    const r = await release({ lines: [{ skuId: sku.skuId, qty: 5 }] });
    const other = await pricedSku("Shape Stock", 30);
    const quote = await runCommand("portal_quote_order", { shipToId, requestedShipDate: "2030-02-01", lines: [{ skuId: other.skuId, qty: 1 }, { skuId: sku.skuId, qty: 1, releaseId: r.id }] }, buyer) as { lines: Record<string, unknown>[] };
    expect(quote.lines.find((l) => l.skuId === other.skuId)).not.toHaveProperty("releaseId");
    expect(quote.lines.find((l) => l.skuId === sku.skuId)).toMatchObject({ releaseId: r.id });
  });

  it("lowers the stock badge by what a stock release still claims", async () => {
    const sku = await pricedSku("Claimed Kolsch", 25);
    expect((await badges()).get(sku.skuId)).toBe("in");
    await release({ lines: [{ skuId: sku.skuId, qty: 10 }] });
    expect((await badges()).get(sku.skuId)).toBe("low");
  });

  it("lowers the stock badge by a packaged batch release's unconfirmed pre-orders", async () => {
    const sku = await pricedSku("Packaged Porter", 22);
    const batchId = await planBatch(sku.brandId);
    const r = await release({ batchId, shipsFrom: "2030-01-16", lines: [{ skuId: sku.skuId, qty: 30 }] });
    await submit([{ skuId: sku.skuId, qty: 3, releaseId: r.id }]);
    // Not packaged yet: the pre-order waits on beer that does not exist.
    expect((await badges()).get(sku.skuId)).toBe("in");
    await ins("packaging_runs", { brewery_id: breweryId, brand_id: sku.brandId, batch_id: batchId, planned_on: "2030-01-15", created_by: adminCtx.userId });
    expect((await badges()).get(sku.skuId)).toBe("low");
    // Packaging closes the release.
    const open = (await buyer.db.rpc("portal_releases", { p_customer: buyer.customerId })).data as { release_id: string }[];
    expect(open.some((o) => o.release_id === r.id)).toBe(false);
  });

  it("shows releases only to buyers whose channel prices the SKU, in the release's brewery", async () => {
    const sku = await pricedSku("Scoped Saison");
    const batchId = await planBatch(sku.brandId);
    const r = await release({ batchId, shipsFrom: "2030-01-16", lines: [{ skuId: sku.skuId, qty: 30 }] });
    const mine = (await buyer.db.rpc("portal_releases", { p_customer: buyer.customerId })).data as { release_id: string; sku_id: string; ships_from: string; badge: string }[];
    expect(mine.find((o) => o.release_id === r.id)).toMatchObject({ sku_id: sku.skuId, ships_from: "2030-01-16", badge: "in" });

    const { data: channel } = await admin.from("sale_channels").insert({ brewery_id: breweryId, name: `Other ${crypto.randomUUID().slice(0, 6)}` }).select("id").single();
    const unpriced = await makeBuyer((await seedCustomer(breweryId, { name: "Unpriced buyer", saleChannelId: channel!.id })).customerId);
    expect((await unpriced.db.rpc("portal_releases", { p_customer: unpriced.customerId })).data).toEqual([]);

    const elsewhere = (await makeBrewery()).id;
    const outsider = await makeBuyer((await seedCustomer(elsewhere)).customerId);
    expect((await outsider.db.rpc("portal_releases", { p_customer: outsider.customerId })).data).toEqual([]);
    // Another brewery's buyer cannot ask about this brewery's customer.
    expect((await outsider.db.rpc("portal_releases", { p_customer: buyer.customerId })).data).toEqual([]);
  });
});

describe("release delay per customer", () => {
  it("hides a release from a delayed customer and refuses their order until the delay passes", async () => {
    const sku = await pricedSku("Delayed Doppelbock");
    const batchId = await planBatch(sku.brandId);
    const r = await release({ batchId, shipsFrom: "2030-01-16", lines: [{ skuId: sku.skuId, qty: 30 }] });
    const delayed = await seedCustomer(breweryId, { name: "Delayed bar", saleChannelId });
    await runCommand("upsert_customer", { id: delayed.customerId, name: "Delayed bar", type: "retailer", country: "US", state: "PA", saleChannelId, releaseDelayDays: 3 }, salesCtx);
    const late = await makeBuyer(delayed.customerId);
    const seen = async (who: Buyer) => ((await who.db.rpc("portal_releases", { p_customer: who.customerId })).data as { release_id: string }[]).some((o) => o.release_id === r.id);
    const order = (who: Buyer, ship: string) => runCommand("portal_quote_order", { shipToId: ship, requestedShipDate: "2030-02-01", lines: [{ skuId: sku.skuId, qty: 1, releaseId: r.id }] }, who);

    expect(await seen(late)).toBe(false);
    await expect(order(late, delayed.shipToId)).rejects.toThrow(/not open to this account yet/);
    // A delay of 0 (the default) sees it at once.
    expect(await seen(buyer)).toBe(true);

    // Three days later the release opens to the delayed customer too.
    sql(`update public.releases set released_at = released_at - interval '3 days' where id = '${r.id}'`);
    expect(await seen(late)).toBe(true);
    await expect(order(late, delayed.shipToId)).resolves.toBeTruthy();
  });
});

describe("submitting against a release", () => {
  it("refuses a withdrawn release, a closed order-by date, and a packaged or cancelled batch", async () => {
    const sku = await pricedSku("Guarded Gose", 50);
    const withdrawn = await release({ lines: [{ skuId: sku.skuId, qty: 5 }] });
    await runCommand("withdraw_release", { releaseId: withdrawn.id }, salesCtx);
    await expect(submit([{ skuId: sku.skuId, qty: 1, releaseId: withdrawn.id }])).rejects.toThrow(/withdrawn/);

    const closed = await release({ ordersCloseOn: "2020-01-01", lines: [{ skuId: sku.skuId, qty: 5 }] });
    await expect(submit([{ skuId: sku.skuId, qty: 1, releaseId: closed.id }])).rejects.toThrow(/closed/);

    const packaged = await pricedSku("Packaged Pils");
    const packagedBatch = await planBatch(packaged.brandId);
    const p = await release({ batchId: packagedBatch, shipsFrom: "2030-01-16", lines: [{ skuId: packaged.skuId, qty: 5 }] });
    await ins("packaging_runs", { brewery_id: breweryId, brand_id: packaged.brandId, batch_id: packagedBatch, planned_on: "2030-01-15", created_by: adminCtx.userId });
    await expect(submit([{ skuId: packaged.skuId, qty: 1, releaseId: p.id }])).rejects.toThrow(/packaged/);

    const cancelled = await pricedSku("Cancelled Cream");
    const cancelledBatch = await planBatch(cancelled.brandId);
    const c = await release({ batchId: cancelledBatch, shipsFrom: "2030-01-16", lines: [{ skuId: cancelled.skuId, qty: 5 }] });
    await admin.from("batches").update({ cancelled_at: new Date().toISOString() }).eq("id", cancelledBatch);
    await expect(submit([{ skuId: cancelled.skuId, qty: 1, releaseId: c.id }])).rejects.toThrow(/cancelled/);
  });

  it("refuses a line above what remains, a date before ships-from, and a stock line the SKU does not offer", async () => {
    const sku = await pricedSku("Limited Lambic");
    const batchId = await planBatch(sku.brandId);
    const r = await release({ batchId, shipsFrom: "2030-01-16", lines: [{ skuId: sku.skuId, qty: 4 }] });
    await expect(submit([{ skuId: sku.skuId, qty: 5, releaseId: r.id }])).rejects.toThrow(/left/);
    await expect(submit([{ skuId: sku.skuId, qty: 1, releaseId: r.id }], "2030-01-10")).rejects.toThrow(/ships from/);
    await expect(submit([{ skuId: sku.skuId, qty: 1, releaseId: r.id }], null)).rejects.toThrow(/ships from/);

    const hidden = await pricedSku("Stockless Stout", 10);
    await runCommand("update_sku", { skuId: hidden.skuId, active: true, portalFromStock: false }, salesCtx);
    await expect(submit([{ skuId: hidden.skuId, qty: 1 }])).rejects.toThrow(/not orderable from stock/);
    // The draft path checks the same rules when the buyer submits it.
    const draft = await runCommand("portal_create_order", { shipToId, lines: [{ skuId: hidden.skuId, qty: 1 }] }, buyer) as { order_id: string };
    await expect(runCommand("portal_submit_order", { orderId: draft.order_id }, buyer)).rejects.toThrow(/not orderable from stock/);
  });

  it("cannot oversell a release with concurrent submits", async () => {
    const sku = await pricedSku("Race Rauchbier");
    const batchId = await planBatch(sku.brandId);
    const r = await release({ batchId, shipsFrom: "2030-01-16", lines: [{ skuId: sku.skuId, qty: 10 }] });
    const second = await makeBuyer(buyer.customerId);
    const quotes = await Promise.all([buyer, second].map((who) =>
      runCommand("portal_quote_order", { shipToId, requestedShipDate: "2030-02-01", lines: [{ skuId: sku.skuId, qty: 6, releaseId: r.id }] }, who) as Promise<{ quoteId: string }>));
    const results = await Promise.allSettled([buyer, second].map((who, i) => runCommand("portal_submit_quote", { quoteId: quotes[i].quoteId }, who)));
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((x) => x.status === "rejected")).toHaveLength(1);
    const ordered = (await admin.from("order_lines").select("qty_ordered").eq("release_id", r.id)).data!;
    expect(ordered.reduce((n, l) => n + Number(l.qty_ordered), 0)).toBe(6);
  });
});
