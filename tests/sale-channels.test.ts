// tests/sale-channels.test.ts — the per-brewery sale_channels table (Program 4,
// docs/plans/sale-channels-customizable.md) that replaced the `sale_channel`
// enum, plus the tax treatment frozen onto every classified removal (§16.3).
import { describe, it, expect, beforeAll } from "vitest";
import { z } from "zod";
import { Client } from "pg";
import { admin, ins, makeBrewery, makeStaff, makeStaffCtx, asUser, seedCatalog, seedLocation, seedCustomer, priceSku, sql, channelId, DB } from "./helpers";

import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

// A removal needs stock in its bin (#450), so each removal test seeds some first.
const stockBin = (brewery: string, sku: string, loc: { id: string; binId: string }, createdBy: string, qty = 1) =>
  ins("inventory_movements", { brewery_id: brewery, sku_id: sku, location_id: loc.id, bin_id: loc.binId, qty, type: "opening_balance", created_by: createdBy });

describe("sale_channels", () => {
  it("a new brewery has four channels and Export is untaxpaid", async () => {
    const b = await makeBrewery();
    const { data } = await admin.from("sale_channels").select("name,tax_treatment").eq("brewery_id", b.id).order("name");
    expect(data!.map((c) => c.name)).toEqual(["DTC", "Export", "Taproom", "Wholesale"]);
    expect(data!.find((c) => c.name === "Export")!.tax_treatment).toBe("export");
    const codes = await admin.from("sale_channels").select("name,system_code").eq("brewery_id", b.id);
    expect(codes.data!.filter((c) => c.system_code === "taproom").map((c) => c.name)).toEqual(["Taproom"]);
    // Everything but Export defaults to taxable.
    for (const c of data!.filter((c) => c.name !== "Export")) expect(c.tax_treatment).toBe("taxable");
  });

  it("channel names are unique per brewery", async () => {
    const b = await makeBrewery();
    const { error } = await admin.from("sale_channels").insert({ brewery_id: b.id, name: "Taproom" });
    expect(error?.code).toBe("23505");
  });

  it("rejects case and JavaScript-trim-equivalent names on inserts and updates", async () => {
    const b = await makeBrewery();
    for (const name of ["dtc", " DTC ", "\tDtc\u00a0\ufeff"]) {
      const inserted = await admin.from("sale_channels").insert({ brewery_id: b.id, name });
      expect(inserted.error?.code, name).toBe("23505");
      const updated = await admin.from("sale_channels").update({ name }).eq("brewery_id", b.id).eq("name", "Export");
      expect(updated.error?.code, name).toBe("23505");
    }
    const rows = await admin.from("sale_channels").select("name").eq("brewery_id", b.id);
    expect(rows.data!.map(row => row.name).sort()).toEqual(["DTC", "Export", "Taproom", "Wholesale"]);
  });

  it("allows the same normalized channel name in different breweries", async () => {
    const a = await makeBrewery(), b = await makeBrewery();
    for (const [brewery_id, name] of [[a.id, "Festival"], [b.id, " festival "]]) {
      expect((await admin.from("sale_channels").insert({ brewery_id, name })).error).toBeNull();
    }
  });

  it("lets only the service role evaluate the pure name-index helper directly", () => {
    expect(sql(`select rolname || ':' || has_function_privilege(rolname, 'private.js_btrim(text)', 'execute')
      from pg_roles where rolname in ('anon','authenticated','service_role') order by rolname`, true))
      .toEqual(["anon:false", "authenticated:false", "service_role:true"]);
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
    await stockBin(breweryId, skuId, loc, ctx.userId, 100);
  });

  async function removal(channel: string, opts: { destState?: string | null; type?: import("@/lib/supabase/database").Database["public"]["Enums"]["movement_type"] } = {}) {
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
    await stockBin(b.id, sku, loc, c.userId);
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

  it("returns a typed conflict for case-insensitive creates and renames without changing the saved row", async () => {
    const b = await makeBrewery(), c = await makeStaffCtx(b.id, "admin");
    const exportId = await channelId(b.id, "Export");
    for (const input of [{ name: " dtc ", taxTreatment: "research" }, { id: exportId, name: "\tDtC\u00a0", taxTreatment: "research" }]) {
      await expect(runCommand("upsert_sale_channel", input, c)).rejects.toMatchObject({
        status: 409, code: "duplicate_channel_name", message: "A channel named DTC already exists.",
      });
    }
    const saved = await admin.from("sale_channels").select("name,tax_treatment").eq("id", exportId).single();
    expect(saved.data).toEqual({ name: "Export", tax_treatment: "export" });
  });

  it("trims direct RPC names, allows a case-only rename of the same row, and replays the exact request", async () => {
    const b = await makeBrewery(), c = await makeStaffCtx(b.id, "admin");
    const input = { p_brewery: b.id, p_id: null, p_name: "\tFestival\u00a0\ufeff", p_tax_treatment: "taxable" as const, p_request_id: crypto.randomUUID() };
    const created = await c.db.rpc("upsert_sale_channel", input);
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ name: "Festival" });
    const { id } = z.object({ id: z.string().uuid() }).parse(created.data);
    await expect(runCommand("upsert_sale_channel", { id, name: " festival ", taxTreatment: "research" }, c)).resolves.toMatchObject({ id, name: "festival", tax_treatment: "research" });
    const replay = await c.db.rpc("upsert_sale_channel", input);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(created.data);
    const saved = await admin.from("sale_channels").select("name,tax_treatment").eq("id", id).single();
    expect(saved.data).toEqual({ name: "festival", tax_treatment: "research" });
  });

  it("rejects blank names through both the command and direct RPC", async () => {
    for (const name of ["", " \t\n\u00a0\ufeff"]) {
      await expect(runCommand("upsert_sale_channel", { name, taxTreatment: "taxable" }, ctx)).rejects.toMatchObject({ code: "invalid_input" });
      const result = await ctx.db.rpc("upsert_sale_channel", {
        p_brewery: breweryId, p_id: null, p_name: name, p_tax_treatment: "taxable", p_request_id: crypto.randomUUID(),
      });
      expect(result.error?.message).toBe("Enter a channel name.");
      expect(result.error?.code).toBe("P0001");
    }
  });

  it("serializes real PostgreSQL contenders for case variants so exactly one channel is created", async () => {
    const brewery = await makeBrewery(), ctx = await makeStaffCtx(brewery.id, "admin");
    const first = new Client({ connectionString: DB }), second = new Client({ connectionString: DB });
    await Promise.all([first.connect(), second.connect()]);
    let pending: Promise<unknown> | undefined;
    const query = "select public.upsert_sale_channel($1,null,$2,'taxable',$3)";
    try {
      for (const client of [first, second]) {
        await client.query("begin");
        await client.query("select set_config('request.jwt.claim.sub',$1,true)", [ctx.userId]);
        await client.query("set local role authenticated");
      }
      await first.query(query, [brewery.id, "Night market", crypto.randomUUID()]);
      await first.query("reset role");
      const { pid } = (await second.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0];
      pending = second.query(query, [brewery.id, " NIGHT MARKET ", crypto.randomUUID()]);
      await expect.poll(async () => (await first.query("select wait_event_type from pg_stat_activity where pid=$1", [pid])).rows[0]?.wait_event_type)
        .toBe("Lock");
      await first.query("commit");
      await expect(pending).rejects.toMatchObject({ code: "MGC01" });
      const rows = await admin.from("sale_channels").select("name").eq("brewery_id", brewery.id);
      expect(rows.data!.filter(row => row.name.toLowerCase() === "night market")).toEqual([{ name: "Night market" }]);
    } finally {
      await first.query("rollback").catch(() => undefined);
      await second.query("rollback").catch(() => undefined);
      await Promise.all([first.end(), second.end()]);
      if (pending) await pending.catch(() => undefined);
    }
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
    const wholesale = await channelId(b.id, "Wholesale");
    await stockBin(b.id, sku, loc, c.userId);
    const movement = await c.db.rpc("record_inventory_movement", {
      p_brewery: b.id, p_sku: sku, p_location: loc.id, p_bin: loc.binId, p_qty: -1,
      p_type: "sale_removal", p_sale_channel: wholesale, p_dest_state: "PA", p_note: null,
      p_request_id: crypto.randomUUID(), p_lot: null, p_origin: "ui", p_conversation: null, p_preview_token: null,
    });
    expect(movement.error).toBeNull();
    await expect(runCommand("delete_sale_channel", { channelId: wholesale }, c))
      .rejects.toMatchObject({ message: "channel is in use" });
  });

  // #1207: the system Taproom channel is refused by the RPC itself, even when
  // nothing references it and after a rename.
  it("delete_sale_channel refuses the system Taproom channel even when nothing uses it", async () => {
    const b = await makeBrewery();
    const c = await makeStaffCtx(b.id, "admin");
    const taproom = await channelId(b.id, "Taproom");
    await runCommand("upsert_sale_channel", { id: taproom, name: "Bar", taxTreatment: "taxable" }, c);
    await expect(runCommand("delete_sale_channel", { channelId: taproom }, c))
      .rejects.toMatchObject({ message: expect.stringMatching(/system Taproom channel cannot be deleted/) });
    expect((await runCommand("list_sale_channels", {}, c) as { id: string }[]).map((r) => r.id)).toContain(taproom);
  });

  // #1207: in_use is true exactly when a foreign key would refuse the delete.
  // These are every table that references sale_channels; a new one fails here
  // until list_sale_channels checks it too.
  it("only movements, customers, orders, price cells and Square menus reference a channel", () => {
    expect(sql(`select conrelid::regclass::text from pg_constraint
      where confrelid = 'public.sale_channels'::regclass and contype = 'f' order by 1`, true))
      .toEqual(["channel_prices", "customers", "inventory_movements", "orders", "pos_menus"]);
  });

  it("list_sale_channels flags each channel a foreign key holds, and Delete succeeds exactly where it is unflagged", async () => {
    const b = await makeBrewery();
    const c = await makeStaffCtx(b.id, "admin");
    const make = async (name: string) => ((await runCommand("upsert_sale_channel", { name, taxTreatment: "taxable" }, c)) as { id: string }).id;
    const [byMovement, byCustomer, byOrder, byPrice, byMenu] = [
      await make("By movement"), await make("By customer"), await make("By order"), await make("By price"), await make("By menu")];
    const { skuId, brandId, formatId } = await seedCatalog(b.id, { packageType: "keg", bblPerUnit: 0.5 });
    const loc = await seedLocation(b.id, { uses: ["warehouse", "taproom"] });
    await stockBin(b.id, skuId, loc, c.userId);
    expect((await c.db.rpc("record_inventory_movement", {
      p_brewery: b.id, p_sku: skuId, p_location: loc.id, p_bin: loc.binId, p_qty: -1,
      p_type: "sale_removal", p_sale_channel: byMovement, p_dest_state: "PA", p_note: null,
      p_request_id: crypto.randomUUID(), p_lot: null, p_origin: "ui", p_conversation: null, p_preview_token: null,
    })).error).toBeNull();
    const customer = await seedCustomer(b.id, { saleChannelId: byCustomer });
    await ins("orders", { brewery_id: b.id, kind: "wholesale", customer_id: customer.customerId, ship_to_id: customer.shipToId,
      sale_channel_id: byOrder, from_location_id: loc.id, created_by: c.userId });
    await priceSku(b.id, { saleChannelId: byPrice, brandId, formatId, cents: 1000 });
    const connection = await admin.from("pos_connections").insert({ brewery_id: b.id,
      merchant_id: `flag-menu-${crypto.randomUUID()}`, state: "connected" }).select("id").single();
    expect(connection.error).toBeNull();
    expect((await admin.from("pos_locations").insert({ brewery_id: b.id, connection_id: connection.data!.id,
      external_location_id: "FLAG-MENU", location_id: loc.id })).error).toBeNull();
    await runCommand("configure_pos_menu", { posLocationId: "FLAG-MENU", binId: loc.binId, saleChannelId: byMenu }, c);

    for (const role of ["admin", "sales", "warehouse"] as const) {
      const reader = role === "admin" ? c : await makeStaffCtx(b.id, role);
      const rows = (await runCommand("list_sale_channels", {}, reader)) as { name: string; in_use: boolean; system_code: string | null }[];
      expect(Object.fromEntries(rows.map((r) => [r.name, r.in_use])), role).toEqual({
        "By customer": true, "By menu": true, "By movement": true, "By order": true, "By price": true,
        DTC: false, Export: false, Taproom: false, Wholesale: false,
      });
      expect(rows.filter((r) => r.system_code === "taproom").map((r) => r.name)).toEqual(["Taproom"]);
    }

    const rows = (await runCommand("list_sale_channels", {}, c)) as { id: string; name: string; in_use: boolean; system_code: string | null }[];
    for (const row of rows) {
      const deleted = runCommand("delete_sale_channel", { channelId: row.id }, c);
      if (row.in_use || row.system_code) await expect(deleted, row.name).rejects.toBeTruthy();
      else await expect(deleted, row.name).resolves.toBeTruthy();
    }
  });

  // CHANNEL_IN_USE_RULE names the Square menu; pos_menus holds a plain foreign key.
  it("delete_sale_channel refuses a channel a Square menu references", async () => {
    const menuChannel = (await runCommand("upsert_sale_channel", { name: "Menu only", taxTreatment: "taxable" }, ctx)) as { id: string };
    const loc = (await runCommand("create_location", { name: "Menu taproom", uses: ["taproom"] }, ctx)) as { id: string };
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as { id: string }[];
    const connection = await admin.from("pos_connections").insert({ brewery_id: breweryId,
      merchant_id: `channel-menu-${crypto.randomUUID()}`, state: "connected" }).select("id").single();
    expect(connection.error).toBeNull();
    expect((await admin.from("pos_locations").insert({ brewery_id: breweryId, connection_id: connection.data!.id,
      external_location_id: "CHANNEL-MENU", location_id: loc.id })).error).toBeNull();
    await runCommand("configure_pos_menu", { posLocationId: "CHANNEL-MENU", binId: bins[0].id, saleChannelId: menuChannel.id }, ctx);
    await expect(runCommand("delete_sale_channel", { channelId: menuChannel.id }, ctx))
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
