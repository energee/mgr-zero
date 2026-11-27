// tests/release-pool.test.ts — batch release pools, customer ceilings, calculated
// shares and suggested orders (docs/plans/release-pool-and-ceilings.md): every
// package of a batch draws one pool in barrels, a customer's barrels on a batch
// stay within their ceiling until it lifts, a calculated share counts stock
// purchases for more, and a suggestion is the customer's usual quantity.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, ins, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, sql } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type StaffCtx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Buyer = { db: Awaited<ReturnType<typeof asUser>>; userId: string; breweryId: string; roles: ["customer"]; customerId: string; shipToId: string };
type Release = { id: string; sku_id: string };
type Row = { id: string; qty: number | null; remaining: number; pool_bbl: number | null; pool_left_bbl: number | null };
type Offer = { release_id: string; limit_left_bbl: number | null; limit_lifts_on: string | null };
let breweryId: string, adminCtx: StaffCtx, salesCtx: StaffCtx, saleChannelId: string, buyer: Buyer;

const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

async function makeBuyer(name: string): Promise<Buyer> {
  const customer = await seedCustomer(breweryId, { name });
  const user = await makeCustomerUser(customer.customerId);
  return { db: await asUser(user.email), userId: user.id, breweryId, roles: ["customer"], customerId: customer.customerId, shipToId: customer.shipToId };
}

/** A brand with a 0.5 bbl keg and a 0.1 bbl case, both priced, and a 10 bbl planned batch. */
async function beer(name: string, styleId?: string) {
  const keg = await seedCatalog(breweryId, { product: name, sku: `${name} keg`, packageType: "keg", bblPerUnit: 0.5, format: "Pool keg" });
  const caseFormat: { id: string } = (await admin.from("formats").select("id").eq("brewery_id", breweryId).eq("name", "Pool case").maybeSingle()).data
    ?? await ins("formats", { brewery_id: breweryId, name: "Pool case", basis: "packaged", package_type: "can", bbl_per_unit: 0.1 });
  const caseSku = await ins("skus", { brewery_id: breweryId, brand_id: keg.brandId, format_id: caseFormat.id, name: `${name} case` });
  await priceSku(breweryId, { saleChannelId, brandId: keg.brandId, formatId: keg.formatId, cents: 10000 });
  await priceSku(breweryId, { saleChannelId, brandId: keg.brandId, formatId: caseFormat.id, cents: 2000 });
  if (styleId) await admin.from("brands").update({ style_id: styleId }).eq("id", keg.brandId);
  const batch = await ins("batches", { brewery_id: breweryId, intended_brand_id: keg.brandId, planned_on: "2030-01-02", planned_bbl: 10, created_by: adminCtx.userId });
  return { brandId: keg.brandId, kegId: keg.skuId, caseId: caseSku.id, batchId: batch.id };
}

/** Releases both packages of a beer from its batch, sharing a pool of `wholesaleBbl`. */
async function releasePool(b: Awaited<ReturnType<typeof beer>>, wholesaleBbl: number, shipsFrom = "2030-01-16") {
  const made = (await runCommand("release_sku", { batchId: b.batchId, wholesaleBbl, shipsFrom, lines: [{ skuId: b.kegId }, { skuId: b.caseId }] }, salesCtx)) as { releases: Release[] };
  return { keg: made.releases.find((r) => r.sku_id === b.kegId)!.id, case: made.releases.find((r) => r.sku_id === b.caseId)!.id };
}

const rows = async (batchId: string) => new Map((await runCommand("list_releases", { batchIds: [batchId] }, salesCtx) as Row[]).map((r) => [r.id, r]));

async function submit(who: Buyer, lines: { skuId: string; qty: number; releaseId?: string }[], requestedShipDate = "2030-02-01") {
  const quote = await runCommand("portal_quote_order", { shipToId: who.shipToId, requestedShipDate, lines }, who) as { quoteId: string };
  return runCommand("portal_submit_quote", { quoteId: quote.quoteId }, who) as Promise<{ order_id: string }>;
}

const offers = async (who: Buyer) => (await who.db.rpc("portal_releases", { p_customer: who.customerId })).data as Offer[];

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  [adminCtx, salesCtx] = await Promise.all([makeStaffCtx(breweryId, "admin"), makeStaffCtx(breweryId, "sales")]);
  const warehouse = await seedLocation(breweryId);
  await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, adminCtx);
  buyer = await makeBuyer("Pool buyer");
  ({ saleChannelId } = await seedCustomer(breweryId, { name: "Channel holder" }));
});

describe("batch release pool", () => {
  it("lets every package of a batch draw one pool in barrels", async () => {
    const b = await beer("Pool Pils");
    const r = await releasePool(b, 6);
    let state = await rows(b.batchId);
    // 6 bbl is 12 kegs or 60 cases; neither package has a limit of its own.
    expect(state.get(r.keg)).toMatchObject({ qty: null, remaining: 12, pool_bbl: 6, pool_left_bbl: 6 });
    expect(state.get(r.case)).toMatchObject({ qty: null, remaining: 60 });
    await submit(buyer, [{ skuId: b.kegId, qty: 4, releaseId: r.keg }]);
    state = await rows(b.batchId);
    // Four kegs took 2 bbl from both packages' remaining.
    expect(state.get(r.keg)).toMatchObject({ remaining: 8, pool_left_bbl: 4 });
    expect(state.get(r.case)).toMatchObject({ remaining: 40 });
  });

  it("refuses an order whose lines together take the batch past its pool", async () => {
    const b = await beer("Pool Porter");
    const r = await releasePool(b, 4);
    // 5 kegs (2.5 bbl) and 20 cases (2 bbl) each fit alone; together they are 4.5 bbl.
    await expect(submit(buyer, [{ skuId: b.kegId, qty: 5, releaseId: r.keg }, { skuId: b.caseId, qty: 20, releaseId: r.case }])).rejects.toThrow(/Only 4 bbl of Pool Porter/);
    await expect(submit(buyer, [{ skuId: b.kegId, qty: 4, releaseId: r.keg }, { skuId: b.caseId, qty: 20, releaseId: r.case }])).resolves.toMatchObject({ order_id: expect.any(String) });
  });

  it("keeps the pool within the planned batch, and lets staff change it and limit one package", async () => {
    const b = await beer("Pool Stout");
    await expect(releasePool(b, 11)).rejects.toThrow(/planned/i);
    const r = await releasePool(b, 6);
    await runCommand("update_release", { releaseId: r.keg, qty: 4, ordersCloseOn: null, wholesaleBbl: 8 }, salesCtx);
    const state = await rows(b.batchId);
    // The keg is limited to 4; the case follows the larger pool.
    expect(state.get(r.keg)).toMatchObject({ qty: 4, remaining: 4, pool_bbl: 8 });
    expect(state.get(r.case)).toMatchObject({ remaining: 80 });
    await expect(runCommand("update_release", { releaseId: r.keg, qty: null, ordersCloseOn: null, wholesaleBbl: 12 }, salesCtx)).rejects.toThrow(/planned/i);
  });

  it("refuses a package with no size, which could not draw from the pool", async () => {
    const b = await beer("Pool Sizeless");
    const sizeless = await ins("formats", { brewery_id: breweryId, name: `Sizeless ${crypto.randomUUID().slice(0, 4)}`, basis: "packaged", package_type: "can" });
    const sku = await ins("skus", { brewery_id: breweryId, brand_id: b.brandId, format_id: sizeless.id, name: "Pool Sizeless mystery" });
    await expect(runCommand("release_sku", { batchId: b.batchId, wholesaleBbl: 6, lines: [{ skuId: sku.id }] }, salesCtx)).rejects.toThrow(/no barrels per unit/);
  });

  it("still needs a quantity to release packaged stock", async () => {
    const b = await beer("Pool Stock");
    await expect(runCommand("release_sku", { lines: [{ skuId: b.kegId }] }, salesCtx)).rejects.toThrow(/whole units/);
  });
});

describe("customer ceiling", () => {
  it("holds a customer to their share of the pool until the ceiling lifts", async () => {
    const capped = await makeBuyer("Capped buyer");
    await admin.from("customers").update({ release_share_pct: 25 }).eq("id", capped.customerId);
    const b = await beer("Ceiling Saison");
    const r = await releasePool(b, 6);
    // 25% of 6 bbl is 1.5 bbl: three kegs, not four.
    expect((await offers(capped)).find((o) => o.release_id === r.keg)).toMatchObject({ limit_left_bbl: 1.5, limit_lifts_on: "2030-01-02" });
    await expect(submit(capped, [{ skuId: b.kegId, qty: 4, releaseId: r.keg }])).rejects.toThrow(/limit on Ceiling Saison is 1.5 bbl/);
    await submit(capped, [{ skuId: b.kegId, qty: 3, releaseId: r.keg }]);
    expect((await offers(capped)).find((o) => o.release_id === r.case)).toMatchObject({ limit_left_bbl: 0 });
    await expect(submit(capped, [{ skuId: b.caseId, qty: 1, releaseId: r.case }])).rejects.toThrow(/limit on Ceiling Saison/);
    // A customer with no share is held only by the pool.
    await expect(submit(buyer, [{ skuId: b.kegId, qty: 4, releaseId: r.keg }])).resolves.toMatchObject({ order_id: expect.any(String) });
  });

  it("lifts the ceiling the set number of days before ship", async () => {
    const capped = await makeBuyer("Lifted buyer");
    await admin.from("customers").update({ release_share_pct: 25 }).eq("id", capped.customerId);
    const b = await beer("Lifted Lager");
    // Ships in 10 days: inside the default 14-day window, so no ceiling applies.
    const r = await releasePool(b, 6, day(10));
    expect((await offers(capped)).find((o) => o.release_id === r.keg)).toMatchObject({ limit_left_bbl: null, limit_lifts_on: null });
    await expect(submit(capped, [{ skuId: b.kegId, qty: 4, releaseId: r.keg }], day(10))).resolves.toMatchObject({ order_id: expect.any(String) });
  });
});

describe("ceiling on a batch released for two ship dates", () => {
  it("lifts each release on its own ship date, so an earlier one cannot lift a later one's ceiling", async () => {
    const capped = await makeBuyer("Two-date buyer");
    await admin.from("customers").update({ release_share_pct: 25 }).eq("id", capped.customerId);
    const b = await beer("Two Date Tripel");
    const release = async (skuId: string, shipsFrom: string) =>
      ((await runCommand("release_sku", { batchId: b.batchId, wholesaleBbl: 6, shipsFrom, lines: [{ skuId }] }, salesCtx)) as { releases: Release[] }).releases.find((r) => r.sku_id === skuId)!.id;
    const [keg, cases] = [await release(b.kegId, "2030-01-16"), await release(b.caseId, day(10))];
    // The cases ship inside the 14-day window, so they are open; one of them on the order must not open the kegs.
    await expect(submit(capped, [{ skuId: b.kegId, qty: 4, releaseId: keg }, { skuId: b.caseId, qty: 1, releaseId: cases }])).rejects.toThrow(/limit on Two Date Tripel is 1.5 bbl/);
    await expect(submit(capped, [{ skuId: b.caseId, qty: 5, releaseId: cases }])).resolves.toMatchObject({ order_id: expect.any(String) });
  });
});

describe("calculated share", () => {
  it("is each customer's part of recent purchases, counting stock barrels for more, up to the maximum", async () => {
    const other = (await makeBrewery()).id;
    const [admin2, sales2] = await Promise.all([makeStaffCtx(other, "admin"), makeStaffCtx(other, "sales")]);
    const hold = { breweryId, adminCtx, salesCtx, saleChannelId };
    // A brewery of its own, so the suite's other orders do not enter the shares.
    breweryId = other; adminCtx = admin2; salesCtx = sales2;
    try {
      const warehouse = await seedLocation(other);
      await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, admin2);
      const early = await makeBuyer("Pre-order buyer");
      const clearer = await makeBuyer("Stock buyer");
      const quiet = await makeBuyer("New buyer");
      ({ saleChannelId } = await seedCustomer(other, { name: "Channel holder" }));
      const b = await beer("Share Bock");
      const r = await releasePool(b, 6);
      const share = async () => new Map((await runCommand("list_release_shares", {}, sales2) as { customer_id: string; pct: number | null; base_pct: number | null }[]).map((s) => [s.customer_id, s]));
      // Off until a history window is set.
      expect((await share()).get(early.customerId)).toMatchObject({ pct: null });
      await runCommand("set_release_defaults", { openPct: 75, orderByDays: 7, capLiftDays: 14, shareWindowDays: 90, stockMultiplier: 2, maxSharePct: 60, digestDay: null }, admin2);
      // Two barrels each: one as a pre-order, one from stock.
      const preOrder = await submit(early, [{ skuId: b.kegId, qty: 4, releaseId: r.keg }]);
      const fromStock = await submit(clearer, [{ skuId: b.kegId, qty: 4 }]);
      for (const order of [preOrder, fromStock]) await runCommand("confirm_order", { orderId: order.order_id }, sales2);
      const shares = await share();
      // Weighted 2 against 4: a third and two thirds, the larger held to the 60% maximum.
      // (A share is never calculated below 5%, so a small buyer can still order.)
      expect(shares.get(early.customerId)).toMatchObject({ pct: 33.3, base_pct: 50 });
      expect(shares.get(clearer.customerId)).toMatchObject({ pct: 60, base_pct: 50 });
      // No purchases in the window: no calculated ceiling.
      expect(shares.get(quiet.customerId)).toMatchObject({ pct: null });
      // A typed share wins.
      await admin.from("customers").update({ release_share_pct: 10 }).eq("id", clearer.customerId);
      expect((await share()).get(clearer.customerId)).toMatchObject({ pct: 10 });
    } finally { ({ breweryId, adminCtx, salesCtx, saleChannelId } = hold); }
  });
});

describe("suggested order size", () => {
  it("suggests the usual quantity of each beer, however many ship on one date", async () => {
    const regular = await makeBuyer("Order-size buyer");
    const style = await ins("styles", { brewery_id: breweryId, name: `Sized ${crypto.randomUUID().slice(0, 6)}` });
    // Two earlier orders, each four kegs of one beer.
    for (let n = 0; n < 2; n++) {
      const past = await beer(`Sized past ${crypto.randomUUID().slice(0, 4)}`, style.id);
      await submit(regular, [{ skuId: past.kegId, qty: 4, releaseId: (await releasePool(past, 6)).keg }]);
    }
    // Two beers ship on one date, and a third on a later one.
    const [first, second, later] = [await beer("Sized Amber", style.id), await beer("Sized Brown", style.id), await beer("Sized Later", style.id)];
    const [a, b2, c] = [await releasePool(first, 6, "2030-03-06"), await releasePool(second, 6, "2030-03-06"), await releasePool(later, 6, "2030-03-13")];
    const suggested = new Map((await runCommand("portal_suggested_order", {}, regular) as { releaseId: string; qty: number }[]).map((s) => [s.releaseId, s.qty]));
    // Past order sizes are not trusted (imports merge weeks), so a date is not scaled to one: every beer gets the usual four.
    expect([suggested.get(a.keg), suggested.get(b2.keg), suggested.get(c.keg)]).toEqual([4, 4, 4]);
  });
});

describe("suggested order without matching history", () => {
  it("falls back to the package for a new style, and ignores orders older than 180 days", async () => {
    const regular = await makeBuyer("Fallback buyer");
    const known = await ins("styles", { brewery_id: breweryId, name: `Known ${crypto.randomUUID().slice(0, 6)}` });
    const fresh = await ins("styles", { brewery_id: breweryId, name: `Fresh ${crypto.randomUUID().slice(0, 6)}` });
    const past = await beer(`Known keg ${crypto.randomUUID().slice(0, 4)}`, known.id);
    const order = await submit(regular, [{ skuId: past.kegId, qty: 4, releaseId: (await releasePool(past, 6)).keg }]);
    const next = await beer("Fresh Farmhouse", fresh.id);
    const r = await releasePool(next, 6);
    const suggest = async () => (await runCommand("portal_suggested_order", {}, regular) as { releaseId: string; qty: number }[]).filter((s) => s.releaseId === r.keg || s.releaseId === r.case);
    // Never ordered this style: the usual keg order stands in. Never ordered a case: none suggested.
    expect(await suggest()).toMatchObject([{ releaseId: r.keg, qty: 4 }]);
    // The only order is now seven months old: nothing to go on.
    sql(`update public.orders set created_at = now() - interval '200 days' where id = '${order.order_id}'`, true);
    expect(await suggest()).toEqual([]);
  });
});

describe("weekly digest", () => {
  it("lists a customer's open pre-orders once per portal user on the brewery's digest day, and queues one digest a week", async () => {
    const other = (await makeBrewery()).id;
    const [admin2, sales2] = await Promise.all([makeStaffCtx(other, "admin"), makeStaffCtx(other, "sales")]);
    const hold = { breweryId, adminCtx, salesCtx, saleChannelId };
    breweryId = other; adminCtx = admin2; salesCtx = sales2;
    try {
      const reader = await makeBuyer("Digest buyer");
      ({ saleChannelId } = await seedCustomer(other, { name: "Channel holder" }));
      const b = await beer("Digest Dunkel");
      const r = await releasePool(b, 6);
      const mine = async () => ((await admin.rpc("release_digest_rows")).data ?? []).filter((row) => row.brewery_id === other);
      // No digest day: nothing.
      expect(await mine()).toEqual([]);
      const timeZone = (await admin.from("breweries").select("timezone").eq("id", other).single()).data!.timezone;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
      const digestDay = new Date(`${today}T12:00:00Z`).getUTCDay();
      await runCommand("set_release_defaults", { openPct: 75, orderByDays: 7, capLiftDays: 14, shareWindowDays: null, stockMultiplier: 2, maxSharePct: 50, digestDay }, admin2);
      const rows = await mine();
      expect(rows.map((row) => [row.customer_id, row.user_id, row.brand, row.release_id].join())).toEqual(expect.arrayContaining([
        [reader.customerId, reader.userId, "Digest Dunkel", r.keg].join(), [reader.customerId, reader.userId, "Digest Dunkel", r.case].join(),
      ]));
      // The key is the Monday of the week, so a changed digest day cannot send a second digest that week.
      const monday = new Date(Date.parse(`${today}T12:00:00Z`) - ((digestDay + 6) % 7) * 864e5).toISOString().slice(0, 10);
      expect(rows[0]).toMatchObject({ digest_week: monday, today, new_this_week: true, ships_from: "2030-01-16" });
      // A customer who sees releases a week late still reads one as new the week it opens to them.
      sql(`update public.releases set released_at = now() - interval '8 days' where id in ('${r.keg}', '${r.case}')`, true);
      expect((await mine())[0]).toMatchObject({ new_this_week: false });
      await admin.from("customers").update({ release_delay_days: 7 }).eq("id", reader.customerId);
      expect((await mine())[0]).toMatchObject({ new_this_week: true });
      // The day after the digest day makes up a missed run, under the digest day's own week.
      const yesterdayDow = (digestDay + 6) % 7;
      await runCommand("set_release_defaults", { openPct: 75, orderByDays: 7, capLiftDays: 14, shareWindowDays: null, stockMultiplier: 2, maxSharePct: 50, digestDay: yesterdayDow }, admin2);
      const yesterdaysMonday = new Date(Date.parse(`${today}T12:00:00Z`) - (1 + (yesterdayDow + 6) % 7) * 864e5).toISOString().slice(0, 10);
      expect((await mine())[0]).toMatchObject({ digest_week: yesterdaysMonday, today });
      // Another weekday: nothing again.
      await runCommand("set_release_defaults", { openPct: 75, orderByDays: 7, capLiftDays: 14, shareWindowDays: null, stockMultiplier: 2, maxSharePct: 50, digestDay: (digestDay + 1) % 7 }, admin2);
      expect(await mine()).toEqual([]);
      const queue = () => admin.rpc("queue_release_digest", { p_brewery: other, p_customer: reader.customerId, p_user: reader.userId, p_week: monday, p_subject: "Pre-orders", p_text: "Body" });
      expect((await queue()).data).toBe(true);
      // The same user and week again is ignored, so the job can run twice.
      expect((await queue()).data).toBe(false);
      // A buyer cannot read the rows or queue mail.
      expect((await reader.db.rpc("release_digest_rows")).error).not.toBeNull();
    } finally { ({ breweryId, adminCtx, salesCtx, saleChannelId } = hold); }
  });
});

describe("suggested order", () => {
  it("follows recent orders: the latest counts most, less what is already ordered, within what is left", async () => {
    const regular = await makeBuyer("Regular buyer");
    const style = await ins("styles", { brewery_id: breweryId, name: `Suggest ${crypto.randomUUID().slice(0, 6)}` });
    // Three earlier keg orders of the style, oldest first: 2, 4 and 6.
    for (const qty of [2, 4, 6]) {
      const past = await beer(`Past ${qty} ${crypto.randomUUID().slice(0, 4)}`, style.id);
      const r = await releasePool(past, 6);
      await submit(regular, [{ skuId: past.kegId, qty, releaseId: r.keg }]);
    }
    const next = await beer("Suggested Sour", style.id);
    const r = await releasePool(next, 6);
    const suggest = async () => await runCommand("portal_suggested_order", {}, regular) as { releaseId: string; skuId: string; qty: number; lastOn: string }[];
    // (6 + 4/2 + 2/4) / (1 + 1/2 + 1/4) = 4.86: five, not the plain average of four. No case history, so no case suggestion.
    expect((await suggest()).filter((s) => s.releaseId === r.keg || s.releaseId === r.case)).toMatchObject([{ releaseId: r.keg, skuId: next.kegId, qty: 5, lastOn: day(0) }]);
    await submit(regular, [{ skuId: next.kegId, qty: 3, releaseId: r.keg }]);
    // Three of the five are ordered.
    expect((await suggest()).find((s) => s.releaseId === r.keg)).toMatchObject({ qty: 2 });
    // Another buyer takes the rest of the pool (9 kegs): nothing is left to suggest.
    await submit(buyer, [{ skuId: next.kegId, qty: 9, releaseId: r.keg }]);
    expect((await suggest()).some((s) => s.releaseId === r.keg)).toBe(false);
  });
});
