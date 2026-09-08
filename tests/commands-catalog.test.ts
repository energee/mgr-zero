// tests/commands-catalog.test.ts — catalog commands must use the idempotent database API.
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeBrewery, makeStaffCtx, seedPriceGroup } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let adminCtx: { db: SupabaseClient; userId: string; breweryId: string; role: import("@/lib/commands/registry").StaffRole };
let salesCtx: { db: SupabaseClient; userId: string; breweryId: string; role: import("@/lib/commands/registry").StaffRole };

beforeAll(async () => {
  const brewery = await makeBrewery();
  [adminCtx, salesCtx] = await Promise.all([
    makeStaffCtx(brewery.id, "admin"),
    makeStaffCtx(brewery.id, "sales"),
  ]);
});

describe("catalog commands", () => {
  it("creates catalog records through RPC-backed commands: brand, format, sku = brand × format", async () => {
    const brand = await runCommand("upsert_brand", { name: "Command Lager", style: "Lager", abv: 5.1, priceGroupId: await seedPriceGroup(salesCtx.breweryId, "Standard", 1) }, salesCtx) as { id: string; style_id: string };
    const fmt = await runCommand("upsert_format", { name: "16 oz can", basis: "packaged", packageType: "can", bblPerUnit: 0.004 }, salesCtx) as { id: string };
    const sku = await runCommand("create_sku", { brandId: brand.id, formatId: fmt.id }, salesCtx) as { id: string; name: string };
    const location = await runCommand("create_location", { name: "Command Warehouse", kind: "warehouse" }, adminCtx) as { id: string };

    expect(brand.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(brand.style_id).toMatch(/^[0-9a-f-]{36}$/i); // the style row was created with the brand
    expect(sku.name).toBe("Command Lager · 16 oz can");
    expect(location.id).toMatch(/^[0-9a-f-]{36}$/i);
    // one brand × one format, once
    await expect(runCommand("create_sku", { brandId: brand.id, formatId: fmt.id }, salesCtx)).rejects.toBeTruthy();
    // a poured format is never a sku
    const pour = await runCommand("upsert_format", { name: "pint", basis: "poured" }, salesCtx) as { id: string };
    await expect(runCommand("create_sku", { brandId: brand.id, formatId: pour.id }, salesCtx)).rejects.toThrow(/packaged/);
    // upsert by id renames; the same style name reuses the style row
    const again = await runCommand("upsert_brand", { id: brand.id, name: "Command Lager", style: "Lager", abv: 5.2 }, salesCtx) as { style_id: string };
    expect(again.style_id).toBe(brand.style_id);
    const brands = await runCommand("list_brands", {}, salesCtx) as { id: string; styles: { name: string } | null; skus: { id: string }[] }[];
    expect(brands.find((b) => b.id === brand.id)).toMatchObject({ styles: { name: "Lager" } });
    expect(brands.find((b) => b.id === brand.id)!.skus.map((s) => s.id)).toEqual([sku.id]);
  });

  it("denies sales members admin-only location creation in the registry and raw RPC", async () => {
    await expect(runCommand("create_location", { name: "Sales Warehouse", kind: "warehouse" }, salesCtx))
      .rejects.toMatchObject({ code: "permission_denied" });

    const raw = await salesCtx.db.rpc("create_location", {
      p_brewery: salesCtx.breweryId,
      p_name: "Raw sales warehouse",
      p_kind: "warehouse",
      p_request_id: crypto.randomUUID(),
    });
    expect(raw.error).not.toBeNull();
  });
});

describe("update_location", () => {
  it("admin renames a location and may change its kind; sales is denied", async () => {
    const loc = await runCommand("create_location", { name: "Old WH", kind: "warehouse" }, adminCtx) as { id: string };
    const row = await runCommand("update_location", { locationId: loc.id, name: "Main WH", kind: "taproom" }, adminCtx) as { id: string; name: string; kind: string };
    expect(row).toMatchObject({ id: loc.id, name: "Main WH", kind: "taproom" });
    await expect(runCommand("update_location", { locationId: loc.id, name: "Nope", kind: "warehouse" }, salesCtx))
      .rejects.toMatchObject({ code: "permission_denied" });
  });
});
