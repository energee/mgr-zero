// Atomic composition creation and protected deletion; runs on the isolated test stack.
import { expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

async function setup() {
  const ctx = await makeStaffCtx((await makeBrewery()).id);
  const can = await runCommand("upsert_format", { name: "16 oz can", basis: "packaged", packageType: "can", bblPerUnit: 16 / 3968 }, ctx) as { id: string };
  const input = { name: "Case", packageType: "can", components: [{ childFormatId: can.id, qty: 24 }] };
  return { ctx, can, input };
}

it("creates contents atomically, derives volume without storing it, and replays safely", async () => {
  const { ctx, input } = await setup();
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const result = await runCommand("create_composed_format", input, ctx, execution) as { id: string; bbl_per_unit: null };
  expect(result.bbl_per_unit).toBeNull();
  expect(await runCommand("create_composed_format", input, ctx, execution)).toEqual(result);
  const { data } = await admin.from("format_volumes").select("bbl_per_unit").eq("id", result.id).single();
  expect(Number(data!.bbl_per_unit) * 31).toBeCloseTo(3, 5);
  await expect(runCommand("create_composed_format", { ...input, name: "Changed" }, ctx, execution)).rejects.toThrow();
  await expect(runCommand("create_composed_format", { ...input, name: "Invalid", components: [{ childFormatId: crypto.randomUUID(), qty: 24 }] }, ctx)).rejects.toThrow();
  expect((await admin.from("formats").select("id").eq("brewery_id", ctx.breweryId).eq("name", "Invalid")).data).toEqual([]);
  await expect(runCommand("create_composed_format", { ...input, bblPerUnit: 3 }, ctx)).rejects.toThrow();
});

it("deletes an unused composed format and its contents with durable replay", async () => {
  const { ctx, can, input } = await setup();
  const format = await runCommand("create_composed_format", input, ctx) as { id: string };
  const execution = { requestId: crypto.randomUUID(), correlationId: crypto.randomUUID() };
  const result = await runCommand("delete_format", { formatId: format.id }, ctx, execution);
  expect(await runCommand("delete_format", { formatId: format.id }, ctx, execution)).toEqual(result);
  expect((await admin.from("formats").select("id").eq("id", format.id)).data).toEqual([]);
  expect((await admin.from("format_components").select("parent_format_id").eq("parent_format_id", format.id)).data).toEqual([]);
  expect((await admin.from("formats").select("id").eq("id", can.id)).data).toHaveLength(1);
});

it("protects child formats and SKUs and rolls back contents cleanup on refusal", async () => {
  const { ctx, can, input } = await setup();
  const format = await runCommand("create_composed_format", input, ctx) as { id: string };
  await expect(runCommand("delete_format", { formatId: can.id }, ctx)).rejects.toThrow(/in use/);
  const brand = await runCommand("upsert_brand", { name: "Beer" }, ctx) as { id: string };
  await runCommand("create_sku", { brandId: brand.id, formatId: format.id }, ctx);
  await expect(runCommand("delete_format", { formatId: format.id }, ctx)).rejects.toThrow(/in use/);
  expect((await admin.from("format_components").select("qty").eq("parent_format_id", format.id)).data).toEqual([{ qty: 24 }]);
});

it("rejects cross-tenant and non-admin deletion at the RPC boundary", async () => {
  const { ctx, can } = await setup();
  const sales = await makeStaffCtx(ctx.breweryId, "sales");
  const denied = await sales.db.rpc("delete_format", { p_brewery: ctx.breweryId, p_id: can.id, p_request_id: crypto.randomUUID() });
  expect(denied.error).not.toBeNull();
  const other = await makeStaffCtx((await makeBrewery()).id);
  await expect(runCommand("delete_format", { formatId: can.id }, other)).rejects.toThrow(/not found/);
});
