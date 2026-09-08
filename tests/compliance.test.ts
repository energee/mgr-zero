// tests/compliance.test.ts — Program 9: the compliance registry (brand
// approvals, state registrations, brewery licenses), the period report
// generated from the movement ledger, the immutable filed snapshot, and the
// lot trace. MGR never transmits a filing.
import { beforeAll, describe, expect, it } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog } from "./helpers";
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
