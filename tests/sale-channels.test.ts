// tests/sale-channels.test.ts — the per-brewery sale_channels table (Program 4,
// docs/plans/sale-channels-customizable.md) that replaced the `sale_channel`
// enum, plus the tax treatment frozen onto every classified removal (§16.3).
import { describe, it, expect, beforeAll } from "vitest";
import { admin, makeBrewery, makeStaff, makeStaffCtx, asUser, seedCatalog, seedLocation, channelId } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

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
    // The composite FK (sale_channel_id, brewery_id) would also refuse it, but
    // removal_shape gets there first: record_inventory_movement resolves the
    // treatment scoped to p_brewery, finds none, and the CHECK's
    // `tax_treatment is not null` fails — 23514, not 23503.
    expect(error?.code).toBe("23514");
  });
});

// Program 4 Task 2: the commands a brewery edits its own channel list with.
// upsert/delete are admin-only; the list is readable by everyone who records a
// movement. No name is pinned: an order carries its own sale channel.
describe("sale channel commands", () => {
  let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
  let breweryId: string;

  beforeAll(async () => {
    breweryId = (await makeBrewery()).id;
    ctx = await makeStaffCtx(breweryId, "admin");
  });

  it("list_sale_channels returns the four seeded channels to admin, sales and warehouse", async () => {
    for (const role of ["admin", "sales", "warehouse"] as const) {
      const c = role === "admin" ? ctx : await makeStaffCtx(breweryId, role);
      const rows = (await runCommand("list_sale_channels", {}, c)) as { name: string; tax_treatment: string }[];
      expect(rows.map((r) => r.name)).toEqual(["DTC", "Export", "Taproom", "Wholesale"]);
      expect(rows.find((r) => r.name === "Export")!.tax_treatment).toBe("export");
    }
  });

  it("upsert_sale_channel creates and then renames a channel; sales is denied", async () => {
    const created = (await runCommand("upsert_sale_channel", { name: "Festival", taxTreatment: "taxable" }, ctx)) as { id: string; name: string; tax_treatment: string };
    expect(created.name).toBe("Festival");
    const edited = (await runCommand("upsert_sale_channel", { id: created.id, name: "Festivals", taxTreatment: "research" }, ctx)) as { name: string; tax_treatment: string };
    expect(edited.name).toBe("Festivals");
    expect(edited.tax_treatment).toBe("research");
    const sales = await makeStaffCtx(breweryId, "sales");
    await expect(runCommand("upsert_sale_channel", { name: "Sneaky", taxTreatment: "taxable" }, sales))
      .rejects.toMatchObject({ code: "permission_denied" });
  });

  it("upsert_sale_channel refuses a rename onto an existing name", async () => {
    const festival = (await runCommand("upsert_sale_channel", { name: "Festival", taxTreatment: "taxable" }, ctx)) as { id: string };
    await expect(runCommand("upsert_sale_channel", { id: festival.id, name: "Taproom", taxTreatment: "taxable" }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/already exists/) });
  });

  it("delete_sale_channel removes an unused channel", async () => {
    const made = (await runCommand("upsert_sale_channel", { name: "Scrap", taxTreatment: "taxable" }, ctx)) as { id: string };
    await runCommand("delete_sale_channel", { channelId: made.id }, ctx);
    const rows = (await runCommand("list_sale_channels", {}, ctx)) as { name: string }[];
    expect(rows.map((r) => r.name)).not.toContain("Scrap");
  });

  it("delete_sale_channel refuses a channel a movement references", async () => {
    const b = await makeBrewery();
    const c = await makeStaffCtx(b.id, "admin");
    const { skuId: sku } = await seedCatalog(b.id, { packageType: "keg", bblPerUnit: 0.5 });
    const loc = await seedLocation(b.id);
    const taproom = await channelId(b.id, "Taproom");
    await runCommand("record_movement", {
      skuId: sku, locationId: loc.id, binId: loc.binId, qty: -1, type: "sale_removal",
      saleChannelId: taproom, destState: "PA",
    }, c);
    await expect(runCommand("delete_sale_channel", { channelId: taproom }, c))
      .rejects.toMatchObject({ message: "channel is in use" });
  });

  it("a channel of another brewery is not editable or deletable", async () => {
    const otherCtx = await makeStaffCtx((await makeBrewery()).id, "admin");
    const mine = (await runCommand("upsert_sale_channel", { name: "Tenant", taxTreatment: "taxable" }, ctx)) as { id: string };
    await expect(runCommand("upsert_sale_channel", { id: mine.id, name: "Hijack", taxTreatment: "taxable" }, otherCtx)).rejects.toBeTruthy();
    await expect(runCommand("delete_sale_channel", { channelId: mine.id }, otherCtx)).rejects.toBeTruthy();
  });

  it("upsert_customer carries an optional tax treatment override, null inherits", async () => {
    const plain = (await runCommand("upsert_customer", { name: "Plain Bar", type: "retailer", state: "PA", saleChannelId: await channelId(breweryId, "Wholesale") }, ctx)) as { id: string; tax_treatment: string | null };
    expect(plain.tax_treatment).toBeNull();
    const vessel = (await runCommand("upsert_customer", { id: plain.id, name: "Plain Bar", type: "retailer", state: "PA", saleChannelId: await channelId(breweryId, "Wholesale"), taxTreatment: "vessel_supplies" }, ctx)) as { tax_treatment: string | null };
    expect(vessel.tax_treatment).toBe("vessel_supplies");
  });
});
