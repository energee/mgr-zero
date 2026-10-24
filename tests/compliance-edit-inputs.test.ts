// tests/compliance-edit-inputs.test.ts — the License, Brand approval and State
// registration sheets build their upsert input from the fields they show. The
// upsert keeps a column the input omits and clears one sent as null (#522), so
// a hidden column (license note; approval expiry and note; registration
// approval date) is omitted and kept (#438), and a shown field left empty is
// null so emptying it clears it.
import { describe, expect, it } from "vitest";
import { licenseInput } from "../lib/mgr/license-view";
import { approvalInput } from "../lib/mgr/brand-approval-view";
import { registrationInput } from "../lib/mgr/state-registration-view";

describe("compliance sheets omit the fields they do not show and null the ones left empty", () => {
  it("License", () => {
    expect(licenseInput({ state: "pa", kind: "brewery", licenseNo: "B-1", expiresOn: "" }))
      .toEqual({ state: "PA", kind: "brewery", licenseNo: "B-1", expiresOn: null });
  });

  it("Brand approval edit keeps its id", () => {
    expect(approvalInput("b1", { kind: "cola", ttbId: "00123456789012", serialNumber: "007", approvedOn: "2026-01-02" }, { id: "a1" }))
      .toEqual({ id: "a1", brandId: "b1", kind: "cola", ttbId: "00123456789012", serialNumber: "007", approvedOn: "2026-01-02" });
    // an emptied COLA serial is null so it clears; a formula never sends a serial
    expect(approvalInput("b1", { kind: "cola", ttbId: "00123456789012", serialNumber: " ", approvedOn: "" }).serialNumber).toBeNull();
    expect(approvalInput("b1", { kind: "formula", ttbId: "F9", serialNumber: "stale", approvedOn: "" }))
      .toEqual({ id: undefined, brandId: "b1", kind: "formula", ttbId: "F9", approvedOn: null });
  });

  it("saves a selected approved label image and drops it when switching to a formula or clearing the date", () => {
    const fields = { kind: "cola", ttbId: "00123456789012", serialNumber: "007", approvedOn: "2026-01-02", imageUrl: "https://ttbonline.gov/colasonline/publicViewAttachment.do?filename=Label.jpg&filetype=l" };
    expect(approvalInput("b1", fields)).toMatchObject({ ttbId: fields.ttbId, imageUrl: fields.imageUrl });
    expect(approvalInput("b1", { ...fields, kind: "formula" })).not.toHaveProperty("imageUrl");
    expect(approvalInput("b1", { ...fields, approvedOn: "" })).not.toHaveProperty("imageUrl");
    expect(approvalInput("b1", { ...fields, imageUrl: "" })).not.toHaveProperty("imageUrl");
  });

  it("binds a TTB ID already on this brand to its saved approval instead of inserting a duplicate", () => {
    const fields = { kind: "cola", ttbId: " 00123456789012 ", serialNumber: "007", approvedOn: "2026-01-02" };
    const approvals = [{ id: "saved-cola", kind: "cola", ttb_id: "00123456789012" }, { id: "saved-formula", kind: "formula", ttb_id: "00123456789012" }];
    expect(approvalInput("b1", fields, undefined, approvals)).toMatchObject({ id: "saved-cola", ttbId: "00123456789012" });
    expect(approvalInput("b1", { ...fields, kind: "formula" }, undefined, approvals)).toMatchObject({ id: "saved-formula" });
    expect(approvalInput("b1", fields, { id: "edited" }, approvals)).toMatchObject({ id: "edited" });
  });

  it("State registration", () => {
    expect(registrationInput("b1", { state: "oh", registrationNo: "R-7", expiresOn: "" }))
      .toEqual({ brandId: "b1", state: "OH", registrationNo: "R-7", expiresOn: null });
  });
});
