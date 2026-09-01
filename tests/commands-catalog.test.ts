// tests/commands-catalog.test.ts — catalog commands must use the idempotent database API.
import { beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "../lib/commands/registry";
import "../lib/commands/all";

let adminCtx: { db: SupabaseClient; userId: string; breweryId: string; role: "admin" | "sales" | "warehouse" | "brewer" };
let salesCtx: { db: SupabaseClient; userId: string; breweryId: string; role: "admin" | "sales" | "warehouse" | "brewer" };

beforeAll(async () => {
  const brewery = await makeBrewery();
  [adminCtx, salesCtx] = await Promise.all([
    makeStaffCtx(brewery.id, "admin"),
    makeStaffCtx(brewery.id, "sales"),
  ]);
});

describe("catalog commands", () => {
  it("creates catalog records through RPC-backed commands", async () => {
    const product = await runCommand("create_product", { name: "Command Lager", style: "Lager", abv: 5.1 }, salesCtx) as { id: string };
    const sku = await runCommand("create_sku", {
      productId: product.id,
      name: "Command Lager can",
      packageType: "can",
      bblPerUnit: "0.004",
    }, salesCtx) as { id: string };
    const location = await runCommand("create_location", { name: "Command Warehouse", kind: "warehouse" }, adminCtx) as { id: string };

    expect(product.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(sku.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(location.id).toMatch(/^[0-9a-f-]{36}$/i);
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
