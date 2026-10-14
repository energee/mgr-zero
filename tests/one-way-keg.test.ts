// tests/one-way-keg.test.ts — a one-way keg (a disposable shell such as
// Dolium) is a keg format with no keg pool plus the shell as a packaging
// material in that format's BOM. Nothing new models it: this proves the path
// end to end through the commands a brewery uses. The SKU stores no container
// source and charges no deposit; Planning asks for one shell per planned keg
// from the shell's default vendor; and a packaging close draws one shell per
// keg filled. Returnable kegs stay on their own format, so the shell is never
// drawn for them (BOM lives on the format, schema design §16.12).
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedLocation, seedMovement } from "./helpers";
import { closeWithConfirmedMaterials } from "./packaging-fixture";
import { runCommand } from "@/lib/commands/registry";
import { KEG_BBL } from "@/lib/mgr/format-view";
import "@/lib/commands/all";

let breweryId: string;
let adminCtx: Awaited<ReturnType<typeof makeStaffCtx>>;
let shellId: string;
let skuId: string;
let brandId: string;

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  adminCtx = await makeStaffCtx(breweryId, "admin");
  const vendor = (await runCommand("upsert_vendor", { name: "Shell Supply", leadTimeDays: 14 }, adminCtx)) as { id: string };
  shellId = ((await runCommand("upsert_material", {
    name: "One-way keg shell 20L", category: "packaging", baseUom: "each", purchaseUom: "each", defaultVendorId: vendor.id,
  }, adminCtx)) as { id: string }).id;
  const format = (await runCommand("upsert_format", {
    name: "One-way 20L", basis: "packaged", packageType: "keg", kegSize: "twenty_l", bblPerUnit: KEG_BBL.twenty_l,
  }, adminCtx)) as { id: string };
  await runCommand("replace_format_bom", { formatId: format.id, lines: [{ materialId: shellId, qtyPerUnit: 1 }] }, adminCtx);
  brandId = ((await runCommand("upsert_brand", { name: "One-way Pils" }, adminCtx)) as { id: string }).id;
  skuId = ((await runCommand("create_sku", { brandId, formatId: format.id, kegPoolId: null }, adminCtx)) as { id: string }).id;
});

describe("one-way keg", () => {
  it("is a keg SKU with no pool, so no container source and no deposit", async () => {
    const { data, error } = await admin.from("skus").select("keg_pool_id, container_source").eq("id", skuId).single();
    if (error) throw error;
    expect(data).toEqual({ keg_pool_id: null, container_source: null });
  });

  it("asks Planning for one shell per planned keg from the shell's vendor", async () => {
    await runCommand("schedule_packaging_run", { brandId, plannedOn: "2099-01-20", outputs: [{ skuId, qtyPlanned: 12 }] }, adminCtx);
    const rows = (await runCommand("get_material_requirements", {}, adminCtx)) as { material_id: string; required: number; vendor_name: string; buy_by: string }[];
    const shell = rows.find((r) => r.material_id === shellId);
    // Buy by = the run's planned date less the vendor's 14-day lead time.
    expect(shell).toMatchObject({ vendor_name: "Shell Supply", buy_by: "2099-01-06" });
    expect(Number(shell!.required)).toBe(12);
  });

  it("draws one shell per keg filled when the run closes", async () => {
    const wh = await seedLocation(breweryId, { name: "One-way WH" });
    await seedMovement(breweryId, { materialId: shellId, locationId: wh.id, binId: wh.binId, qty: 50, createdBy: adminCtx.userId });
    const vessel = (await runCommand("upsert_vessel", { name: "FV-OW", kind: "fermenter", capacityBbl: 30 }, adminCtx)) as { id: string };
    const batch = (await runCommand("schedule_batch", { plannedOn: "2026-01-02", plannedBbl: 5, intendedBrandId: brandId }, adminCtx)) as { id: string };
    const day = (await runCommand("record_brew_day", {
      actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: 5, brewedOn: "2026-01-02",
    }, adminCtx)) as { occupancy: { id: string } };
    const run = (await runCommand("schedule_packaging_run", {
      brandId, plannedOn: "2026-01-20", occupancyId: day.occupancy.id, outputs: [{ skuId, qtyPlanned: 6 }],
    }, adminCtx)) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-01-20T14:00:00Z" }, adminCtx);
    await closeWithConfirmedMaterials({
      runId: run.id, bblDrawn: 6 * KEG_BBL.twenty_l, outputs: [{ skuId, qtyActual: 6 }],
      lotCode: "OW-1", packagedOn: "2026-01-20", locationId: wh.id, binId: wh.binId,
    }, adminCtx);
    // Every shell movement: the 50 seeded, then exactly one draw of six.
    const { data, error } = await admin.from("material_movements").select("qty").eq("material_id", shellId).order("created_at");
    if (error) throw error;
    expect(data.map((m) => Number(m.qty))).toEqual([50, -6]);
  });
});
