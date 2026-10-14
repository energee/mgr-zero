// tests/price-group-barcodes.test.ts — a UPC per price group × format
// (docs/plans/price-group-barcodes.md; spec 2026-09-07-mgr-price-groups.md D3):
// set, replace, clear, refusals, roles, replay, staff-only reads, and the
// barcodes leaving with their group.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, asUser, makeBrewery, makeCustomerUser, makeStaffCtx, seedCatalog, seedCustomer, seedPriceGroup } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

type Ctx = Awaited<ReturnType<typeof makeStaffCtx>>;
let breweryId: string;
let owner: Ctx;
let sales: Ctx;
let brewer: Ctx;
let group: string;
let can: string;

const once = (requestId: string) => ({ requestId, correlationId: requestId });
const set = (input: Record<string, unknown>, ctx: Ctx = sales, exec?: ReturnType<typeof once>) =>
  runCommand("set_price_group_barcode", { priceGroupId: group, formatId: can, ...input }, ctx, exec);
const stored = async () => (await admin.from("price_group_barcodes").select("upc").eq("price_group_id", group).eq("format_id", can)).data ?? [];

beforeAll(async () => {
  breweryId = (await makeBrewery()).id;
  owner = await makeStaffCtx(breweryId, "admin");
  sales = await makeStaffCtx(breweryId, "sales");
  brewer = await makeStaffCtx(breweryId, "brewer");
  group = await seedPriceGroup(breweryId, "Tier 1", 1);
  can = (await seedCatalog(breweryId, { product: "Alma", sku: "Alma case", packageType: "can", priceGroupId: group })).formatId;
});

describe("set_price_group_barcode", () => {
  it("sets, replaces and clears one group × format code, keeping leading zeros", async () => {
    expect(await set({ upc: " 850051366040 " })).toMatchObject({ price_group_id: group, format_id: can, upc: "850051366040" });
    await set({ upc: "00810123450127" });
    expect(await stored()).toEqual([{ upc: "00810123450127" }]);
    expect(await set({ upc: null })).toEqual({ cleared: true });
    expect(await stored()).toEqual([]);
  });

  it("lets one code cover several formats of the same group", async () => {
    const other = (await seedCatalog(breweryId, { product: "Samo", sku: "Samo pack", packageType: "can", format: "Four Pack", priceGroupId: group })).formatId;
    await set({ upc: "850051366040" });
    await set({ formatId: other, upc: "850051366040" });
    const rows = (await admin.from("price_group_barcodes").select("upc").eq("price_group_id", group)).data!;
    expect(rows).toHaveLength(2);
  });

  it("refuses a malformed code, a pour, another brewery's group, and a brewer", async () => {
    await expect(set({ upc: "12345" })).rejects.toThrow();
    const pour = (await runCommand("upsert_format", { name: "Glass", basis: "poured", priceGroupId: group, ounces: 16 }, owner)) as { id: string };
    await expect(set({ formatId: pour.id, upc: "850051366040" })).rejects.toThrow(/packaged/);
    const foreign = await seedPriceGroup((await makeBrewery()).id, "Theirs", 1);
    await expect(set({ priceGroupId: foreign, upc: "850051366040" })).rejects.toThrow(/price group not found/);
    await expect(set({ upc: "850051366040" }, brewer)).rejects.toThrow(/permission denied/);
  });

  it("replays a request", async () => {
    const id = crypto.randomUUID();
    const first = await set({ upc: "860009737631" }, sales, once(id));
    expect(await set({ upc: "860009737631" }, sales, once(id))).toEqual(first);
  });
});

describe("reading barcodes", () => {
  it("list_price_group_barcodes lists the brewery's codes for sales and refuses a brewer", async () => {
    await set({ upc: "850051366040" });
    expect(await runCommand("list_price_group_barcodes", {}, sales)).toContainEqual({ price_group_id: group, format_id: can, upc: "850051366040" });
    await expect(runCommand("list_price_group_barcodes", {}, brewer)).rejects.toThrow();
  });

  it("list_price_groups and list_brands stay lean: codes come only from list_price_group_barcodes", async () => {
    await set({ upc: "850051366040" });
    const groups = (await runCommand("list_price_groups", {}, sales)) as Record<string, unknown>[];
    expect(groups.find((g) => g.id === group)).not.toHaveProperty("price_group_barcodes");
    const brands = (await runCommand("list_brands", {}, sales)) as { name: string; price_groups: Record<string, unknown> | null }[];
    expect(brands.find((b) => b.name === "Alma")?.price_groups).toEqual({ name: "Tier 1" });
  });

  it("a formats → price_groups embed is unambiguous with barcodes present", async () => {
    await set({ upc: "850051366040" });
    const formats = (await runCommand("list_formats", {}, sales)) as { id: string }[];
    expect(formats.some((f) => f.id === can)).toBe(true);
    const plain = await admin.from("formats").select("id, price_groups(name)").eq("brewery_id", breweryId);
    expect(plain.error).toBeNull();
  });

  it("a brewer and a portal customer read no barcode row", async () => {
    await set({ upc: "850051366040" });
    expect((await brewer.db.from("price_group_barcodes").select("upc").eq("brewery_id", breweryId)).data ?? []).toEqual([]);
    const { customerId } = await seedCustomer(breweryId, { name: "Barcode buyer" });
    const customer = await asUser((await makeCustomerUser(customerId)).email);
    expect((await customer.from("price_group_barcodes").select("upc")).data ?? []).toEqual([]);
  });

  it("a deleted group takes its barcodes with it", async () => {
    const lone = await seedPriceGroup(breweryId, "Lone", 9);
    await set({ priceGroupId: lone, upc: "850051366040" });
    await runCommand("delete_price_group", { priceGroupId: lone }, owner);
    expect((await admin.from("price_group_barcodes").select("upc").eq("price_group_id", lone)).data).toEqual([]);
  });
});
