import { assert } from "vitest";
import { beforeAll, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, seedPriceGroup } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import { skuUpdateCommand, toSkuViewProps } from "../lib/mgr/sku-view";
import { toSkuListViewProps } from "../lib/mgr/sku-list-view";
import "../lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id, "sales"); });
it("edits a prefilled brand without losing unrelated persisted fields", async () => {
  // Brand is a page: brand-page.tsx prefills every field from the list_brands row.
  const source = readFileSync("app/(app)/catalog/brands/[id]/brand-page.tsx", "utf8");
  for (const field of ["id", "name", "styles?.name", "abv", "description", "category", "price_group_id", "hops"]) expect(source).toContain(`brand?.${field}`);
  const input = { name: "Original", style: "Lager", abv: 0, description: "Crisp", category: "Lager", hops: "Saaz", priceGroupId: await seedPriceGroup(ctx.breweryId) };
  const row = await runCommand("upsert_brand", input, ctx) as { id: string; style_id: string };
  const edited = await runCommand("upsert_brand", { ...input, id: row.id, name: "Renamed" }, ctx);
  expect(edited).toMatchObject({ ...row, name: "Renamed" });
});
it("edits SKU facts with replay, conflict and duplicate UPC protection while preserving identity and history", async () => {
  const cat = await seedCatalog(ctx.breweryId, { product: "Editable", sku: "Editable" });
  const loc = await seedLocation(ctx.breweryId);
  const customer = await seedCustomer(ctx.breweryId);
  await priceSku(ctx.breweryId, { ...cat, saleChannelId: customer.saleChannelId, cents: 100 });
  const actor = await makeCustomerUser(customer.customerId);
  const buyer = { db: await asUser(actor.email), userId: actor.id, breweryId: ctx.breweryId, customerId: customer.customerId, roles: ["customer" as const] };
  const orderInput = { kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: loc.id, lines: [{ skuId: cat.skuId, qty: 1 }] };
  const order = await runCommand("create_order", orderInput, ctx) as { order_id: string };
  const beforeLines = await admin.from("order_lines").select().eq("order_id", order.order_id);
  const movement = await runCommand("record_movement", { skuId: cat.skuId, locationId: loc.id, binId: loc.binId, type: "opening_balance", qty: 10 }, await makeStaffCtx(ctx.breweryId));
  expect((await admin.from("skus").update({ qbo_item_id: "provider-identity" }).eq("id", cat.skuId)).error).toBeNull();
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const input = { skuId: cat.skuId, active: false, upc: " 012345678905 " };
  const saved = await runCommand("update_sku", input, ctx, execution);
  expect(saved).toMatchObject({ id: cat.skuId, brand_id: cat.brandId, format_id: cat.formatId, active: false, upc: "012345678905", qbo_item_id: "provider-identity" });
  expect(await runCommand("update_sku", input, ctx, execution)).toEqual(saved);
  await expect(runCommand("update_sku", { ...input, active: true }, ctx, execution)).rejects.toThrow(/different payload/);
  expect(await runCommand("portal_catalog", {}, buyer)).toEqual([]);
  await expect(runCommand("create_order", orderInput, ctx)).rejects.toThrow(/not active and priced/);
  await expect(runCommand("portal_create_order", { shipToId: customer.shipToId, lines: orderInput.lines }, buyer)).rejects.toThrow(/not active and priced/);
  expect((await admin.from("order_lines").select().eq("order_id", order.order_id)).data).toEqual(beforeLines.data);
  expect((await admin.from("inventory_movements").select().eq("sku_id", cat.skuId)).data).toEqual([movement]);
  const other = await seedCatalog(ctx.breweryId, { product: "Other editable", sku: "Other editable" });
  await expect(runCommand("update_sku", { skuId: other.skuId, active: true, upc: "012345678905" }, ctx)).rejects.toThrow(/UPC.*another SKU/);
  expect(await runCommand("update_sku", { skuId: cat.skuId, active: true, upc: " " }, await makeStaffCtx(ctx.breweryId))).toMatchObject({ upc: null, active: true });
  expect(await runCommand("portal_catalog", {}, buyer)).toMatchObject([{ skuId: cat.skuId }]);
  expect((await ctx.db.rpc("update_sku", { p_brewery: ctx.breweryId, p_id: cat.skuId, p_active: null, p_upc: "invalid", p_request_id: crypto.randomUUID() })).error?.message).toMatch(/active is required/);
  expect((await admin.from("skus").select("upc, active").eq("id", other.skuId).single()).data).toEqual({ upc: null, active: true });
  // An old replay returns its original response without restoring inactive state.
  expect(await runCommand("update_sku", input, ctx, execution)).toEqual(saved);
  expect((await admin.from("skus").select("active").eq("id", cat.skuId).single()).data?.active).toBe(true);
  for (const role of ["warehouse", "brewer"] as const) {
    const denied = await makeStaffCtx(ctx.breweryId, role);
    await expect(runCommand("update_sku", input, denied)).rejects.toMatchObject({ code: "permission_denied" });
    expect((await denied.db.rpc("update_sku", { p_brewery: ctx.breweryId, p_id: cat.skuId, p_active: false, p_upc: null, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  }
  await expect(runCommand("update_sku", input, buyer)).rejects.toMatchObject({ code: "permission_denied" });
  expect((await buyer.db.rpc("update_sku", { p_brewery: ctx.breweryId, p_id: cat.skuId, p_active: false, p_upc: null, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  const foreign = await makeStaffCtx((await makeBrewery()).id);
  await expect(runCommand("update_sku", input, foreign)).rejects.toThrow(/not found/);
  expect((await foreign.db.rpc("update_sku", { p_brewery: ctx.breweryId, p_id: cat.skuId, p_active: false, p_upc: null, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
});
it("normalizes UPC on creation too, so whitespace cannot evade SKU barcode uniqueness", async () => {
  const brand = await runCommand("upsert_brand", { name: "Barcode creation" }, ctx) as { id: string };
  const format = await runCommand("upsert_format", { name: "Barcode format", basis: "packaged", bblPerUnit: 0.5 }, ctx) as { id: string };
  const saved = await runCommand("create_sku", { brandId: brand.id, formatId: format.id, upc: "  40063813  " }, ctx);
  expect(saved).toMatchObject({ upc: "40063813" });
  const second = await runCommand("upsert_brand", { name: "Barcode second" }, ctx) as { id: string };
  await expect(runCommand("create_sku", { brandId: second.id, formatId: format.id, upc: "40063813" }, ctx)).rejects.toThrow();
  const rawDuplicate = await ctx.db.rpc("create_sku", { p_brewery: ctx.breweryId, p_brand: second.id, p_format: format.id, p_name: null, p_upc: " 40063813 ", p_request_id: crypto.randomUUID() });
  expect(rawDuplicate.error?.code).toBe("23505");
  // ECMAScript trim whitespace, including Unicode separators and BOM, must
  // normalize identically when the registered command is bypassed.
  const whitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
  const duplicate = await ctx.db.rpc("create_sku", { p_brewery: ctx.breweryId, p_brand: second.id, p_format: format.id, p_name: null, p_upc: `${whitespace}40063813${whitespace}`, p_request_id: crypto.randomUUID() });
  expect(duplicate.error?.code).toBe("23505");
  const blank = await ctx.db.rpc("create_sku", { p_brewery: ctx.breweryId, p_brand: second.id, p_format: format.id, p_name: null, p_upc: whitespace, p_request_id: crypto.randomUUID() });
  expect(blank.error).toBeNull();
  assert(blank.data !== null);
  expect(blank.data.upc).toBeNull();
  for (const edge of whitespace) {
    assert(blank.data !== null);
    const update = await ctx.db.rpc("update_sku", { p_brewery: ctx.breweryId, p_id: blank.data.id, p_active: true, p_upc: `${edge}40063813${edge}`, p_request_id: crypto.randomUUID() });
    expect(update.error?.message).toMatch(/UPC.*another SKU/);
  }
  const cleared = await ctx.db.rpc("update_sku", { p_brewery: ctx.breweryId, p_id: blank.data.id, p_active: true, p_upc: whitespace, p_request_id: crypto.randomUUID() });
  expect(cleared.error).toBeNull();
  assert(cleared.data !== null);
  expect(cleared.data.upc).toBeNull();

});
it("gates catalog mutators and excludes inactive SKUs from New Order picker options", () => {
  const page = readFileSync("app/(app)/catalog/page.tsx", "utf8");
  for (const component of ["FormatForm"]) expect(page).toMatch(new RegExp(`canWrite[^\\n]*<${component}`));
  // New brand is a link to the Brand page; the brand row itself opens it, so
  // there is no Edit brand button to gate.
  expect(page).toMatch(/canWrite[^\n]*E\.btn\("New brand"/);
  expect(page).not.toMatch(/Edit brand/);
  // A brand's packages are switched on under Sells as; its SKU list page keeps
  // the edit sheets. main214-page-assembly renders that page per role and proves the gating.
  const skuList = readFileSync("app/(app)/catalog/brands/[id]/skus/page.tsx", "utf8");
  expect(skuList).not.toContain("<SkuForm");
  expect(skuList).toContain("rowAction={canWrite ?");
  expect(skuList).toContain("<PourForm");
  expect(page).not.toContain("<PourForm");
  // The cached client adapter builds the picker options; cached-order-pages
  // additionally executes that adapter with active and inactive SKU payloads.
  expect(readFileSync("app/(app)/orders/new/new-order-client.tsx", "utf8")).toContain("skus.data.filter(sku => sku.active)");
});

it("edits Orderable from stock on the SKU sheet and names a SKU kept off portal stock in the list", () => {
  const sku = { id: "s1", name: "Stout · case", upc: null, active: true, format_id: "f1", batch_share: null, portal_from_stock: false, formats: { name: "case" } };
  expect(toSkuViewProps({ sku, formats: [] }).portalFromStock).toBe(false);
  expect(toSkuViewProps({ sku: { ...sku, portal_from_stock: undefined }, formats: [] }).portalFromStock).toBe(true);
  expect(skuUpdateCommand({ skuId: "s1", active: true, upc: "", batchSharePercent: "", portalFromStock: false }).input).toMatchObject({ portalFromStock: false });
  const list = toSkuListViewProps({ brand: { id: "b1", name: "Stout" }, skus: [{ ...sku, formats: { name: "case", bbl_per_unit: 0.0645 } }] });
  expect(list.rows[0].detail).toMatch(/not orderable from stock on the portal/);
  expect(toSkuListViewProps({ brand: { id: "b1", name: "Stout" }, skus: [{ ...sku, portal_from_stock: true, formats: { name: "case", bbl_per_unit: 0.0645 } }] }).rows[0].detail).not.toMatch(/portal/);
});

it("lists a SKU's open releases under it, each its own row", () => {
  const sku = { id: "s1", name: "Stout · case", active: true, format_id: "f1", portal_from_stock: true, formats: { name: "case", bbl_per_unit: 0.0645 } };
  const open = { id: "r1", batch_id: null, batch_no: null, sku_id: "s1", sku_name: "Stout · case", qty: 10, ships_from: "2026-11-18", orders_close_on: null, withdrawn_at: null, ready_on: null, open: true, confirmed: 2, preordered: 1, remaining: 7 };
  const list = toSkuListViewProps({ brand: { id: "b1", name: "Stout" }, skus: [sku], releases: [open, { ...open, id: "r2", open: false, withdrawn_at: "2026-11-19T00:00:00Z" }] });
  expect(list.rows.map((r) => [r.key, r.kind, r.title])).toEqual([["s1", undefined, "case"], ["release:r1", "release", "Release · Packaged stock"]]);
  expect(list.rows[1].detail).toBe("7 of 10 left · 2 confirmed · 1 pre-ordered · ships Nov 18, 2026");
});
