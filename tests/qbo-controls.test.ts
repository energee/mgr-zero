import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/(app)/settings/accounting/qbo-controls.tsx", "utf8");

describe("QuickBooks control boundaries", () => {
  it("opens one confirmation surface before every remote-create action", () => {
    expect(source).toMatch(/qboPushConfirmation/);
    expect(source).toMatch(/setPendingPush\("push"\)/);
    expect(source).toMatch(/setPendingPush\("retry"\)/);
    expect(source).toMatch(/setPendingPush\("corrected_push"\)/);
    expect(source).toMatch(/setPendingPush\("repush"\)/);
    expect(source).toMatch(/title=\{confirmation\.title\}/);
    expect(source).toMatch(/>\{confirmation\.confirmLabel\}<\/Button>/);
  });

  it("remounts mapping field state from the current saved server value", () => {
    expect(source).toMatch(/key=\{qboMappingVersion\(currentId\)\}/);
  });
});
