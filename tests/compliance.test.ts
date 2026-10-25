import { closeWithConfirmedMaterials } from "./packaging-fixture";
// tests/compliance.test.ts — Program 9: the compliance registry (brand
// approvals, state registrations, brewery licenses), the period report
// generated from the movement ledger, the immutable filed snapshot, and the
// lot trace. MGR never transmits a filing.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { admin, channelId, ins, insertFixture, makeBrewery, makeStaffCtx, priceSku, seedCatalog, seedCustomer, seedLocation, seedMaterial, seedMovement, sql } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { searchColasByPermit, type ColaRecord } from "@/lib/ttb/colas";
import { STAFF_ROLES } from "@/lib/mgr/enums";

// The TTB client is stubbed: tests never reach ttbonline.gov.
vi.mock("@/lib/ttb/colas", async (orig) => ({ ...(await orig<typeof import("@/lib/ttb/colas")>()), searchColasByPermit: vi.fn() }));

let b: { id: string };
let sales: Awaited<ReturnType<typeof makeStaffCtx>>;
let brandId: string;

beforeAll(async () => {
  b = await makeBrewery();
  sales = await makeStaffCtx(b.id, "sales");
  ({ brandId } = await seedCatalog(b.id, { product: "Stout", sku: "Stout case" }));
});

describe("search_colas", () => {
  const cola = (fancifulName: string, brandName = "Test Brewing"): ColaRecord => ({
    ttbId: crypto.randomUUID().slice(0, 14), permit: "BR-PA-TEST-1", serial: null, completedOn: "2026-01-02",
    fancifulName, brandName, classCode: "901", className: "MALT BEVERAGE",
  });

  it("refuses a brewery with no TTB registry number", async () => {
    const bare = await makeBrewery();
    await expect(runCommand("search_colas", { name: "array" }, await makeStaffCtx(bare.id, "sales"))).rejects.toMatchObject({ status: 400 });
  });

  it("searches TTB by the brewery's registry number and keeps only matching names; warehouse is denied; a TTB failure is an error", async () => {
    const brewery = await makeBrewery();
    const { error } = await admin.from("breweries").update({ ttb_registry_no: "BR-PA-TEST-1" }).eq("id", brewery.id);
    if (error) throw error;
    const ctx = await makeStaffCtx(brewery.id, "sales");
    const search = vi.mocked(searchColasByPermit);
    search.mockResolvedValueOnce([cola("Array of Hops"), cola("Stout"), cola("Lager")]);
    const found = await runCommand("search_colas", { name: "array" }, ctx) as { permit: string; rows: ColaRecord[] };
    expect(found.permit).toBe("BR-PA-TEST-1");
    expect(found.rows.map((r) => r.fancifulName)).toEqual(["Array of Hops"]);
    expect(search).toHaveBeenCalledWith("BR-PA-TEST-1");

    await expect(runCommand("search_colas", {}, await makeStaffCtx(brewery.id, "warehouse"))).rejects.toMatchObject({ status: 403 });

    search.mockRejectedValueOnce(new Error("TTB COLA search returned HTTP 500"));
    await expect(runCommand("search_colas", { name: "array" }, ctx)).rejects.toMatchObject({ status: 502 });
  });
});

describe("approval label images", () => {
  const imageUrl = "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Array.jpg&filetype=l";
  const nextImageUrl = "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Dom1%20Final.jpg&filetype=l";

  it("exposes only the permit needed for an exact saved approved COLA image to every staff role", async () => {
    const brewery = await makeBrewery();
    const permit = "BR-PA-IMAGE-PERMIT";
    const updated = await admin.from("breweries").update({ ttb_registry_no: permit }).eq("id", brewery.id);
    if (updated.error) throw updated.error;
    const owner = await makeStaffCtx(brewery.id, "admin");
    const { brandId: brand } = await seedCatalog(brewery.id, { product: "Image Permit", sku: "Image Permit case" });
    const ttbId = "26001001000108";
    await runCommand("upsert_brand_approval", { brandId: brand, kind: "cola", ttbId, approvedOn: "2026-01-02", imageUrl }, owner);
    const args = { p_brewery: brewery.id, p_ttb_id: ttbId, p_image_url: imageUrl };
    for (const role of STAFF_ROLES) {
      const ctx = await makeStaffCtx(brewery.id, role);
      const result = await ctx.db.rpc("get_saved_cola_image_permit", args);
      expect(result.error, role).toBeNull();
      expect(result.data, role).toBe(permit);
      for (const mismatch of [{ p_ttb_id: "26001001000999" }, { p_image_url: nextImageUrl }, { p_image_url: null }]) {
        expect((await ctx.db.rpc("get_saved_cola_image_permit", { ...args, ...mismatch })).error?.code).toBe("MG404");
      }
      if (role === "taproom") {
        expect((await ctx.db.from("breweries").select("ttb_registry_no").eq("id", brewery.id)).data).toEqual([]);
      }
    }
    const foreign = await makeStaffCtx((await makeBrewery()).id, "admin");
    expect((await foreign.db.rpc("get_saved_cola_image_permit", args)).error?.code).toBe("42501");
    expect((await foreign.db.rpc("get_saved_cola_image_permit", { ...args, p_brewery: foreign.breweryId })).error?.code).toBe("MG404");
    await runCommand("upsert_brand_approval", { brandId: brand, kind: "formula", ttbId: "F-IMAGE-PERMIT", approvedOn: "2026-01-02" }, owner);
    await runCommand("upsert_brand_approval", { brandId: brand, kind: "cola", ttbId: "26001001000109" }, owner);
    for (const otherId of ["F-IMAGE-PERMIT", "26001001000109"]) {
      expect((await owner.db.rpc("get_saved_cola_image_permit", { ...args, p_ttb_id: otherId })).error?.code).toBe("MG404");
    }
    const clearedPermit = await admin.from("breweries").update({ ttb_registry_no: null }).eq("id", brewery.id);
    if (clearedPermit.error) throw clearedPermit.error;
    const missingPermit = await owner.db.rpc("get_saved_cola_image_permit", args);
    expect(missingPermit.error).toBeNull();
    expect(missingPermit.data).toBeNull();
  });

  it("persists the selected official image, keeps omissions, clears null, and includes it in registry reads", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Image Keep", sku: "Image Keep case" });
    const input = { brandId: brand, kind: "cola", ttbId: "26001001000102" };
    const saved = await runCommand("upsert_brand_approval", { ...input, approvedOn: "2026-01-02", imageUrl }, sales) as { id: string };
    expect(saved).toMatchObject({ image_url: imageUrl });
    expect(await runCommand("upsert_brand_approval", { ...input, id: saved.id, note: "revised note" }, sales))
      .toMatchObject({ image_url: imageUrl, approved_on: "2026-01-02" });
    const registry = await runCommand("get_compliance_registry", {}, sales) as { brands: { id: string; approvals: { image_url: string | null }[] }[] };
    expect(registry.brands.find(row => row.id === brand)?.approvals).toEqual([expect.objectContaining({ image_url: imageUrl })]);
    const stored = await sales.db.from("brand_approvals").select("image_url").eq("id", saved.id).single();
    expect(stored.error).toBeNull();
    expect(stored.data?.image_url).toBe(imageUrl);
    expect(await runCommand("upsert_brand_approval", { ...input, id: saved.id, imageUrl: null }, sales))
      .toMatchObject({ image_url: null, approved_on: "2026-01-02" });
  });

  it("clears stale images when the TTB ID, kind, or approved status changes; an explicit new selection replaces it", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Image Stale", sku: "Image Stale case" });
    const input = { brandId: brand, kind: "cola", ttbId: "26001001000103" };
    const saved = await runCommand("upsert_brand_approval", { ...input, approvedOn: "2026-01-02", imageUrl }, sales) as { id: string };
    const edit = { ...input, id: saved.id };
    expect(await runCommand("upsert_brand_approval", { ...edit, ttbId: "26001001000104" }, sales)).toMatchObject({ image_url: null });
    expect(await runCommand("upsert_brand_approval", { ...edit, ttbId: "26001001000105", approvedOn: "2026-01-03", imageUrl: nextImageUrl }, sales))
      .toMatchObject({ image_url: nextImageUrl, approved_on: "2026-01-03" });
    expect(await runCommand("upsert_brand_approval", { ...edit, kind: "formula", ttbId: "F-IMAGE" }, sales))
      .toMatchObject({ image_url: null });
    await runCommand("upsert_brand_approval", { ...edit, approvedOn: "2026-01-02", imageUrl }, sales);
    expect(await runCommand("upsert_brand_approval", { ...edit, approvedOn: null }, sales))
      .toMatchObject({ image_url: null, approved_on: null });
  });

  it("requires an approved COLA date for a new image, including direct RPC edits with an existing date", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Image Status", sku: "Image Status case" });
    const input = { brandId: brand, kind: "cola", ttbId: "26001001000106", imageUrl };
    for (const change of [{}, { approvedOn: null }, { kind: "formula", approvedOn: "2026-01-02" }]) {
      await expect(runCommand("upsert_brand_approval", { ...input, ...change }, sales)).rejects.toMatchObject({ status: 400 });
    }
    const saved = await runCommand("upsert_brand_approval", { ...input, approvedOn: "2026-01-02" }, sales) as { id: string };
    const args = {
      p_brewery: b.id, p_id: saved.id, p_brand: brand, p_kind: "cola" as const, p_ttb_id: input.ttbId,
      p_approved_on: null, p_expires_on: null, p_note: null, p_image_url: imageUrl,
    };
    for (const change of [{}, { p_approved_on: "2026-01-02", p_clear: ["approved_on"] }, { p_kind: "formula" as const, p_approved_on: "2026-01-02" }]) {
      expect((await sales.db.rpc("upsert_brand_approval", { ...args, ...change, p_request_id: crypto.randomUUID() })).error?.message)
        .toMatch(/approved COLA/);
    }
  });

  it("keeps image writes tenant- and role-bound and supports direct RPC keep and clear", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Image Roles", sku: "Image Roles case" });
    const args = {
      p_brewery: b.id, p_id: null as string | null, p_brand: brand, p_kind: "cola" as const, p_ttb_id: "26001001000107",
      p_approved_on: "2026-01-02" as string | null, p_expires_on: null, p_note: null, p_image_url: imageUrl as string | null,
    };
    const saved = await sales.db.rpc("upsert_brand_approval", { ...args, p_request_id: crypto.randomUUID() });
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ image_url: imageUrl });
    if (!saved.data || typeof saved.data !== "object" || Array.isArray(saved.data) || typeof saved.data.id !== "string") {
      throw new Error("The approval RPC did not return an approval ID");
    }
    const id = saved.data.id;
    const edit = { ...args, p_id: id, p_image_url: null, p_approved_on: null };
    expect((await sales.db.rpc("upsert_brand_approval", { ...edit, p_request_id: crypto.randomUUID() })).data)
      .toMatchObject({ image_url: imageUrl });
    const warehouse = await makeStaffCtx(b.id, "warehouse");
    const foreign = await makeStaffCtx((await makeBrewery()).id, "admin");
    for (const ctx of [warehouse, foreign]) {
      expect((await ctx.db.rpc("upsert_brand_approval", { ...edit, p_request_id: crypto.randomUUID() })).error?.code).toBe("42501");
    }
    expect((await warehouse.db.from("brand_approvals").select("image_url").eq("id", id)).data).toEqual([{ image_url: imageUrl }]);
    expect((await foreign.db.from("brand_approvals").select("image_url").eq("id", id)).data).toEqual([]);
    expect((await foreign.db.rpc("upsert_brand_approval", { ...args, p_brewery: foreign.breweryId, p_request_id: crypto.randomUUID() })).error).not.toBeNull();
    expect((await sales.db.rpc("upsert_brand_approval", { ...edit, p_clear: ["image_url"], p_request_id: crypto.randomUUID() })).data)
      .toMatchObject({ image_url: null });
  });

  it("rejects non-official image URLs in both the command and direct RPC", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Unsafe Image", sku: "Unsafe Image case" });
    const input = { brandId: brand, kind: "cola", ttbId: "26001001000101", approvedOn: "2026-01-02" };
    const urls = [
      "https://example.com/label.png",
      "javascript:alert(1)",
      "https://www.ttbonline.gov.evil.test/label.png",
      "https://www.ttbonline.gov/colasonline/viewColaDetails.do?action=publicFormDisplay&ttbid=26001001000101",
      imageUrl.replace("https:", "http:"),
      `${imageUrl}&redirect=https://example.com`,
      imageUrl.replace("Array.jpg", "../Array.jpg"),
      imageUrl.replace("Array.jpg", "%2fArray.jpg"),
      imageUrl.replace("Array.jpg", "%5CArray.jpg"),
      imageUrl.replace("Array.jpg", "%ZZ.jpg"),
    ];
    for (const imageUrl of urls) {
      await expect(runCommand("upsert_brand_approval", { ...input, imageUrl }, sales)).rejects.toMatchObject({ status: 400 });
      const direct = await sales.db.rpc("upsert_brand_approval", {
        p_brewery: b.id, p_id: null, p_brand: brand, p_kind: "cola", p_ttb_id: input.ttbId,
        p_approved_on: input.approvedOn, p_expires_on: null, p_note: null,
        p_image_url: imageUrl, p_request_id: crypto.randomUUID(),
      });
      expect(direct.error?.code, imageUrl).toBe("23514");
    }
  });
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

  it("a COLA keeps its TTB ID and applicant serial as separate strings, edited independently (#730)", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Serial Saison", sku: "Serial Saison case" });
    const saved = await runCommand("upsert_brand_approval", { brandId: brand, kind: "cola", ttbId: "25318001000034", serialNumber: "000135" }, sales) as { id: string };
    expect(saved).toMatchObject({ ttb_id: "25318001000034", serial_number: "000135" });
    // omitting the serial keeps it; changing only the TTB ID leaves the serial alone
    expect(await runCommand("upsert_brand_approval", { id: saved.id, brandId: brand, kind: "cola", ttbId: "25318001000099" }, sales))
      .toMatchObject({ ttb_id: "25318001000099", serial_number: "000135" });
    expect(await runCommand("upsert_brand_approval", { id: saved.id, brandId: brand, kind: "cola", ttbId: "25318001000099", serialNumber: "0002" }, sales))
      .toMatchObject({ ttb_id: "25318001000099", serial_number: "0002" });
    // null clears the serial
    expect(await runCommand("upsert_brand_approval", { id: saved.id, brandId: brand, kind: "cola", ttbId: "25318001000099", serialNumber: null }, sales))
      .toMatchObject({ serial_number: null });
  });

  it("a formula approval takes no serial and keeps its number (#730)", async () => {
    const { brandId: brand } = await seedCatalog(b.id, { product: "Formula Gose", sku: "Formula Gose case" });
    expect(await runCommand("upsert_brand_approval", { brandId: brand, kind: "formula", ttbId: "F-0042" }, sales))
      .toMatchObject({ kind: "formula", ttb_id: "F-0042", serial_number: null });
    await expect(runCommand("upsert_brand_approval", { brandId: brand, kind: "formula", ttbId: "F-0043", serialNumber: "9" }, sales)).rejects.toMatchObject({ status: 400 });
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

  it("buckets a movement by occurred_on, not created_at (#821)", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const catalog = await seedCatalog(brewery.id, { bblPerUnit: 0.5 });
    const location = await seedLocation(brewery.id);
    insertFixture("inventory_movements", { brewery_id: brewery.id, sku_id: catalog.skuId,
      location_id: location.id, bin_id: location.binId, created_by: owner.userId,
      qty: 4, type: "production_in", created_at: "2025-10-02T12:00:00Z", occurred_on: "2025-09-20" });
    const september = await runCommand("generate_compliance_report", SEPT, owner) as Report;
    const october = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: "2025-10-01", periodEnd: "2025-10-31" }, owner) as Report;
    expect(september.figures.packaged).toBe(2);
    expect(september.figures.lines.find(line => line.class === "can")).toMatchObject({ begin: 0, in: 2, end: 2 });
    expect(october.figures.packaged).toBe(0);
    expect(october.figures.lines.find(line => line.class === "can")).toMatchObject({ begin: 2, in: 0, end: 2 });
  });

  it("a movement inserted without occurred_on takes the brewery-local date of created_at (#821)", async () => {
    const brewery = await makeBrewery();
    expect(brewery.timezone).toBe("America/New_York");
    const owner = await makeStaffCtx(brewery.id);
    const catalog = await seedCatalog(brewery.id);
    const location = await seedLocation(brewery.id);
    const [movement] = insertFixture<{ occurred_on: string }>("inventory_movements", {
      brewery_id: brewery.id, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId,
      created_by: owner.userId, qty: 1, type: "opening_balance", created_at: "2025-10-01T02:00:00Z",
    });
    expect(movement.occurred_on).toBe("2025-09-30");
  });

  it("occurred_on stays frozen when the brewery timezone changes later (#821)", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id);
    const catalog = await seedCatalog(brewery.id);
    const location = await seedLocation(brewery.id);
    const [movement] = insertFixture<{ id: string; occurred_on: string }>("inventory_movements", {
      brewery_id: brewery.id, sku_id: catalog.skuId, location_id: location.id, bin_id: location.binId,
      created_by: owner.userId, qty: 1, type: "opening_balance", created_at: "2025-10-01T02:00:00Z",
    });
    expect(movement.occurred_on).toBe("2025-09-30");
    sql(`update breweries set timezone='Asia/Tokyo' where id='${brewery.id}'`);
    expect(sql(`select occurred_on from inventory_movements where id='${movement.id}'`, true)).toEqual(["2025-09-30"]);
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
    const beforeInvalid = sql(`select count(*) from report_filings where brewery_id='${sales.breweryId}'`);
    await expect(runCommand("file_compliance_report", { ...PERIOD, periodStart: "2025-09-15", periodEnd: "2025-10-15" }, sales)).rejects.toMatchObject({
      status: 400, code: "invalid_input", message: expect.stringMatching(/one calendar month, quarter, or year/),
      issues: [{ path: ["periodEnd"], code: "custom", message: expect.stringMatching(/one calendar month, quarter, or year/) }],
    });
    for (const [p_start, p_end] of [["2025-10-10", "2025-10-20"], ["2025-02-01", "2025-04-30"], ["2025-01-01", "2025-12-30"]]) {
      const { error } = await sales.db.rpc("file_compliance_report", { p_brewery: sales.breweryId, p_jurisdiction: "TTB", p_start, p_end, p_note: null, p_request_id: crypto.randomUUID() });
      expect(error?.message, `${p_start}..${p_end}`).toMatch(/one calendar month, quarter, or year/);
    }
    expect(sql(`select count(*) from report_filings where brewery_id='${sales.breweryId}'`)).toEqual(beforeInvalid);
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

describe("material lot recall (#817)", () => {
  it("traces a consumed hop lot through every brew turn to a packaged lot and recipient", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id, "admin");
    const cat = await seedCatalog(brewery.id, { product: "Recall pale", sku: "Recall keg", packageType: "keg", bblPerUnit: 0.5 });
    const location = await seedLocation(brewery.id);
    const materialId = await seedMaterial(brewery.id, { name: "Recall hops", category: "hop", lotTracked: true });
    const materialLot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "H-77", received_on: "2026-10-01" });
    await seedMovement(brewery.id, { materialId, locationId: location.id, binId: location.binId, lotId: materialLot.id, qty: 20, type: "receipt", createdBy: owner.userId });
    const vessel = await runCommand("upsert_vessel", { name: "FV recall", kind: "fermenter", capacityBbl: 20 }, owner) as { id: string };
    const batch = await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 10, intendedBrandId: cat.brandId }, owner) as { id: string };
    const actual = { materialId, stage: "boil", locationId: location.id, binId: location.binId, lotId: materialLot.id, qty: 2 };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 5, brewedOn: "2026-10-01", actuals: [actual] }, owner) as { occupancy: { id: string } };
    await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 5, brewedOn: "2026-10-02", actuals: [actual] }, owner);
    const run = await runCommand("schedule_packaging_run", { brandId: cat.brandId, plannedOn: "2026-10-03", occupancyId: brewed.occupancy.id, outputs: [{ skuId: cat.skuId, qtyPlanned: 10 }] }, owner) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-10-03T14:00:00Z" }, owner);
    await closeWithConfirmedMaterials({ runId: run.id, bblDrawn: 5, outputs: [{ skuId: cat.skuId, qtyActual: 10 }], lotCode: "RECALL-LOT", packagedOn: "2026-10-03", locationId: location.id, binId: location.binId }, owner);
    const lot = (await admin.from("lots").select("id").eq("packaging_run_id", run.id).single().throwOnError()).data!;
    const customer = await seedCustomer(brewery.id, { name: "Recall recipient" });
    await priceSku(brewery.id, { saleChannelId: customer.saleChannelId, brandId: cat.brandId, formatId: cat.formatId, cents: 12000 });
    const order = await runCommand("create_order", { kind: "wholesale", customerId: customer.customerId, shipToId: customer.shipToId, fromLocationId: location.id, lines: [{ skuId: cat.skuId, qty: 2 }] }, owner) as { order_id: string };
    await runCommand("submit_order", { orderId: order.order_id }, owner);
    await runCommand("confirm_order", { orderId: order.order_id }, owner);
    const line = (await admin.from("order_lines").select("id").eq("order_id", order.order_id).single().throwOnError()).data!;
    await runCommand("record_pick", { orderId: order.order_id, picks: [{ lineId: line.id, qty: 2 }] }, owner);
    await runCommand("ship_order", { orderId: order.order_id, ship: [{ lineId: line.id, qty: 2, sources: [{ binId: location.binId, lotId: lot.id, qty: 2 }] }] }, owner);
    const trace = await runCommand("trace_material_lot", { materialLotId: materialLot.id }, owner) as { batches: { id: string }[]; lots: { id: string }[]; recipients: { id: string }[]; used: { qty: number }[]; on_hand: number };
    expect(trace.batches.map(b => b.id)).toEqual([batch.id]);
    expect(trace.lots.map(l => l.id)).toEqual([lot.id]);
    expect(trace.recipients.map(r => r.id)).toEqual([order.order_id]);
    expect(trace.used.reduce((total, use) => total + Number(use.qty), 0)).toBe(4);
    expect(Number(trace.on_hand)).toBe(16);
    const reverse = await runCommand("trace_lot", { lotId: lot.id }, owner) as { ingredients: { lot_id: string; qty: number }[] };
    expect(reverse.ingredients).toContainEqual(expect.objectContaining({ lot_id: materialLot.id, qty: 4 }));
    const sales = await makeStaffCtx(brewery.id, "sales");
    expect((await runCommand("search_entities", { q: "H-77", kinds: ["material_lot"] }, sales) as { id: string }[]).map(r => r.id)).toEqual([materialLot.id]);
    const warehouse = await makeStaffCtx(brewery.id, "warehouse");
    await expect(runCommand("trace_material_lot", { materialLotId: materialLot.id }, warehouse)).rejects.toMatchObject({ status: 403 });
    const foreign = await makeStaffCtx((await makeBrewery()).id, "admin");
    await expect(runCommand("trace_material_lot", { materialLotId: materialLot.id }, foreign)).rejects.toMatchObject({ status: 404 });
    // An ingredient added after run close never entered the already-packaged lot.
    const lateLot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "H-LATE", received_on: "2026-10-04" });
    await seedMovement(brewery.id, { materialId, locationId: location.id, binId: location.binId, lotId: lateLot.id, qty: 10, createdBy: owner.userId });
    await runCommand("record_batch_addition", { batchId: batch.id, occupancyId: brewed.occupancy.id, materialId, stage: "dry_hop", locationId: location.id, binId: location.binId, lotId: lateLot.id, qty: 1 }, owner);
    const lateTrace = await runCommand("trace_material_lot", { materialLotId: lateLot.id }, owner) as { lots: unknown[] };
    expect(lateTrace.lots).toEqual([]);
    expect((await runCommand("trace_lot", { lotId: lot.id }, owner) as { ingredients: { lot_id: string }[] }).ingredients.map(row => row.lot_id)).not.toContain(lateLot.id);

  });
});

describe("material lot correction (#817)", () => {
  it("excludes exactly reversed brew consumption from supplier recall", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id, "admin");
    const loc = await seedLocation(brewery.id);
    const materialId = await seedMaterial(brewery.id, { name: "Corrected hops", category: "hop", lotTracked: true });
    const oldLot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "OLD-HOPS", received_on: "2026-10-01" });
    const newLot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "NEW-HOPS", received_on: "2026-10-01" });
    for (const lot of [oldLot, newLot]) await seedMovement(brewery.id, { materialId, locationId: loc.id, binId: loc.binId, lotId: lot.id, qty: 4, createdBy: owner.userId });
    const vessel = await runCommand("upsert_vessel", { name: "FV corrected", kind: "fermenter", capacityBbl: 10 }, owner) as { id: string };
    const batch = await runCommand("schedule_batch", { plannedOn: "2026-10-01", plannedBbl: 2 }, owner) as { id: string };
    const actual = { materialId, stage: "boil", locationId: loc.id, binId: loc.binId, lotId: oldLot.id, qty: 4 };
    const original = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 2, brewedOn: "2026-10-01", actuals: [actual] }, owner) as { record: { id: string } };
    await runCommand("correct_brew_record", { recordId: original.record.id, reason: "Supplier lot corrected", initialBbl: 2, actuals: [{ ...actual, lotId: newLot.id }] }, owner);
    const oldTrace = await runCommand("trace_material_lot", { materialLotId: oldLot.id }, owner) as { used: unknown[]; batches: unknown[]; on_hand: number };
    expect(oldTrace.used).toEqual([]);
    expect(oldTrace.batches).toEqual([]);
    expect(Number(oldTrace.on_hand)).toBe(4);
    const newTrace = await runCommand("trace_material_lot", { materialLotId: newLot.id }, owner) as { used: { qty: number }[]; batches: { id: string }[]; on_hand: number };
    expect(newTrace.batches.map(row => row.id)).toEqual([batch.id]);
    expect(newTrace.used.map(row => Number(row.qty))).toEqual([4]);
    expect(Number(newTrace.on_hand)).toBe(0);
    expect((await runCommand("search_entities", { q: "NEW-HOPS", kinds: ["material_lot"] }, owner) as { id: string }[]).map(row => row.id)).toEqual([newLot.id]);
  });
});

describe("packaging material recall (#817)", () => {
  it("follows tracked packaging consumption and excludes reversed packaging lots", async () => {
    const brewery = await makeBrewery();
    const owner = await makeStaffCtx(brewery.id, "admin");
    const cat = await seedCatalog(brewery.id, { product: "Packaging recall", sku: "Packaging case", packageType: "can", bblPerUnit: 0.001 });
    const loc = await seedLocation(brewery.id);
    const materialId = await seedMaterial(brewery.id, { name: "Tracked sleeves", category: "packaging", uom: "each", lotTracked: true });
    await ins("format_bom", { brewery_id: brewery.id, format_id: cat.formatId, material_id: materialId, qty_per_unit: 1 });
    const oldLot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "SLEEVE-OLD", received_on: "2026-10-01" });
    const newLot = await ins("material_lots", { brewery_id: brewery.id, material_id: materialId, lot_code: "SLEEVE-NEW", received_on: "2026-10-01" });
    for (const lot of [oldLot, newLot]) await seedMovement(brewery.id, { materialId, locationId: loc.id, binId: loc.binId, lotId: lot.id, qty: 20, type: "receipt", createdBy: owner.userId });
    const vessel = await runCommand("upsert_vessel", { name: "FV sleeves", kind: "fermenter", capacityBbl: 10 }, owner) as { id: string };
    const batch = await runCommand("schedule_batch", { intendedBrandId: cat.brandId, plannedBbl: 1, plannedOn: "2026-10-01" }, owner) as { id: string };
    const brewed = await runCommand("record_brew_day", { batchId: batch.id, vesselId: vessel.id, initialBbl: 1, brewedOn: "2026-10-01", actuals: [], confirmEmpty: true }, owner) as { occupancy: { id: string } };
    const run = await runCommand("schedule_packaging_run", { brandId: cat.brandId, occupancyId: brewed.occupancy.id, plannedOn: "2026-10-02", outputs: [{ skuId: cat.skuId, qtyPlanned: 10 }] }, owner) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2026-10-02T14:00:00Z" }, owner);
    const plan = await runCommand("get_packaging_close_plan", { runId: run.id }, owner) as { revision: string };
    const actual = { materialId, locationId: loc.id, binId: loc.binId, lotId: oldLot.id, used: 10, loss: 0, unused: 0 };
    await runCommand("close_packaging_run", { runId: run.id, planRevision: plan.revision, bblDrawn: 0.01, outputs: [{ skuId: cat.skuId, qtyActual: 10 }], lotCode: "PACKAGING-RECALL", packagedOn: "2026-10-02", locationId: loc.id, binId: loc.binId, actuals: [actual] }, owner);
    const lot = (await admin.from("lots").select("id").eq("packaging_run_id", run.id).single().throwOnError()).data!;
    expect((await runCommand("trace_material_lot", { materialLotId: oldLot.id }, owner) as { lots: { id: string }[] }).lots.map(row => row.id)).toEqual([lot.id]);
    const history = await runCommand("get_packaging_material_record", { runId: run.id }, owner) as { records: { id: string }[] };
    await runCommand("correct_packaging_material_record", { recordId: history.records[0].id, reason: "Supplier lot corrected", actuals: [{ ...actual, lotId: newLot.id }] }, owner);
    expect((await runCommand("trace_material_lot", { materialLotId: oldLot.id }, owner) as { used: unknown[]; lots: unknown[] }).lots).toEqual([]);
    const trace = await runCommand("trace_material_lot", { materialLotId: newLot.id }, owner) as { batches: { id: string }[]; runs: { id: string }[]; lots: { id: string }[] };
    expect(trace.batches.map(row => row.id)).toEqual([batch.id]);
    expect(trace.runs.map(row => row.id)).toEqual([run.id]);
    expect(trace.lots.map(row => row.id)).toEqual([lot.id]);
    expect((await runCommand("trace_lot", { lotId: lot.id }, owner) as { ingredients: { lot_id: string }[] }).ingredients.map(row => row.lot_id)).toEqual([newLot.id]);
  });
});

describe("trace_lot", () => {
  it("traces blended member batches through intermediate tanks, excluding arrivals after packaging (#818)", async () => {
    const brewery = await makeBrewery();
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    const owner = await makeStaffCtx(brewery.id, "admin");
    const cat = await seedCatalog(brewery.id, { product: "Trace Blend", sku: "Blend keg", packageType: "keg", bblPerUnit: 0.5 });
    const loc = await seedLocation(brewery.id);
    const vessel = (name: string) => runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 60 }, owner) as Promise<{ id: string }>;
    const [sourceTank, intermediateTank, receivingTank, lateTank] = await Promise.all([
      vessel("TRACE-SOURCE"), vessel("TRACE-INTERMEDIATE"), vessel("TRACE-RECEIVING"), vessel("TRACE-LATE"),
    ]);
    const brew = async (vesselId: string) => {
      const batch = await runCommand("schedule_batch", { plannedOn: "2025-11-01", plannedBbl: 15, intendedBrandId: cat.brandId }, brewer) as { id: string };
      const result = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId, initialBbl: 15, brewedOn: "2025-11-01" }, brewer) as { occupancy: { id: string } };
      return { batchId: batch.id, occupancyId: result.occupancy.id };
    };
    const source = await brew(sourceTank.id);
    const receiving = await brew(receivingTank.id);
    const late = await brew(lateTank.id);
    const transfer = (fromOccupancyId: string, toVesselId: string, volumeBbl: number) =>
      runCommand("record_cellar_transfer", { fromOccupancyId, toVesselId, volumeBbl, lossBbl: 0 }, brewer) as Promise<{
        transfer: { id: string; bbl: number; at: string };
        to_occupancy: { id: string };
      }>;
    const first = await transfer(source.occupancyId, intermediateTank.id, 10);
    const second = await transfer(first.to_occupancy.id, receivingTank.id, 10);
    const returned = await transfer(receiving.occupancyId, sourceTank.id, 2);
    const repeated = await transfer(source.occupancyId, receivingTank.id, 2);
    // This arrival predates packaging but follows the source's outgoing leg.
    const afterOutgoing = await transfer(late.occupancyId, sourceTank.id, 5);
    const run = await runCommand("schedule_packaging_run", { brandId: cat.brandId, plannedOn: "2025-12-01", occupancyId: receiving.occupancyId, outputs: [{ skuId: cat.skuId, qtyPlanned: 10 }] }, brewer) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2025-12-01T14:00:00Z" }, brewer);
    await closeWithConfirmedMaterials({ runId: run.id, bblDrawn: 5, outputs: [{ skuId: cat.skuId, qtyActual: 10 }], lotCode: "L-251201-BL", packagedOn: "2025-12-01", locationId: loc.id, binId: loc.binId }, brewer);
    const { data: lot, error } = await admin.from("lots").select("id").eq("packaging_run_id", run.id).single();
    expect(error).toBeNull();
    const later = await transfer(late.occupancyId, receivingTank.id, 5);

    const trace = await runCommand("trace_lot", { lotId: lot!.id }, owner) as {
      batches: { id: string }[];
      transfers: { id: string; bbl: number; at: string }[];
    };
    expect(trace.batches.map(batch => batch.id).sort()).toEqual([source.batchId, receiving.batchId].sort());
    expect(trace.transfers.map(row => row.id).sort()).toEqual([first.transfer.id, second.transfer.id, returned.transfer.id, repeated.transfer.id].sort());
    expect(Number(trace.transfers.find(row => row.id === first.transfer.id)?.bbl)).toBe(10);
    expect(Number(trace.transfers.find(row => row.id === second.transfer.id)?.bbl)).toBe(10);
    expect(trace.transfers.find(row => row.id === first.transfer.id)?.at).toBe(first.transfer.at);
    expect(trace.transfers.find(row => row.id === second.transfer.id)?.at).toBe(second.transfer.at);
    expect(trace.transfers.map(row => row.id)).not.toContain(afterOutgoing.transfer.id);
    expect(trace.transfers.map(row => row.id)).not.toContain(later.transfer.id);
    expect(trace.batches.map(batch => batch.id)).not.toContain(late.batchId);
    for (const batchId of [source.batchId, receiving.batchId]) {
      const lots = await owner.db.rpc("trace_batch_lots", { p_brewery: brewery.id, p_batch: batchId });
      expect(lots.error).toBeNull();
      expect(lots.data?.map(row => row.id)).toContain(lot!.id);
    }
    const lateLots = await owner.db.rpc("trace_batch_lots", { p_brewery: brewery.id, p_batch: late.batchId });
    expect(lateLots.error).toBeNull();
    expect(lateLots.data).toEqual([]);
    const warehouse = await makeStaffCtx(brewery.id, "warehouse");
    expect((await warehouse.db.rpc("trace_lot_sources", { p_brewery: brewery.id, p_lot: lot!.id })).error?.code).toBe("42501");
    const foreign = await makeStaffCtx((await makeBrewery()).id, "admin");
    expect((await foreign.db.rpc("trace_lot_sources", { p_brewery: brewery.id, p_lot: lot!.id })).error?.code).toBe("42501");
    expect((await owner.db.rpc("trace_lot_sources", { p_brewery: brewery.id, p_lot: crypto.randomUUID() })).error?.code).toBe("MG404");

    // Equal-time historical legs exercise cycles without enumerating every path.
    sql(`insert into public.transfers(brewery_id,from_occupancy_id,to_occupancy_id,bbl,at,created_by)
      select '${brewery.id}',
        case when n % 2 = 0 then '${source.occupancyId}'::uuid else '${receiving.occupancyId}'::uuid end,
        case when n % 2 = 0 then '${receiving.occupancyId}'::uuid else '${source.occupancyId}'::uuid end,
        0.001, '${first.transfer.at}'::timestamptz, '${brewer.userId}'
      from generate_series(1,20) n`, true);
    const planRows = sql(`set local statement_timeout = '5s'; do $check$
      declare body text; plan json; node json; expanded bigint;
      begin
        select prosrc into body from pg_proc where oid = 'private.lot_lineage(uuid,uuid)'::regprocedure;
        body := replace(replace(body, 'p_brewery', quote_literal('${brewery.id}') || '::uuid'), 'p_lot', quote_literal('${lot!.id}') || '::uuid');
        execute 'explain (analyze, format json) ' || body into plan;
        with recursive nodes(value) as (
          select plan->0->'Plan'
          union all select child from nodes, json_array_elements(coalesce(value->'Plans', '[]'::json)) child
        ) select value into node from nodes where value->>'Node Type' = 'Recursive Union';
        expanded := (node->>'Actual Rows')::bigint;
        if expanded is null or expanded > 1 + 26 * 26 then
          raise exception 'lineage expanded % states for 26 transfer legs', expanded;
        end if;
      end $check$`, true);
    expect(planRows).toEqual([]);
  });

  it("follows the lot to its run, tank, and batch, and lists every ledger movement tagged with it", async () => {
    const brewer = await makeStaffCtx(b.id, "brewer");
    const owner = await makeStaffCtx(b.id, "admin");
    const cat = await seedCatalog(b.id, { product: "Trace Porter", sku: "Porter case", packageType: "can", bblPerUnit: 0.0645 });
    const loc = await seedLocation(b.id, { name: "Trace warehouse" });
    const vessel = await runCommand("upsert_vessel", { name: "FV-TRACE", kind: "fermenter", capacityBbl: 60 }, owner) as { id: string };
    const batch = await runCommand("schedule_batch", { plannedOn: "2025-11-01", plannedBbl: 30, intendedBrandId: cat.brandId }, brewer) as { id: string; batch_no: number };
    const dayOut = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: vessel.id, initialBbl: 30, brewedOn: "2025-11-01" }, brewer) as { occupancy: { id: string } };
    const run = await runCommand("schedule_packaging_run", { brandId: cat.brandId, plannedOn: "2025-12-01", occupancyId: dayOut.occupancy.id, outputs: [{ skuId: cat.skuId, qtyPlanned: 400 }] }, brewer) as { id: string };
    await runCommand("update_packaging_run", { runId: run.id, startedAt: "2025-12-01T14:00:00Z" }, brewer);
    await closeWithConfirmedMaterials({ runId: run.id, bblDrawn: 26, outputs: [{ skuId: cat.skuId, qtyActual: 396 }], lotCode: "L-261201-TP", packagedOn: "2025-12-01", locationId: loc.id, binId: loc.binId }, brewer);
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
    expect(Number(t.run.bbl_drawn)).toBe(26);
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
    const vessel = (name: string) => runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 20 }, owner) as Promise<{ id: string }>;
    const [fv1, fv2] = [await vessel("FV1"), await vessel("FV2")];
    const batch = await runCommand("schedule_batch", { plannedOn: today, plannedBbl: 10 }, brewer) as { id: string };
    const brewed = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: fv1.id, initialBbl: 10, brewedOn: today }, brewer) as { occupancy: { id: string } };
    await runCommand("record_cellar_transfer", { fromOccupancyId: brewed.occupancy.id, toVesselId: fv2.id, volumeBbl: 8, lossBbl: 0.5 }, brewer);

    const r = await runCommand("generate_compliance_report", { jurisdiction: "TTB", periodStart: start, periodEnd: end }, owner) as Report & { figures: { cellarRemovals: Record<string, number> } };
    expect(Number(r.figures.removals.loss)).toBe(0.5);
    expect(Number(r.figures.cellarRemovals.loss)).toBe(0.5);
  });

  // #485: the loss is one volume_adjustments row, so the report reads it once and
  // Review cellar losses can reattribute it like a completion loss.
  it("writes the loss as a reattributable cellar loss the report counts once", async () => {
    const brewery = await makeBrewery();
    const brewer = await makeStaffCtx(brewery.id, "brewer");
    const owner = await makeStaffCtx(brewery.id, "admin");
    const [start, end, today] = sql(`select concat_ws('|', date_trunc('month', (now() at time zone timezone)::date)::date,
      (date_trunc('month', (now() at time zone timezone)::date) + interval '1 month - 1 day')::date, (now() at time zone timezone)::date)
      from breweries where id='${brewery.id}'`, true)[0].split("|");
    const vessel = (name: string) => runCommand("upsert_vessel", { name, kind: "fermenter", capacityBbl: 20 }, owner) as Promise<{ id: string }>;
    const [fv1, fv2] = [await vessel("FV1"), await vessel("FV2")];
    const batch = await runCommand("schedule_batch", { plannedOn: today, plannedBbl: 10 }, brewer) as { id: string };
    const brewed = await runCommand("record_brew_day", { actuals: [], confirmEmpty: true, batchId: batch.id, vesselId: fv1.id, initialBbl: 10, brewedOn: today }, brewer) as { occupancy: { id: string } };
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
