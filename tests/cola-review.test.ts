// COLA review preserves brand identity and saves only the explicitly chosen label.
import { describe, expect, it } from "vitest";
import { colaApprovalInput, matchingBrandColas } from "../lib/mgr/cola-review";
import { toCatalogViewProps } from "../lib/mgr/catalog-view";
import type { ColaRecord, ColaDetails } from "../lib/ttb/colas";

const record: ColaRecord = { ttbId: "25318001000034", permit: "BR-PA-12345", serial: "000135", completedOn: "2026-01-15", fancifulName: "Silver IPA", brandName: "Example Brewing", classCode: "80", className: "ALE" };
const brand = { id: "brand-1", name: "Silver IPA", alias: "Series 1", colas: [{ id: "approval-1", ttb_id: record.ttbId, approved_on: "2026-01-15" }] };
const imageUrl = "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=label.jpg";
const details: ColaDetails = { ttbId: record.ttbId, permit: record.permit, status: "APPROVED", approvedOn: "2026-01-15", images: [{ url: imageUrl, label: "Front label" }] };

describe("COLA bulk review", () => {
  it("matches a saved TTB ID even when the label name differs, and supports the brand alias", () => {
    const saved = { ...record, fancifulName: "Old name" };
    const alias = { ...record, ttbId: "25318001000035", fancifulName: "Series 1 amber" };
    const other = { ...record, ttbId: "25318001000036", fancifulName: "Unrelated" };
    expect(matchingBrandColas(brand, [saved, alias, other])).toEqual([saved, alias]);
  });

  it("edits the selected saved approval rather than creating a duplicate, preserving leading zeros", () => {
    expect(colaApprovalInput(brand, record, details, imageUrl)).toEqual({ id: "approval-1", brandId: brand.id, kind: "cola", ttbId: record.ttbId, serialNumber: "000135", approvedOn: "2026-01-15", imageUrl });
    expect(colaApprovalInput({ ...brand, colas: [] }, record, details, imageUrl)).not.toHaveProperty("id");
  });

  it("does not clear a saved image when TTB has no published image to choose", () => {
    expect(colaApprovalInput(brand, record, { ...details, images: [] }, "")).not.toHaveProperty("imageUrl");
  });

  it("shows images only for dated approvals and chooses the latest approved label deterministically", () => {
    const model = toCatalogViewProps({ priceGroups: [], brands: [{ ...brand, abv: null, styles: null, skus: [], colas: [
      { ttb_id: "pending", approved_on: null, image_url: "https://example.test/pending.jpg" },
      { ttb_id: "old", approved_on: "2025-01-01", image_url: "https://example.test/old.jpg" },
      { ttb_id: "new", approved_on: "2026-01-01", image_url: "https://example.test/new.jpg" },
    ] }] });
    expect(model.brands[0]?.image).toEqual({ url: "https://example.test/new.jpg", ttbId: "new" });
    const pendingOnly = toCatalogViewProps({ priceGroups: [], brands: [{ ...brand, abv: null, styles: null, skus: [], colas: [{ ttb_id: "pending", approved_on: null, image_url: "https://example.test/pending.jpg" }] }] });
    expect(pendingOnly.brands[0]?.image).toBeUndefined();
  });
});
