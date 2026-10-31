import { beforeEach, describe, expect, it, vi } from "vitest";
import { admin, makeBrewery, makeStaffCtx, seedCatalog } from "./helpers";
import { runCommand } from "@/lib/commands/registry";
import "@/lib/commands/all";
import { getColaDetails, getColaImage } from "@/lib/ttb/colas";
import type { ColaDetails } from "@/lib/ttb/colas";
import type * as ColaClient from "@/lib/ttb/colas";

vi.mock("@/lib/ttb/colas", async (original) => ({
  ...(await original<typeof ColaClient>()), getColaDetails: vi.fn(), getColaImage: vi.fn(),
}));

const ttbId = "99001001000001";
const url = "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=SampleLabel.jpg&filetype=l";
const details: ColaDetails = { ttbId, permit: "BR-PA-12345", status: "APPROVED", approvedOn: "2023-01-24", images: [{ url, label: "Brand (front) or keg collar" }] };
beforeEach(() => vi.clearAllMocks());

async function breweryWithPermit() {
  const brewery = await makeBrewery();
  const result = await admin.from("breweries").update({ ttb_registry_no: details.permit }).eq("id", brewery.id);
  if (result.error) throw result.error;
  return brewery;
}

describe("get_cola_details", () => {
  it("allows admin and sales to retrieve approved brewery-owned images, not warehouse", async () => {
    const brewery = await breweryWithPermit();
    for (const role of ["admin", "sales"] as const) {
      vi.mocked(getColaDetails).mockResolvedValueOnce(details);
      expect(await runCommand("get_cola_details", { ttbId }, await makeStaffCtx(brewery.id, role))).toEqual(details);
    }
    await expect(runCommand("get_cola_details", { ttbId }, await makeStaffCtx(brewery.id, "warehouse"))).rejects.toMatchObject({ status: 403 });
  });

  it("rejects missing brewery permit, mismatched permit, and revoked or pending records", async () => {
    const bare = await makeBrewery();
    await expect(runCommand("get_cola_details", { ttbId }, await makeStaffCtx(bare.id, "sales"))).rejects.toMatchObject({ status: 400 });
    expect(getColaDetails).not.toHaveBeenCalled();
    const brewery = await breweryWithPermit();
    const ctx = await makeStaffCtx(brewery.id, "sales");
    vi.mocked(getColaDetails).mockResolvedValueOnce({ ...details, permit: "BR-PA-OTHER" });
    await expect(runCommand("get_cola_details", { ttbId }, ctx)).rejects.toMatchObject({ status: 403 });
    for (const status of ["REVOKED", "PENDING", "DISAPPROVED"]) {
      vi.mocked(getColaDetails).mockResolvedValueOnce({ ...details, status, images: [] });
      await expect(runCommand("get_cola_details", { ttbId }, ctx)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("refuses an approved record without a date rather than offering an unsaveable image", async () => {
    const brewery = await breweryWithPermit();
    const ctx = await makeStaffCtx(brewery.id, "sales");
    vi.mocked(getColaDetails).mockResolvedValueOnce({ ...details, approvedOn: null });
    await expect(runCommand("get_cola_details", { ttbId }, ctx)).rejects.toMatchObject({ status: 502 });
  });

  it("surfaces upstream failures and rejects non-identifiers before requesting TTB", async () => {
    const brewery = await breweryWithPermit();
    const ctx = await makeStaffCtx(brewery.id, "sales");
    await expect(runCommand("get_cola_details", { ttbId: "../elsewhere" }, ctx)).rejects.toMatchObject({ status: 400 });
    expect(getColaDetails).not.toHaveBeenCalled();
    vi.mocked(getColaDetails).mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(runCommand("get_cola_details", { ttbId }, ctx)).rejects.toMatchObject({ status: 502 });
  });
});

describe("get_cola_image", () => {
  it("allows sales to preview a permit-validated label and returns explicit upstream errors", async () => {
    const brewery = await breweryWithPermit();
    const ctx = await makeStaffCtx(brewery.id, "sales");
    vi.mocked(getColaImage).mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    expect(await runCommand("get_cola_image", { ttbId, url }, ctx)).toEqual({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    expect(getColaImage).toHaveBeenCalledWith(ttbId, url, details.permit);
    vi.mocked(getColaImage).mockRejectedValueOnce(new Error("TTB image failed"));
    await expect(runCommand("get_cola_image", { ttbId, url }, ctx)).rejects.toMatchObject({ status: 502 });
  });

  it.each(["warehouse", "taproom"] as const)("allows %s to view only an approved image actually saved in its brewery", async (role) => {
    const brewery = await breweryWithPermit();
    const sales = await makeStaffCtx(brewery.id, "sales");
    const staff = await makeStaffCtx(brewery.id, role);
    await expect(runCommand("get_cola_image", { ttbId, url }, staff)).rejects.toMatchObject({ status: 404 });
    expect(getColaImage).not.toHaveBeenCalled();
    const { brandId } = await seedCatalog(brewery.id, { product: "Label image", sku: "Label image case" });
    await runCommand("upsert_brand_approval", { brandId, kind: "cola", ttbId, approvedOn: details.approvedOn, imageUrl: url }, sales);
    vi.mocked(getColaImage).mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    expect(await runCommand("get_cola_image", { ttbId, url }, staff)).toMatchObject({ dataUrl: expect.stringContaining("data:image/jpeg") });
    expect(getColaImage).toHaveBeenCalledWith(ttbId, url, details.permit);
    await expect(runCommand("get_cola_image", { ttbId, url: url.replace("SampleLabel.jpg", "Other.jpg") }, staff)).rejects.toMatchObject({ status: 404 });
    const other = await breweryWithPermit();
    await expect(runCommand("get_cola_image", { ttbId, url }, await makeStaffCtx(other.id, role))).rejects.toMatchObject({ status: 404 });
  });

  it.each(["warehouse", "taproom"] as const)("returns not found for a saved label removed before %s loads it", async (role) => {
    const brewery = await breweryWithPermit();
    const { brandId } = await seedCatalog(brewery.id, { product: "Removed label", sku: "Removed label case" });
    const sales = await makeStaffCtx(brewery.id, "sales");
    const approval = await runCommand("upsert_brand_approval", {
      brandId, kind: "cola", ttbId, approvedOn: details.approvedOn, imageUrl: url,
    }, sales) as { id: string };
    await runCommand("upsert_brand_approval", {
      id: approval.id, brandId, kind: "cola", ttbId, imageUrl: null,
    }, sales);

    await expect(runCommand("get_cola_image", { ttbId, url }, await makeStaffCtx(brewery.id, role)))
      .rejects.toMatchObject({ status: 404, code: "not_found" });
    expect(getColaImage).not.toHaveBeenCalled();
  });

  it("keeps a copy of a saved label, so later views by any staff role skip TTB", async () => {
    const brewery = await breweryWithPermit();
    const { brandId } = await seedCatalog(brewery.id, { product: "Kept label", sku: "Kept label case" });
    const sales = await makeStaffCtx(brewery.id, "sales");
    await runCommand("upsert_brand_approval", { brandId, kind: "cola", ttbId, approvedOn: details.approvedOn, imageUrl: url }, sales);
    vi.mocked(getColaImage).mockResolvedValueOnce({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    expect(await runCommand("get_cola_image", { ttbId, url }, await makeStaffCtx(brewery.id, "taproom"))).toEqual({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    for (const ctx of [sales, await makeStaffCtx(brewery.id, "warehouse")]) {
      expect(await runCommand("get_cola_image", { ttbId, url }, ctx)).toEqual({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    }
    expect(getColaImage).toHaveBeenCalledTimes(1);
    const other = await breweryWithPermit();
    await expect(runCommand("get_cola_image", { ttbId, url }, await makeStaffCtx(other.id, "taproom"))).rejects.toMatchObject({ status: 404 });
  });

  it("keeps no copy of an unsaved preview, and stops serving a copy once the label is removed", async () => {
    const brewery = await breweryWithPermit();
    const sales = await makeStaffCtx(brewery.id, "sales");
    vi.mocked(getColaImage).mockResolvedValue({ dataUrl: "data:image/jpeg;base64,/9j/2Q==" });
    await runCommand("get_cola_image", { ttbId, url }, sales);
    await runCommand("get_cola_image", { ttbId, url }, sales);
    expect(getColaImage).toHaveBeenCalledTimes(2);
    const { brandId } = await seedCatalog(brewery.id, { product: "Dropped label", sku: "Dropped label case" });
    const approval = await runCommand("upsert_brand_approval", { brandId, kind: "cola", ttbId, approvedOn: details.approvedOn, imageUrl: url }, sales) as { id: string };
    const taproom = await makeStaffCtx(brewery.id, "taproom");
    await runCommand("get_cola_image", { ttbId, url }, taproom);
    await runCommand("upsert_brand_approval", { id: approval.id, brandId, kind: "cola", ttbId, imageUrl: null }, sales);
    await expect(runCommand("get_cola_image", { ttbId, url }, taproom)).rejects.toMatchObject({ status: 404 });
  });

  it("refuses a saved image when the brewery registry number has been cleared", async () => {
    const brewery = await breweryWithPermit();
    const { brandId } = await seedCatalog(brewery.id, { product: "Missing permit", sku: "Missing permit case" });
    await runCommand("upsert_brand_approval", {
      brandId, kind: "cola", ttbId, approvedOn: details.approvedOn, imageUrl: url,
    }, await makeStaffCtx(brewery.id, "sales"));
    const cleared = await admin.from("breweries").update({ ttb_registry_no: null }).eq("id", brewery.id);
    if (cleared.error) throw cleared.error;
    await expect(runCommand("get_cola_image", { ttbId, url }, await makeStaffCtx(brewery.id, "taproom"))).rejects.toMatchObject({ status: 400 });
    expect(getColaImage).not.toHaveBeenCalled();
  });
});
