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
});
