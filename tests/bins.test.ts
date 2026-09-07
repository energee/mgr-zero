// tests/bins.test.ts — bins are brewery-configured subdivisions of a location; every
// location is born with a trio and can never drop below one. Spec:
// .agents/superpowers/specs/2026-09-06-mgr-locations-bins-transfers-design.md, Decision 1.
import { describe, it, expect, beforeAll } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Row = { id: string; name: string };
type Ctx = { db: SupabaseClient; userId: string; breweryId: string; role: "admin" | "sales" | "warehouse" | "brewer" };

describe("bins", () => {
  let ctx: Ctx;
  beforeAll(async () => { ctx = await makeStaffCtx((await makeBrewery()).id, "admin"); });

  it("create_location seeds Walk-in, Cold and Dry, and accepts the storage kind", async () => {
    const loc = (await runCommand("create_location", { name: "Overflow", kind: "storage" }, ctx)) as Row;
    const { data } = await admin.from("bins").select("name").eq("location_id", loc.id).order("name");
    expect(data!.map((b) => b.name)).toEqual(["Cold", "Dry", "Walk-in"]);
  });

  it("bin names are unique per location, not per brewery", async () => {
    const a = (await runCommand("create_location", { name: "WH A", kind: "warehouse" }, ctx)) as Row;
    const b = (await runCommand("create_location", { name: "WH B", kind: "warehouse" }, ctx)) as Row;
    const dup = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: a.id, name: "Cold" });
    expect(dup.error?.code).toBe("23505");
    const ok = await admin.from("bins").insert({ brewery_id: ctx.breweryId, location_id: b.id, name: "Rack 3" });
    expect(ok.error).toBeNull();
  });

  it("a bin cannot point at another brewery's location", async () => {
    const other = await makeBrewery();
    const loc = (await runCommand("create_location", { name: "Mine", kind: "warehouse" }, ctx)) as Row;
    const { error } = await admin.from("bins").insert({ brewery_id: other.id, location_id: loc.id, name: "Stolen" });
    expect(error?.code).toBe("23503");
  });

  it("list_bins returns a location's bins alphabetically, warehouse can read", async () => {
    const wh = await makeStaffCtx(ctx.breweryId, "warehouse");
    const loc = (await runCommand("create_location", { name: "List WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, wh)) as Row[];
    expect(bins.map((b) => b.name)).toEqual(["Cold", "Dry", "Walk-in"]);
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    expect(((await runCommand("list_bins", { locationId: loc.id }, sales)) as Row[]).length).toBe(3);
  });

  it("create_bin and update_bin are warehouse-or-admin and idempotent by request", async () => {
    const wh = await makeStaffCtx(ctx.breweryId, "warehouse");
    const sales = await makeStaffCtx(ctx.breweryId, "sales");
    const loc = (await runCommand("create_location", { name: "Cmd WH", kind: "warehouse" }, ctx)) as Row;
    const bin = (await runCommand("create_bin", { locationId: loc.id, name: "Rack 3" }, wh)) as Row;
    expect(bin.name).toBe("Rack 3");
    const renamed = (await runCommand("update_bin", { binId: bin.id, name: "Rack 3 · top" }, wh)) as Row;
    expect(renamed.name).toBe("Rack 3 · top");
    await expect(runCommand("create_bin", { locationId: loc.id, name: "Nope" }, sales))
      .rejects.toMatchObject({ code: "permission_denied" });
  });

  it("delete_bin removes an empty bin but refuses the last one", async () => {
    const loc = (await runCommand("create_location", { name: "Del WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    await runCommand("delete_bin", { binId: bins[0].id }, ctx);
    await runCommand("delete_bin", { binId: bins[1].id }, ctx);
    await expect(runCommand("delete_bin", { binId: bins[2].id }, ctx))
      .rejects.toMatchObject({ message: expect.stringMatching(/at least one bin/i) });
    const left = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    expect(left).toHaveLength(1);
    const renamed = (await runCommand("update_bin", { binId: left[0].id, name: "Only" }, ctx)) as Row;
    expect(renamed.name).toBe("Only");
  });

  it("a bin belongs to the caller's brewery or the RPC refuses it", async () => {
    const otherCtx = await makeStaffCtx((await makeBrewery()).id, "admin");
    const loc = (await runCommand("create_location", { name: "Tenant WH", kind: "warehouse" }, ctx)) as Row;
    const bins = (await runCommand("list_bins", { locationId: loc.id }, ctx)) as Row[];
    await expect(runCommand("update_bin", { binId: bins[0].id, name: "Hijack" }, otherCtx)).rejects.toBeTruthy();
    await expect(runCommand("delete_bin", { binId: bins[0].id }, otherCtx)).rejects.toBeTruthy();
  });
});
