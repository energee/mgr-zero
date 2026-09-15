import { expect, it } from "vitest";
import { makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

it("adds, renames all brand references, protects used categories and replays deletion", async () => {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  await runCommand("save_catalog_category", { name: "Seasonal" }, ctx);
  for (const name of ["First", "Second"]) await runCommand("upsert_brand", { name, category: "Seasonal" }, ctx);
  const rename = { previousName: "Seasonal", name: "Limited" };
  const result = await runCommand("save_catalog_category", rename, ctx, execution);
  expect(await runCommand("save_catalog_category", rename, ctx, execution)).toEqual(result);
  expect((await ctx.db.from("brands").select("category")).data).toEqual([{ category: "Limited" }, { category: "Limited" }]);
  await expect(runCommand("delete_catalog_category", { name: "Limited" }, ctx)).rejects.toThrow(/in use/);
  await runCommand("save_catalog_category", { name: "Unused" }, ctx);
  const deletion = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  await runCommand("delete_catalog_category", { name: "Unused" }, ctx, deletion);
  await expect(runCommand("delete_catalog_category", { name: "Unused" }, ctx, deletion)).resolves.toEqual({ name: "Unused" });
  expect(await runCommand("list_catalog_categories", {}, ctx)).toEqual([{ name: "Limited" }]);
});

it("validates names, isolates tenants, and restricts writes to Admin and Sales", async () => {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const other = await makeStaffCtx((await makeBrewery()).id);
  await runCommand("save_catalog_category", { name: "Core" }, ctx);
  expect(await runCommand("list_catalog_categories", {}, other)).toEqual([]);
  await expect(runCommand("save_catalog_category", { previousName: "Core", name: "Stolen" }, other)).rejects.toThrow(/not found/);
  await expect(runCommand("save_catalog_category", { name: "Core" }, ctx)).rejects.toThrow();
  await expect(runCommand("save_catalog_category", { name: "   " }, ctx)).rejects.toThrow();
  const warehouse = await makeStaffCtx(ctx.breweryId, "warehouse");
  expect((await warehouse.db.rpc("save_catalog_category", { p_brewery: ctx.breweryId, p_previous_name: null, p_name: "Denied", p_request_id: crypto.randomUUID() })).error).not.toBeNull();
  expect((await ctx.db.from("catalog_categories").insert({ brewery_id: ctx.breweryId, name: "Direct write" })).error).not.toBeNull();
  const sales = await makeStaffCtx(ctx.breweryId, "sales");
  await expect(runCommand("save_catalog_category", { name: "Sales category" }, sales)).resolves.toMatchObject({ name: "Sales category" });
});
