// tests/format-pallet-fit.test.ts — formats.pallet_fit: how many of a package
// fill one layer or pallet the way the brewery loads. Only Admin sets it
// (upsert_format refuses other roles for this field; other fields keep their
// roles); omitted keeps it, null clears it. Portal buyers read it through
// portal_catalog, and staff through get_order's lines.
import { beforeAll, describe, expect, it } from "vitest";
import { asUser, makeBrewery, makeCustomerUser, makeStaffCtx, priceSku, seedCustomer, seedLocation } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

type StaffCtx = Awaited<ReturnType<typeof makeStaffCtx>>;
type Format = { id: string; name: string; pallet_fit: number | null };
let breweryId: string, adminCtx: StaffCtx, salesCtx: StaffCtx;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  [adminCtx, salesCtx] = await Promise.all([makeStaffCtx(breweryId, "admin"), makeStaffCtx(breweryId, "sales")]);
});

const sixtel = { basis: "packaged", packageType: "keg", kegSize: "sixth_bbl", bblPerUnit: 1 / 6 } as const;

describe("upsert_format palletFit", () => {
  it("lets Admin set it, keeps it when omitted, and clears it with null", async () => {
    const created = await runCommand("upsert_format", { name: "Fit sixtel", ...sixtel, palletFit: 20 }, adminCtx) as Format;
    expect(created.pallet_fit).toBe(20);
    const renamed = await runCommand("upsert_format", { id: created.id, name: "Fit sixtel 2", ...sixtel }, adminCtx) as Format;
    expect(renamed.pallet_fit).toBe(20);
    expect((await runCommand("upsert_format", { id: created.id, name: "Fit sixtel 2", ...sixtel, palletFit: 8 }, adminCtx) as Format).pallet_fit).toBe(8);
    expect((await runCommand("upsert_format", { id: created.id, name: "Fit sixtel 2", ...sixtel, palletFit: null }, adminCtx) as Format).pallet_fit).toBeNull();
  });

  it("refuses Sales for the pallet fit, while Sales still edits the format's other fields", async () => {
    const created = await runCommand("upsert_format", { name: "Fit half", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5, palletFit: 8 }, adminCtx) as Format;
    await expect(runCommand("upsert_format", { id: created.id, name: "Fit half", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5, palletFit: 9 }, salesCtx)).rejects.toThrow();
    await expect(runCommand("upsert_format", { id: created.id, name: "Fit half", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5, palletFit: null }, salesCtx)).rejects.toThrow();
    await expect(runCommand("upsert_format", { name: "Fit new by sales", ...sixtel, palletFit: 4 }, salesCtx)).rejects.toThrow();
    const renamed = await runCommand("upsert_format", { id: created.id, name: "Fit half renamed", basis: "packaged", packageType: "keg", kegSize: "half_bbl", bblPerUnit: 0.5 }, salesCtx) as Format;
    expect(renamed).toMatchObject({ name: "Fit half renamed", pallet_fit: 8 });
  });

  it("accepts only a positive whole number", async () => {
    await expect(runCommand("upsert_format", { name: "Fit zero", ...sixtel, palletFit: 0 }, adminCtx)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(runCommand("upsert_format", { name: "Fit half unit", ...sixtel, palletFit: 1.5 }, adminCtx)).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("pallet fit reads", () => {
  it("portal_catalog gives the buyer each SKU's package facts and pallet fit", async () => {
    const fmt = await runCommand("upsert_format", { name: "Fit portal sixtel", ...sixtel, palletFit: 20 }, adminCtx) as Format;
    const brand = await runCommand("upsert_brand", { name: "Fit Pils", style: "Pilsner", abv: 5 }, adminCtx) as { id: string };
    const sku = await runCommand("create_sku", { brandId: brand.id, formatId: fmt.id }, adminCtx) as { id: string };
    const customer = await seedCustomer(breweryId);
    await priceSku(breweryId, { saleChannelId: customer.saleChannelId, brandId: brand.id, formatId: fmt.id, cents: 9000 });
    const warehouse = await seedLocation(breweryId);
    await runCommand("set_portal_fulfillment_source", { locationId: warehouse.id }, adminCtx);
    const user = await makeCustomerUser(customer.customerId);
    const buyer = { db: await asUser(user.email), userId: user.id, breweryId, roles: ["customer"] as ["customer"], customerId: customer.customerId };
    const items = await runCommand("portal_catalog", {}, buyer) as Record<string, unknown>[];
    expect(items.find((i) => i.skuId === sku.id)).toMatchObject({ packageType: "keg", kegSize: "sixth_bbl", unitsPerCase: null, palletFit: 20 });
  });
});
