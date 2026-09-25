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
    expect(approvalInput("b1", { kind: "cola", ttbId: "123", submittedOn: "2026-01-02" }, { id: "a1" }))
      .toEqual({ id: "a1", brandId: "b1", kind: "cola", ttbId: "123", approvedOn: "2026-01-02" });
    expect(approvalInput("b1", { kind: "formula", ttbId: "F9", submittedOn: "" }))
      .toEqual({ id: undefined, brandId: "b1", kind: "formula", ttbId: "F9", approvedOn: null });
  });

  it("State registration", () => {
    expect(registrationInput("b1", { state: "oh", registrationNo: "R-7", expiresOn: "" }))
      .toEqual({ brandId: "b1", state: "OH", registrationNo: "R-7", expiresOn: null });
  });
});
