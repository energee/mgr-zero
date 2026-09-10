import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/settings/accounting/qbo-controls.tsx", "utf8");
const invoiceList = readFileSync("app/(app)/invoices/page.tsx", "utf8");

describe("QuickBooks control boundaries", () => {
  it("opens one confirmation surface before every remote-create action", () => {
    expect(source).toMatch(/qboPushConfirmation/);
    expect(source).toMatch(/setPendingPush\("push"\)/);
    expect(source).toMatch(/setPendingPush\("retry"\)/);
    expect(source).toMatch(/setPendingPush\("corrected_push"\)/);
    expect(source).toMatch(/setPendingPush\("repush"\)/);
    expect(source).toMatch(/title=\{confirmation\.title\}/);
    expect(source).toMatch(/Sending….*confirmation\.confirmLabel/);
    expect(source).not.toMatch(/onClick=\{\(\) => push\(/);
    expect(source).toMatch(/onClick=\{\(\) => void push\(pendingPush!\)\}/);
  });

  it("remounts mapping field state from the current saved server value", () => {
    expect(source).toMatch(/key=\{qboMappingVersion\(currentId\)\}/);
  });

  it("uses QuickBooks presentation for unpaid pushed rows even when they drifted", () => {
    expect(invoiceList).toMatch(/qbo_sync_status === "pushed" && state === "unpaid"/);
    expect(invoiceList).not.toMatch(/&& !inv\.qbo_accountant_drift/);
  });
});
