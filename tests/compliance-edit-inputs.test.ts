// tests/compliance-edit-inputs.test.ts — #438: the License, Brand approval
// and State registration sheets upsert a whole row, so an edit must send back
// the record's values for the columns the sheet does not show (license note;
// approval expiry and note; registration approval date), or the upsert clears them.
import { describe, expect, it } from "vitest";
import { licenseInput } from "../lib/mgr/license-view";
import { approvalInput } from "../lib/mgr/brand-approval-view";
import { registrationInput } from "../lib/mgr/state-registration-view";

describe("compliance edit sheets keep the fields they do not show (#438)", () => {
  it("License edit sends the existing note", () => {
    const license = { note: "Renew via PLCB portal" };
    expect(licenseInput({ state: "pa", kind: "brewery", licenseNo: "B-1", expiresOn: "" }, license))
      .toEqual({ state: "PA", kind: "brewery", licenseNo: "B-1", expiresOn: undefined, note: "Renew via PLCB portal" });
  });

  it("License create and a null note send no note", () => {
    const fields = { state: "ny", kind: "brewery", licenseNo: "", expiresOn: "2027-01-31" };
    expect(licenseInput(fields)).toEqual({ state: "NY", kind: "brewery", licenseNo: undefined, expiresOn: "2027-01-31", note: undefined });
    expect(licenseInput(fields, { note: null }).note).toBeUndefined();
  });

  it("Brand approval edit sends the existing expiry and note", () => {
    const approval = { id: "a1", expires_on: "2028-05-01", note: "label v2" };
    expect(approvalInput("b1", { kind: "cola", ttbId: "123", submittedOn: "2026-01-02" }, approval))
      .toEqual({ id: "a1", brandId: "b1", kind: "cola", ttbId: "123", approvedOn: "2026-01-02", expiresOn: "2028-05-01", note: "label v2" });
  });

  it("Brand approval create sends neither", () => {
    expect(approvalInput("b1", { kind: "formula", ttbId: "F9", submittedOn: "" }))
      .toEqual({ id: undefined, brandId: "b1", kind: "formula", ttbId: "F9", approvedOn: undefined, expiresOn: undefined, note: undefined });
  });

  it("State registration edit sends the existing approval date", () => {
    const registration = { approved_on: "2026-03-04" };
    expect(registrationInput("b1", { state: "oh", registrationNo: "R-7", expiresOn: "2027-03-04" }, registration))
      .toEqual({ brandId: "b1", state: "OH", registrationNo: "R-7", expiresOn: "2027-03-04", approvedOn: "2026-03-04" });
    expect(registrationInput("b1", { state: "oh", registrationNo: "", expiresOn: "" }).approvedOn).toBeUndefined();
  });
});
