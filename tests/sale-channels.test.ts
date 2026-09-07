// tests/sale-channels.test.ts — the per-brewery sale_channels table (Program 4,
// docs/plans/sale-channels-customizable.md) that replaced the `sale_channel`
// enum, plus the tax treatment frozen onto every classified removal (§16.3).
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeStaffCtx, asUser, seedCatalog, seedLocation, channelId } from "./helpers";

describe("sale_channels", () => {
  it("a new brewery has four channels and Export is untaxpaid", async () => {
    const b = await makeBrewery();
    const { data } = await admin.from("sale_channels").select("name,tax_treatment").eq("brewery_id", b.id).order("name");
    expect(data!.map((c) => c.name)).toEqual(["DTC", "Export", "Taproom", "Wholesale"]);
    expect(data!.find((c) => c.name === "Export")!.tax_treatment).toBe("export");
    // Everything but Export defaults to taxable.
    for (const c of data!.filter((c) => c.name !== "Export")) expect(c.tax_treatment).toBe("taxable");
  });

  it("channel names are unique per brewery", async () => {
    const b = await makeBrewery();
    const { error } = await admin.from("sale_channels").insert({ brewery_id: b.id, name: "Taproom" });
    expect(error?.code).toBe("23505");
  });

  it("staff of one brewery cannot read another brewery's channels", async () => {
    const [a, other] = [await makeBrewery(), await makeBrewery()];
    const staff = await makeStaff(a.id, "admin");
    const db = await asUser(staff.email);
    const mine = await db.from("sale_channels").select("id").eq("brewery_id", a.id);
    expect(mine.data!.length).toBe(4);
    const theirs = await db.from("sale_channels").select("id").eq("brewery_id", other.id);
    expect(theirs.data).toEqual([]);
  });
});

describe("frozen tax treatment on movements", () => {
  let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
  let breweryId: string, skuId: string, locationId: string, binId: string;

  beforeAll(async () => {
    const b = await makeBrewery();
    breweryId = b.id;
    ctx = await makeStaffCtx(breweryId, "warehouse");
    ({ skuId } = await seedCatalog(breweryId, { packageType: "keg", bblPerUnit: 0.5 }));
    const loc = await seedLocation(breweryId);
    locationId = loc.id;
    binId = loc.binId;
  });

  async function removal(channel: string, opts: { destState?: string | null; type?: string } = {}) {
    const { data, error } = await ctx.db.rpc("record_inventory_movement", {
      p_brewery: breweryId, p_sku: skuId, p_location: locationId, p_bin: binId, p_qty: -1,
      p_type: opts.type ?? "sale_removal", p_sale_channel: channel,
      p_dest_state: opts.destState === undefined ? "PA" : opts.destState,
      p_note: null, p_request_id: crypto.randomUUID(),
    });
    return { data: data as { id: string; tax_treatment: string; sale_channel_id: string } | null, error };
  }

  it("resolves the channel's tax treatment onto the movement", async () => {
    const wholesale = await channelId(breweryId, "Wholesale");
    const exportCh = await channelId(breweryId, "Export");
    expect((await removal(wholesale)).data!.tax_treatment).toBe("taxable");
    expect((await removal(exportCh)).data!.tax_treatment).toBe("export");
  });

  it("deleting a channel that a movement references is rejected", async () => {
    const b = await makeBrewery();
    const c = await makeStaffCtx(b.id, "warehouse");
    const { skuId: sku } = await seedCatalog(b.id, { packageType: "keg", bblPerUnit: 0.5 });
    const loc = await seedLocation(b.id);
    const wholesale = await channelId(b.id, "Wholesale");
    const { error: mvErr } = await c.db.rpc("record_inventory_movement", {
      p_brewery: b.id, p_sku: sku, p_location: loc.id, p_bin: loc.binId, p_qty: -1,
      p_type: "sale_removal", p_sale_channel: wholesale, p_dest_state: "PA",
      p_note: null, p_request_id: crypto.randomUUID(),
    });
    expect(mvErr).toBeNull();
    const { error } = await admin.from("sale_channels").delete().eq("id", wholesale);
    expect(error?.code).toBe("23503");
  });

  it("a movement's tax treatment does not change when the channel's does", async () => {
    const dtc = await channelId(breweryId, "DTC");
    const { data: mv } = await removal(dtc);
    expect(mv!.tax_treatment).toBe("taxable");
    const { error } = await admin.from("sale_channels").update({ tax_treatment: "research" }).eq("id", dtc);
    expect(error).toBeNull();
    const { data: after } = await admin.from("inventory_movements").select("tax_treatment").eq("id", mv!.id).single();
    expect(after!.tax_treatment).toBe("taxable");
    await admin.from("sale_channels").update({ tax_treatment: "taxable" }).eq("id", dtc);
  });

  it("a movement referencing another brewery's channel is rejected", async () => {
    const other = await makeBrewery();
    const foreign = await channelId(other.id, "Wholesale");
    const { error } = await removal(foreign);
    expect(error).not.toBeNull();
  });
});
