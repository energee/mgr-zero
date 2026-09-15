import { beforeAll, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedMaterial } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let ctx: Awaited<ReturnType<typeof makeStaffCtx>>;
let brandId: string;
let groupId: string;
beforeAll(async () => {
  ctx = await makeStaffCtx((await makeBrewery()).id, "sales");
  brandId = (await runCommand("upsert_brand", { name: "Lager" }, ctx) as { id: string }).id;
  groupId = (await runCommand("upsert_price_group", { name: "1", position: 1 }, ctx) as { id: string }).id;
  await runCommand("upsert_brand", { id: brandId, name: "Lager", priceGroupId: groupId }, ctx);
});
const input = () => ({ name: "Pint", basis: "poured" as const, priceGroupId: groupId, ounces: 16 });
const rpc = (extra = {}) => ctx.db.rpc("upsert_format", {
  p_brewery: ctx.breweryId, p_id: null, p_name: crypto.randomUUID(), p_basis: "poured",
  p_package_type: null, p_keg_size: null, p_units_per_case: null, p_bbl_per_unit: null,
  p_price_group: groupId, p_ounces: 16, p_request_id: crypto.randomUUID(), ...extra,
});

it("rejects trimmed-name collisions and ounces at or above 1000", async () => {
  const name = `Trim ${crypto.randomUUID()}`;
  expect((await rpc({ p_name: name })).error).toBeNull();
  expect((await rpc({ p_name: `${name} ` })).error).not.toBeNull();
  expect((await rpc({ p_ounces: 1000 })).error).not.toBeNull();
});

it("requires a price group and positive finite ounces in registry and SQL, and rejects incompatible facts", async () => {
  for (const invalid of [{ name: " " }, { priceGroupId: undefined }, { ounces: undefined }, { ounces: 0 }, { ounces: -1 }, { ounces: Infinity }, { ounces: NaN }, { packageType: "can" }, { kegSize: "half_bbl" }, { unitsPerCase: 6 }, { bblPerUnit: 0.1 }, { basis: "packaged" }]) {
    await expect(runCommand("upsert_format", { ...input(), ...invalid }, ctx)).rejects.toMatchObject({ code: "invalid_input" });
  }
  for (const invalid of [{ p_name: " " }, { p_price_group: null }, { p_ounces: null }, { p_ounces: 0 }, { p_ounces: -1 }, { p_ounces: "Infinity" }, { p_ounces: "-Infinity" }, { p_ounces: "NaN" }, { p_package_type: "can" }, { p_keg_size: "half_bbl" }, { p_units_per_case: 6 }, { p_bbl_per_unit: 0.1 }, { p_basis: "packaged" }]) {
    expect((await rpc(invalid)).error).not.toBeNull();
  }
});

it("allows each price group its own Pint, edits ounces, and binds replay to group and size", async () => {
  const otherGroup = await runCommand("upsert_price_group", { name: "2", position: 2 }, ctx) as { id: string };
  const request = crypto.randomUUID();
  const first = await rpc({ p_name: "Pint", p_request_id: request });
  expect(first.error).toBeNull();
  expect(first.data).toMatchObject({ price_group_id: groupId, brand_id: null, ounces: 16, bbl_per_unit: null });
  expect((await rpc({ p_name: "Pint", p_request_id: request })).data).toEqual(first.data);
  expect((await rpc({ p_name: "Pint", p_request_id: request, p_ounces: 12 })).error?.message).toMatch(/request|payload/i);
  expect((await rpc({ p_name: "Pint", p_request_id: request, p_price_group: otherGroup.id })).error).not.toBeNull();
  await expect(runCommand("upsert_format", input(), ctx)).rejects.toThrow();
  await expect(runCommand("upsert_format", { ...input(), priceGroupId: otherGroup.id, ounces: 12 }, ctx)).resolves.toMatchObject({ price_group_id: otherGroup.id, ounces: 12 });
  await expect(runCommand("upsert_format", { ...input(), id: first.data.id, ounces: 14 }, ctx)).resolves.toMatchObject({ id: first.data.id, ounces: 14 });
  const foreign = await makeStaffCtx((await makeBrewery()).id);
  const foreignGroup = await runCommand("upsert_price_group", { name: "1", position: 1 }, foreign) as { id: string };
  expect((await rpc({ p_price_group: foreignGroup.id })).error).not.toBeNull();
  const foreignPour = await runCommand("upsert_format", { ...input(), priceGroupId: foreignGroup.id }, foreign) as { id: string };
  expect((await ctx.db.from("formats").select("id").eq("id", foreignPour.id)).data).toEqual([]);
  const packaged = { name: "Pint", basis: "packaged", bblPerUnit: 0.1 };
  await expect(runCommand("upsert_format", packaged, ctx)).resolves.toMatchObject({ brand_id: null, ounces: null });
  await expect(runCommand("upsert_format", packaged, ctx)).rejects.toThrow();
  expect((await rpc({ p_name: "Pint", p_request_id: request })).data).toEqual(first.data);
  const taproom = await makeStaffCtx(ctx.breweryId, "taproom");
  await expect(runCommand("list_formats", { brandId }, taproom)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: first.data.id, ounces: 14 })]));
  const foreignBrand = await runCommand("upsert_brand", { name: "Foreign" }, foreign) as { id: string };
  await expect(runCommand("list_formats", { brandId: foreignBrand.id }, taproom)).resolves.toEqual([]);
  await expect(runCommand("upsert_format", input(), taproom)).rejects.toMatchObject({ code: "permission_denied" });
  expect((await taproom.db.rpc("upsert_format", { p_brewery: ctx.breweryId, p_id: null, p_name: "Taster", p_basis: "poured", p_package_type: null, p_keg_size: null, p_units_per_case: null, p_bbl_per_unit: null, p_price_group: groupId, p_ounces: 4, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
});

it("keeps pours out of SKUs, components and BOM, including direct rows and conversions", async () => {
  const pour = (await rpc()).data;
  expect(pour).toBeTruthy();
  const pack = await runCommand("upsert_format", { name: "Case", basis: "packaged" }, ctx) as { id: string };
  const materialId = await seedMaterial(ctx.breweryId, { name: "Tray", category: "packaging" });
  await expect(runCommand("create_sku", { brandId, formatId: pour.id }, ctx)).rejects.toThrow(/packaged/);
  for (const [formatId, childFormatId] of [[pack.id, pour.id], [pour.id, pack.id]]) {
    await expect(runCommand("replace_format_components", { formatId, components: [{ childFormatId, qty: 1 }] }, ctx)).rejects.toThrow(/packaged/);
    expect((await admin.from("format_components").insert({ brewery_id: ctx.breweryId, parent_format_id: formatId, child_format_id: childFormatId, qty: 1 })).error).not.toBeNull();
  }
  await expect(runCommand("replace_format_bom", { formatId: pour.id, lines: [{ materialId, qtyPerUnit: 1 }] }, ctx)).rejects.toThrow(/packaged/);
  await expect(runCommand("replace_format_bom", { formatId: pour.id, lines: [] }, ctx)).rejects.toThrow(/packaged/);
  expect((await admin.from("format_bom").insert({ brewery_id: ctx.breweryId, format_id: pour.id, material_id: materialId, qty_per_unit: 1 })).error).not.toBeNull();
  expect((await admin.from("skus").insert({ brewery_id: ctx.breweryId, brand_id: brandId, format_id: pour.id, name: "Invalid" })).error).not.toBeNull();
  await runCommand("replace_format_bom", { formatId: pack.id, lines: [{ materialId, qtyPerUnit: 1 }] }, ctx);
  await expect(runCommand("upsert_format", { ...input(), id: pack.id, name: "Converted" }, ctx)).rejects.toThrow(/packaged|use/i);
  const atomic = await runCommand("upsert_format", { name: "Can", basis: "packaged", bblPerUnit: 0.01 }, ctx) as { id: string };
  await runCommand("create_sku", { brandId, formatId: atomic.id }, ctx);
  await expect(runCommand("upsert_format", { ...input(), id: atomic.id, name: "Converted SKU" }, ctx)).rejects.toThrow(/packaged|use/i);
  await runCommand("replace_format_components", { formatId: pack.id, components: [{ childFormatId: atomic.id, qty: 6 }] }, ctx);
  expect((await admin.from("formats").update({ basis: "poured", price_group_id: groupId, ounces: 16 }).eq("id", pack.id)).error).not.toBeNull();
});

it("deletes an unused pour and refuses one a cell prices", async () => {
  const adminCtx = await makeStaffCtx(ctx.breweryId, "admin");
  const unused = await runCommand("upsert_format", { name: `Drop ${crypto.randomUUID()}`, basis: "poured", priceGroupId: groupId, ounces: 10 }, ctx) as { id: string };
  expect(await runCommand("delete_format", { formatId: unused.id }, ctx)).toMatchObject({ id: unused.id });
  const priced = await runCommand("upsert_format", { name: `Keep ${crypto.randomUUID()}`, basis: "poured", priceGroupId: groupId, ounces: 12 }, ctx) as { id: string };
  const channel = (await runCommand("list_sale_channels", {}, ctx) as { id: string }[])[0]!;
  await runCommand("set_channel_price", { saleChannelId: channel.id, priceGroupId: groupId, formatId: priced.id, unitPriceCents: 700 }, ctx);
  await expect(runCommand("delete_format", { formatId: priced.id }, ctx)).rejects.toThrow(/in use/);
  await expect(runCommand("delete_format", { formatId: (await runCommand("upsert_format", { name: "Can pack", basis: "packaged", bblPerUnit: 0.01 }, adminCtx) as { id: string }).id }, ctx)).rejects.toMatchObject({ code: "permission_denied" });
});

it("returns a complete group pour vocabulary beyond the API cap", async () => {
  const group = await runCommand("upsert_price_group", { name: "large", position: 9 }, ctx) as { id: string };
  const brand = await runCommand("upsert_brand", { name: "Large menu", priceGroupId: group.id }, ctx) as { id: string };
  expect((await admin.from("formats").insert(Array.from({ length: 1001 }, (_, i) => ({ brewery_id: ctx.breweryId, price_group_id: group.id, basis: "poured", ounces: 4, name: `Taster ${i}` })))).error).toBeNull();
  const result = await runCommand("list_formats", { brandId: brand.id }, ctx) as unknown[];
  expect(result).toHaveLength(1001);
});
