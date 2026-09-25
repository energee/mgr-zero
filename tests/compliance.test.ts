// tests/compliance.test.ts — Program 9: the compliance registry (brand
// approvals, state registrations, brewery licenses), the period report
// generated from the movement ledger, the immutable filed snapshot, and the
// lot trace. MGR never transmits a filing.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, channelId, insertFixture, makeBrewery, makeStaffCtx, seedCatalog, seedLocation, sql } from "./helpers";
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
    const again = await runCommand("upsert_state_registration", { brandId, state: "OH", registrationNo: "OH-2", expiresOn: "2025-12-31" }, sales) as { registration_no: string };
    expect(again.registration_no).toBe("OH-2");
    await expect(runCommand("upsert_state_registration", { brandId, state: "Ohio" }, sales)).rejects.toBeTruthy();
    await runCommand("upsert_brewery_state_license", { state: "PA", kind: "brewery", licenseNo: "G-21884", expiresOn: "2027-06-30" }, sales);
    const relicensed = await runCommand("upsert_brewery_state_license", { state: "PA", kind: " Brewery", licenseNo: "G-21885" }, sales) as { license_no: string; kind: string };
    expect(relicensed).toMatchObject({ license_no: "G-21885", kind: "brewery" });

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

  it("an upsert keeps a field the caller omits and clears one sent as null (#522)", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Keep Porter", sku: "Keep Porter case" });
    const approval = await runCommand("upsert_brand_approval", { brandId: brand, kind: "cola", ttbId: "K-1", approvedOn: "2026-01-02", expiresOn: "2030-01-02", note: "label v2" }, sales) as { id: string };
    expect(await runCommand("upsert_brand_approval", { id: approval.id, brandId: brand, kind: "cola", ttbId: "K-1" }, sales))
      .toMatchObject({ approved_on: "2026-01-02", expires_on: "2030-01-02", note: "label v2" });
    expect(await runCommand("upsert_brand_approval", { id: approval.id, brandId: brand, kind: "cola", ttbId: "K-1", expiresOn: null, note: null }, sales))
      .toMatchObject({ approved_on: "2026-01-02", expires_on: null, note: null });

    await runCommand("upsert_state_registration", { brandId: brand, state: "MI", registrationNo: "MI-1", approvedOn: "2026-02-03", expiresOn: "2027-02-03" }, sales);
    expect(await runCommand("upsert_state_registration", { brandId: brand, state: "MI", expiresOn: "2028-02-03" }, sales))
      .toMatchObject({ registration_no: "MI-1", approved_on: "2026-02-03", expires_on: "2028-02-03" });
    expect(await runCommand("upsert_state_registration", { brandId: brand, state: "MI", registrationNo: null, approvedOn: null }, sales))
      .toMatchObject({ registration_no: null, approved_on: null, expires_on: "2028-02-03" });

    await runCommand("upsert_brewery_state_license", { state: "MI", kind: "keep", licenseNo: "L-1", expiresOn: "2027-06-30", note: "renew online" }, sales);
    expect(await runCommand("upsert_brewery_state_license", { state: "MI", kind: "keep", licenseNo: "L-2" }, sales))
      .toMatchObject({ license_no: "L-2", expires_on: "2027-06-30", note: "renew online" });
    expect(await runCommand("upsert_brewery_state_license", { state: "MI", kind: "keep", expiresOn: null, note: null }, sales))
      .toMatchObject({ license_no: "L-2", expires_on: null, note: null });
  });
});

const SEPT = { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" };
type Line = { class: string; begin: number; in: number; out: number; end: number };
type Report = { figures: { lines: Line[]; removals: Record<string, number>; byState: Record<string, number>; packaged: number; inProcess: number; balances: boolean }; warnings: string[] };

describe("generate_compliance_report", () => {
  const PERIOD = SEPT;
  let canSku: string, kegSku: string, loc: { id: string; binId: string }, wholesale: string, exportCh: string;

  beforeAll(async () => {
    ({ skuId: canSku } = await seedCatalog(b.id, { product: "Report Pils", sku: "Pils case", packageType: "can", bblPerUnit: 0.0645 }));
    ({ skuId: kegSku } = await seedCatalog(b.id, { product: "Report Kolsch", sku: "Kolsch keg", packageType: "keg", bblPerUnit: 0.5 }));
    loc = await seedLocation(b.id, { name: "Report warehouse" });
    wholesale = await channelId(b.id, "Wholesale");
    exportCh = await channelId(b.id, "Export");
    const base = { brewery_id: b.id, location_id: loc.id, bin_id: loc.binId, created_by: sales.userId };
    expect(() => insertFixture("inventory_movements", [
      { ...base, sku_id: canSku, qty: 100, type: "opening_balance", created_at: "2025-08-15T12:00:00Z" },
      { ...base, sku_id: kegSku, qty: 10, type: "opening_balance", created_at: "2025-08-15T12:00:00Z" },
      { ...base, sku_id: canSku, qty: 50, type: "production_in", created_at: "2025-09-03T12:00:00Z" },
      { ...base, sku_id: canSku, qty: -20, type: "sale_removal", sale_channel_id: wholesale, tax_treatment: "taxable", dest_state: "PA", created_at: "2025-09-10T12:00:00Z" },
      { ...base, sku_id: canSku, qty: -10, type: "sale_removal", sale_channel_id: exportCh, tax_treatment: "export", dest_state: "PA", created_at: "2025-09-12T12:00:00Z" },
      { ...base, sku_id: kegSku, qty: -2, type: "sale_removal", sale_channel_id: wholesale, tax_treatment: "taxable", dest_state: "OH", created_at: "2025-09-14T12:00:00Z" },
      { ...base, sku_id: canSku, qty: -1, type: "sample", dest_state: "PA", created_at: "2025-09-15T12:00:00Z" },
      // next month: must not appear
      { ...base, sku_id: canSku, qty: -5, type: "sale_removal", sale_channel_id: wholesale, tax_treatment: "taxable", dest_state: "PA", created_at: "2025-10-02T12:00:00Z" },
    ])).not.toThrow();
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

  it("prints cells that foot as printed, and a repack across package classes is the one thing that breaks the balance", async () => {
    // 107 + 3 units of 0.0645 bbl: 6.9015 + 0.1935 = 7.095; rounded on their own the cells would not foot (6.90 + 0.19 ≠ 7.10)
    const other = await makeBrewery();
    const ctx = await makeStaffCtx(other.id, "admin");
    const { skuId } = await seedCatalog(other.id, { sku: "Foot case", packageType: "can", bblPerUnit: 0.0645 });
    const kegSkuId = (await seedCatalog(other.id, { product: "Foot Keg", sku: "Foot keg", packageType: "keg", bblPerUnit: 0.5 })).skuId;
    const l = await seedLocation(other.id);
    const base = { brewery_id: other.id, location_id: l.id, bin_id: l.binId, created_by: ctx.userId };
    insertFixture("inventory_movements", [
      { ...base, sku_id: skuId, qty: 107, type: "opening_balance", created_at: "2025-08-15T12:00:00Z" },
      { ...base, sku_id: skuId, qty: 3, type: "production_in", created_at: "2025-09-03T12:00:00Z" },
    ]);
    const r = await runCommand("generate_compliance_report", PERIOD, ctx) as Report;
    for (const line of r.figures.lines) expect(line.begin + line.in - line.out).toBeCloseTo(line.end, 10);
    expect(r.figures.balances).toBe(true);
    // a keg repacked into cans moves beer between classes without a removal: the identity breaks and the month says which class
    insertFixture("inventory_movements", [
      { ...base, sku_id: kegSkuId, qty: 1, type: "opening_balance", created_at: "2025-08-15T12:00:00Z" },
      { ...base, sku_id: kegSkuId, qty: -1, type: "repack", created_at: "2025-09-04T12:00:00Z" },
      { ...base, sku_id: skuId, qty: 7, type: "repack", created_at: "2025-09-04T12:00:00Z" },
    ]);
    const broken = await runCommand("generate_compliance_report", PERIOD, ctx) as Report;
    expect(broken.figures.balances).toBe(false);
    expect(broken.warnings).toEqual(["keg does not balance", "can does not balance"]);
    await expect(runCommand("file_compliance_report", PERIOD, ctx)).rejects.toThrow(/does not balance: keg does not balance; can does not balance/);
  });

  it("a month's printed end is the next month's printed begin, and each month still foots as printed (#435)", async () => {
    // 10.004 bbl opens in August, 0.004 arrives in September and again in October. Rounding each cell on its own
    // printed September as 10.00 + 0.00 = 10.00 while October began at round(10.008) = 10.01.
    const other = await makeBrewery();
    const ctx = await makeStaffCtx(other.id, "admin");
    const { skuId } = await seedCatalog(other.id, { sku: "Chain case", packageType: "can", bblPerUnit: 0.004 });
    const l = await seedLocation(other.id);
    const base = { brewery_id: other.id, location_id: l.id, bin_id: l.binId, created_by: ctx.userId, sku_id: skuId };
    insertFixture("inventory_movements", [
      { ...base, qty: 2501, type: "opening_balance", created_at: "2026-08-15T12:00:00Z" },
      { ...base, qty: 1, type: "production_in", created_at: "2026-09-03T12:00:00Z" },
      { ...base, qty: 1, type: "production_in", created_at: "2026-10-03T12:00:00Z" },
    ]);
    const month = (periodStart: string, periodEnd: string) =>
      runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart, periodEnd }, ctx) as Promise<Report>;
    const [aug, sep, oct] = [await month("2026-08-01", "2026-08-31"), await month("2026-09-01", "2026-09-30"), await month("2026-10-01", "2026-10-31")];
    for (const [prev, next] of [[aug, sep], [sep, oct]]) {
      const nextBy = Object.fromEntries(next.figures.lines.map((x) => [x.class, x]));
      for (const line of prev.figures.lines) expect(nextBy[line.class].begin, line.class).toBe(line.end);
    }
    for (const r of [aug, sep, oct]) {
      for (const line of r.figures.lines) expect(line.begin + line.in - line.out).toBeCloseTo(line.end, 10);
      expect(r.figures.balances).toBe(true);
    }
    expect(sep.figures.lines.find((x) => x.class === "can")).toMatchObject({ begin: 10, in: 0.01, out: 0, end: 10.01 });
  });

  it("the removal lines foot to the printed Out (#533)", async () => {
    // 10 bbl opens; 0.005 bbl leaves as a sample and 0.005 is destroyed. Out prints 10.00 − 9.99 = 0.01, but rounding
    // each removal on its own printed 0.01 + 0.01. The rounded Out is allocated by largest remainder instead.
    const other = await makeBrewery();
    const ctx = await makeStaffCtx(other.id, "admin");
    const { skuId } = await seedCatalog(other.id, { sku: "Foot removals", packageType: "can", bblPerUnit: 0.005 });
    const l = await seedLocation(other.id);
    const base = { brewery_id: other.id, location_id: l.id, bin_id: l.binId, created_by: ctx.userId, sku_id: skuId };
    insertFixture("inventory_movements", [
      { ...base, qty: 2000, type: "opening_balance", created_at: "2025-08-15T12:00:00Z" },
      { ...base, qty: -1, type: "sample", dest_state: "PA", created_at: "2025-09-10T12:00:00Z" },
      { ...base, qty: -1, type: "destruction", created_at: "2025-09-11T12:00:00Z" },
    ]);
    const r = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2025-09-01", periodEnd: "2025-09-30" }, ctx) as Report;
    const out = r.figures.lines.reduce((sum, line) => sum + line.out, 0);
    const removed = Object.values(r.figures.removals).reduce((sum, v) => sum + Number(v), 0);
    expect(out).toBeCloseTo(0.01, 10);
    expect(removed).toBeCloseTo(out, 10);
  });

  it("warehouse cannot generate", async () => {
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    await expect(runCommand("generate_compliance_report", PERIOD, warehouse)).rejects.toMatchObject({ status: 403 });
  });
});

describe("file_compliance_report", () => {
  const PERIOD = SEPT;
  const exec = (requestId: string) => ({ requestId, correlationId: crypto.randomUUID() });

  it("files the generated figures as an immutable snapshot, replays by request id, and refuses a second filing of the period", async () => {
    const requestId = crypto.randomUUID();
    const filed = await runCommand("file_compliance_report", { ...PERIOD, note: "filed on pay.gov" }, sales, exec(requestId)) as { id: string; figures: Report["figures"]; filed_by: string };
    expect(filed.figures.balances).toBe(true);
    expect(filed.filed_by).toBe(sales.userId);
    expect(filed.figures.removals.taxable).toBe(2.29);
    // zeros are 0.00 in the stored snapshot, never blank
    const [text] = sql(`select figures::text from report_filings where id = '${filed.id}'`);
    expect(text).toContain('"begin": 0.00');
    // the same request id returns the same filing
    const again = await runCommand("file_compliance_report", { ...PERIOD, note: "filed on pay.gov" }, sales, exec(requestId)) as { id: string };
    expect(again.id).toBe(filed.id);
    // a new request for the same period is a second filing: refused
    await expect(runCommand("file_compliance_report", PERIOD, sales, exec(crypto.randomUUID()))).rejects.toMatchObject({ status: 409 });
    // a TTB range that is not one calendar month, quarter, or year would overlap the real periods: refused by the schema and by the RPC (#486)
    await expect(runCommand("file_compliance_report", { ...PERIOD, periodStart: "2025-09-15", periodEnd: "2025-10-15" }, sales)).rejects.toThrow(/one calendar month, quarter, or year/);
    for (const [p_start, p_end] of [["2025-10-10", "2025-10-20"], ["2025-02-01", "2025-04-30"], ["2025-01-01", "2025-12-30"]]) {
      const { error } = await sales.db.rpc("file_compliance_report", { p_brewery: sales.breweryId, p_jurisdiction: "TTB", p_start, p_end, p_note: null, p_request_id: crypto.randomUUID() });
      expect(error?.message, `${p_start}..${p_end}`).toMatch(/one calendar month, quarter, or year/);
    }
  });

  it("refuses to file a period that has not ended in the brewery's calendar (#429)", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id, "admin");
    const [start, end] = sql(`select concat_ws('|', date_trunc('month', (now() at time zone timezone)::date)::date,
      (date_trunc('month', (now() at time zone timezone)::date) + interval '1 month - 1 day')::date) from breweries where id='${brewery.id}'`, true)[0].split("|");
    await expect(runCommand("file_compliance_report", { jurisdiction: "TTB", periodStart: start, periodEnd: end }, owner)).rejects.toThrow(/has not ended/);
    expect(sql(`select count(*) from report_filings where brewery_id='${brewery.id}'`, true)).toEqual(["0"]);
  });

  it("a movement added after filing does not change the snapshot, and the list shows the filing", async () => {
    const { data: filedRow } = await admin.from("report_filings").select("id, figures").eq("brewery_id", b.id).eq("period_start", "2025-09-01").single();
    const [loc] = (await admin.from("locations").select("id, bins(id)").eq("brewery_id", b.id).limit(1)).data as unknown as { id: string; bins: { id: string }[] }[];
    const { data: sku } = await admin.from("skus").select("id").eq("brewery_id", b.id).limit(1).single();
    insertFixture("inventory_movements", { brewery_id: b.id, sku_id: sku!.id, location_id: loc.id, bin_id: loc.bins[0].id, qty: 7, type: "opening_balance", created_by: sales.userId, created_at: "2025-09-20T12:00:00Z" });
    const live = await runCommand("generate_compliance_report", SEPT, sales) as Report;
    const { data: after } = await admin.from("report_filings").select("figures").eq("id", filedRow!.id).single();
    expect(after!.figures).toEqual(filedRow!.figures);
    expect(live.figures).not.toEqual(filedRow!.figures);
    const { filings, today } = await runCommand("list_compliance_reports", {}, sales) as { filings: { period_start: string; filed_at: string | null }[]; today: string };
    expect(filings.map((f) => f.period_start)).toEqual(["2025-09-01"]);
    const one = await runCommand("list_compliance_reports", { jurisdiction: "TTB", periodStart: "2025-09-01" }, sales) as { filings: unknown[] };
    expect(one.filings.length).toBe(1);
    const none = await runCommand("list_compliance_reports", { jurisdiction: "US-PA" }, sales) as { filings: unknown[] };
    expect(none.filings).toEqual([]);
    expect(filings[0].filed_at).toBeTruthy();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("an empty brewery files zeros: a report with nothing in it still balances", async () => {
    const empty = await makeBrewery();
    const ctx = await makeStaffCtx(empty.id, "admin");
    // a different jurisdiction may cover the same days as a TTB month
    const filed = await runCommand("file_compliance_report", { jurisdiction: "US-PA", periodStart: "2025-08-01", periodEnd: "2025-08-31" }, ctx) as { figures: Report["figures"] };
    expect(filed.figures.lines.map((l) => l.end)).toEqual([0, 0, 0]);
  });
});

describe("trace_lot", () => {
  it("follows the lot to its run, tank, and batch, and lists every ledger movement tagged with it", async () => {
    const brewer = await makeStaffCtx(b.id, "brewer");
    const cat = await seedCatalog(b.id, { product: "Trace Porter", sku: "Porter case", packageType: "can", bblPerUnit: 0.0645 });
    const loc = await seedLocation(b.id, { name: "Trace warehouse" });
    const vessel = await runCommand("upsert_vessel", { name: "FV-TRACE", kind: "fermenter", capacityBbl: 60 }, brewer) as { id: string };
    const batch = await runCommand("schedule_batch", { plannedOn: "2025-11-01", plannedBbl: 30, intendedBrandId: cat.brandId }, brewer) as { id: string; batch_no: number };
    const dayOut = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 30, brewedOn: "2025-11-01" }, brewer) as { occupancy: { id: string } };
    const run = await runCommand("schedule_packaging_run", { brandId: cat.brandId, plannedOn: "2025-12-01", occupancyId: dayOut.occupancy.id, outputs: [{ skuId: cat.skuId, qtyPlanned: 400 }] }, brewer) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2025-12-01T14:00:00Z" }, brewer);
    await runCommand("close_packaging_run", { runId: run.id, bblDrawn: 25, outputs: [{ skuId: cat.skuId, qtyActual: 396 }], lotCode: "L-261201-TP", packagedOn: "2025-12-01", locationId: loc.id, binId: loc.binId }, brewer);
    const { data: lot } = await admin.from("lots").select("id").eq("packaging_run_id", run.id).single();
    // a sample pulled from the lot is a ledger row that names it
    insertFixture("inventory_movements", { brewery_id: b.id, sku_id: cat.skuId, location_id: loc.id, bin_id: loc.binId, qty: -2, type: "sample", dest_state: "PA", lot_id: lot!.id, created_by: brewer.userId });

    const t = await runCommand("trace_lot", { lotId: lot!.id }, sales) as {
      lot: { id: string; code: string; brand: string; packaged_on: string };
      run: { id: string; run_no: number; bbl_drawn: number; vessel: string };
      batch: { id: string; batch_no: number; brewed_on: string };
      movements: { type: string; qty: number; sku: string; location: string }[];
      on_hand: number;
    };
    expect(t.lot).toMatchObject({ id: lot!.id, code: "L-261201-TP", brand: "Trace Porter", packaged_on: "2025-12-01" });
    expect(t.run).toMatchObject({ id: run.id, vessel: "FV-TRACE" });
    expect(Number(t.run.bbl_drawn)).toBe(25);
    expect(t.batch).toMatchObject({ id: batch.id, brewed_on: "2025-11-01" });
    expect(t.movements.map((m) => [m.type, m.qty, m.sku, m.location])).toEqual([
      ["production_in", 396, "Porter case", "Trace warehouse"],
      ["sample", -2, "Porter case", "Trace warehouse"],
    ]);
    expect(t.on_hand).toBe(394);
    // sales may trace; an unknown lot is not found
    await expect(runCommand("trace_lot", { lotId: crypto.randomUUID() }, sales)).rejects.toMatchObject({ status: 404 });
  });
});

describe("cellar transfer loss (#428)", () => {
  it("reports the volume lost on a transfer as a loss removal in the transfer's month", async () => {
    const brewery = await makeBrewery();
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    const owner = await makeStaffCtx(brewery.id, "admin");
    const [start, end, today] = sql(`select concat_ws('|', date_trunc('month', (now() at time zone timezone)::date)::date,
      (date_trunc('month', (now() at time zone timezone)::date) + interval '1 month - 1 day')::date, (now() at time zone timezone)::date)
      from breweries where id='${brewery.id}'`, true)[0].split("|");
    const vessel = (name: string) => runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 20 }, brewer) as Promise<{ id: string }>;
    const [fv1, fv2] = [await vessel("FV1"), await vessel("FV2")];
    const batch = await runCommand("schedule_batch", { plannedOn: today, plannedBbl: 10 }, brewer) as { id: string };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: fv1.id, initialBbl: 10, brewedOn: today }, brewer) as { occupancy: { id: string } };
    await runCommand("record_cellar_transfer", { fromOccupancyId: brewed.occupancy.id, toVesselId: fv2.id, volumeBbl: 8, lossBbl: 0.5 }, brewer);

    const r = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: start, periodEnd: end }, owner) as Report & { figures: { cellarRemovals: Record<string, number> } };
    expect(Number(r.figures.removals.loss)).toBe(0.5);
    expect(Number(r.figures.cellarRemovals.loss)).toBe(0.5);
  });

  // #485: the loss is one volume_adjustments row, so the report reads it once and
  // Review auto-reconciled losses can reattribute it like a completion loss.
  it("writes the loss as a reattributable cellar loss the report counts once", async () => {
    const brewery = await makeBrewery();
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    const owner = await makeStaffCtx(brewery.id, "admin");
    const [start, end, today] = sql(`select concat_ws('|', date_trunc('month', (now() at time zone timezone)::date)::date,
      (date_trunc('month', (now() at time zone timezone)::date) + interval '1 month - 1 day')::date, (now() at time zone timezone)::date)
      from breweries where id='${brewery.id}'`, true)[0].split("|");
    const vessel = (name: string) => runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 20 }, brewer) as Promise<{ id: string }>;
    const [fv1, fv2] = [await vessel("FV1"), await vessel("FV2")];
    const batch = await runCommand("schedule_batch", { plannedOn: today, plannedBbl: 10 }, brewer) as { id: string };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: fv1.id, initialBbl: 10, brewedOn: today }, brewer) as { occupancy: { id: string } };
    await runCommand("record_cellar_transfer", { fromOccupancyId: brewed.occupancy.id, toVesselId: fv2.id, volumeBbl: 8, lossBbl: 0.5 }, brewer);

    expect(sql(`select sum(bbl)::text from volume_adjustments where occupancy_id='${brewed.occupancy.id}' and reason = 'loss'`, true)).toEqual(["-0.500"]);
    expect(sql(`select occupancy_volumes.bbl::text from occupancy_volumes where occupancy_id='${brewed.occupancy.id}'`, true)).toEqual(["1.500"]);

    const review = await runCommand("get_loss_review", { periodStart: start, periodEnd: end }, owner) as import("@/lib/commands/compliance").LossReview[];
    expect(review).toEqual([expect.objectContaining({ batch_id: batch.id, kind: "transfer", closed_at: null, original_bbl: "0.500", remaining_bbl: "0.500" })]);
    await runCommand("reattribute_loss", { adjustmentId: review[0].adjustment_id, bbl: "0.2", classification: "destruction" }, owner);

    const r = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: start, periodEnd: end }, owner) as Report & { figures: { cellarRemovals: Record<string, number> } };
    expect(Number(r.figures.removals.loss)).toBeCloseTo(0.3, 8);
    expect(Number(r.figures.removals.destruction)).toBeCloseTo(0.2, 8);
    expect(Number(r.figures.cellarRemovals.loss) + Number(r.figures.cellarRemovals.destruction)).toBeCloseTo(0.5, 8);
    // reattribution changes the class, never the volume in the tank
    expect(sql(`select occupancy_volumes.bbl::text from occupancy_volumes where occupancy_id='${brewed.occupancy.id}'`, true)).toEqual(["1.500"]);
  });
});
