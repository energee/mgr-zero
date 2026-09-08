// tests/compliance.test.ts — Program 9: the compliance registry (brand
// approvals, state registrations, brewery licenses), the period report
// generated from the movement ledger, the immutable filed snapshot, and the
// lot trace. MGR never transmits a filing.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, channelId, makeBrewery, makeStaffCtx, seedCatalog, seedLocation } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";

let b: { id: string };
let sales: Awaited<ReturnType<typeof makeStaffCtx>>;
let brandId: string;

beforeAll(async () => {
  b = await makeBrewery();
  sales = await makeStaffCtx(b.id, "sales");
  ({ brandId } = await seedCatalog(b.id, { product: "Stout", sku: "Stout case" }));
});

describe("registry", () => {
  it("sales records a COLA on a brand, a second identical one conflicts, warehouse is denied", async () => {
    const saved = await runCommand("upsert_brand_approval", { brandId, kind: "cola", ttbId: "23001001000123", approvedOn: "2026-01-15" }, sales) as { id: string; ttb_id: string };
    expect(saved.ttb_id).toBe("23001001000123");
    // editing by id keeps the row
    const edited = await runCommand("upsert_brand_approval", { id: saved.id, brandId, kind: "cola", ttbId: "23001001000123", expiresOn: "2031-01-15" }, sales) as { id: string; expires_on: string };
    expect(edited).toMatchObject({ id: saved.id, expires_on: "2031-01-15" });
    // a new row with the same (brand, kind, ttb id) is the same approval
    await expect(runCommand("upsert_brand_approval", { brandId, kind: "cola", ttbId: "23001001000123" }, sales)).rejects.toMatchObject({ status: 409 });
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("upsert_brand_approval", { brandId, kind: "formula", ttbId: "F-1" }, warehouse)).rejects.toMatchObject({ status: 403 });
  });

  it("state registrations and licenses upsert by their natural key and the registry lists all three", async () => {
    await runCommand("upsert_state_registration", { brandId, state: "OH", registrationNo: "OH-1" }, sales);
    const again = await runCommand("upsert_state_registration", { brandId, state: "OH", registrationNo: "OH-2", expiresOn: "2026-12-31" }, sales) as { registration_no: string };
    expect(again.registration_no).toBe("OH-2");
    await expect(runCommand("upsert_state_registration", { brandId, state: "Ohio" }, sales)).rejects.toBeTruthy();
    await runCommand("upsert_brewery_state_license", { state: "PA", kind: "brewery", licenseNo: "G-21884", expiresOn: "2027-06-30" }, sales);
    const relicensed = await runCommand("upsert_brewery_state_license", { state: "PA", kind: "brewery", licenseNo: "G-21885" }, sales) as { license_no: string };
    expect(relicensed.license_no).toBe("G-21885");

    const reg = await runCommand("get_compliance_registry", {}, sales) as {
      brands: { id: string; name: string; approvals: { kind: string; ttb_id: string }[]; registrations: { state: string; registration_no: string | null }[] }[];
      licenses: { state: string; kind: string; license_no: string | null }[];
    };
    const stout = reg.brands.find((x) => x.id === brandId)!;
    expect(stout.approvals).toEqual([expect.objectContaining({ kind: "cola", ttb_id: "23001001000123" })]);
    expect(stout.registrations).toEqual([expect.objectContaining({ state: "OH", registration_no: "OH-2" })]);
    expect(reg.licenses).toEqual([expect.objectContaining({ state: "PA", kind: "brewery", license_no: "G-21885" })]);
    expect((await admin.from("state_registrations").select("id").eq("brand_id", brandId)).data!.length).toBe(1);
  });
});

type Line = { class: string; begin: number; in: number; out: number; end: number };
type Report = { figures: { lines: Line[]; removals: Record<string, number>; byState: Record<string, number>; packaged: number; inProcess: number; balances: boolean }; warnings: string[] };

describe("generate_compliance_report", () => {
  const PERIOD = { jurisdiction: "TTB", periodStart: "2026-09-01", periodEnd: "2026-09-30" };
  let canSku: string, kegSku: string, loc: { id: string; binId: string }, wholesale: string, exportCh: string;

  beforeAll(async () => {
    ({ skuId: canSku } = await seedCatalog(b.id, { product: "Report Pils", sku: "Pils case", packageType: "can", bblPerUnit: 0.0645 }));
    ({ skuId: kegSku } = await seedCatalog(b.id, { product: "Report Kolsch", sku: "Kolsch keg", packageType: "keg", bblPerUnit: 0.5 }));
    loc = await seedLocation(b.id, { name: "Report warehouse" });
    wholesale = await channelId(b.id, "Wholesale");
    exportCh = await channelId(b.id, "Export");
    const base = { brewery_id: b.id, location_id: loc.id, bin_id: loc.binId, created_by: sales.userId };
    const { error } = await admin.from("inventory_movements").insert([
      { ...base, sku_id: canSku, qty: 100, type: "opening_balance", created_at: "2026-08-15T12:00:00Z" },
      { ...base, sku_id: kegSku, qty: 10, type: "opening_balance", created_at: "2026-08-15T12:00:00Z" },
      { ...base, sku_id: canSku, qty: 50, type: "production_in", created_at: "2026-09-03T12:00:00Z" },
      { ...base, sku_id: canSku, qty: -20, type: "sale_removal", sale_channel_id: wholesale, tax_treatment: "taxable", dest_state: "PA", created_at: "2026-09-10T12:00:00Z" },
      { ...base, sku_id: canSku, qty: -10, type: "sale_removal", sale_channel_id: exportCh, tax_treatment: "export", dest_state: "PA", created_at: "2026-09-12T12:00:00Z" },
      { ...base, sku_id: kegSku, qty: -2, type: "sale_removal", sale_channel_id: wholesale, tax_treatment: "taxable", dest_state: "OH", created_at: "2026-09-14T12:00:00Z" },
      { ...base, sku_id: canSku, qty: -1, type: "sample", dest_state: "PA", created_at: "2026-09-15T12:00:00Z" },
      // next month: must not appear
      { ...base, sku_id: canSku, qty: -5, type: "sale_removal", sale_channel_id: wholesale, tax_treatment: "taxable", dest_state: "PA", created_at: "2026-10-02T12:00:00Z" },
    ]);
    expect(error).toBeNull();
  });

  it("cross-foots every package class from the ledger and keys removals by frozen tax treatment", async () => {
    const r = await runCommand("generate_compliance_report", PERIOD, sales) as Report;
    const by = Object.fromEntries(r.figures.lines.map((l) => [l.class, l]));
    expect(Object.keys(by).sort()).toEqual(["bottle", "can", "keg"]);
    // cans: 100 × 0.0645 = 6.45 begin; +50 = 3.23 in; −31 = 2.00 out; end 7.68
    expect(by.can).toMatchObject({ begin: 6.45, in: 3.23, out: 2, end: 7.68 });
    expect(by.keg).toMatchObject({ begin: 5, in: 0, out: 1, end: 4 });
    expect(by.bottle).toMatchObject({ begin: 0, in: 0, out: 0, end: 0 });
    expect(r.figures.removals).toMatchObject({ taxable: 2.29, export: 0.65, sample: 0.06 });
    expect(r.figures.byState).toEqual({ PA: 1.29, OH: 1 });
    expect(r.figures.packaged).toBe(3.23);
    expect(r.figures.balances).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("a later channel edit does not move a figure: the treatment is frozen on the movement", async () => {
    await admin.from("sale_channels").update({ tax_treatment: "taxable" }).eq("id", exportCh);
    const r = await runCommand("generate_compliance_report", PERIOD, sales) as Report;
    expect(r.figures.removals.export).toBe(0.65);
    await admin.from("sale_channels").update({ tax_treatment: "export" }).eq("id", exportCh);
  });

  it("warehouse cannot generate", async () => {
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("generate_compliance_report", PERIOD, warehouse)).rejects.toMatchObject({ status: 403 });
  });
});
