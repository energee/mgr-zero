// tests/denied.test.ts — the Permission denied screen's copy (lib/mgr/denied.ts).
import { describe, expect, it } from "vitest";
import { deniedCopy, deniedHref } from "@/lib/mgr/denied";

describe("deniedCopy", () => {
  it("names the refusal, the caller and the roles that would satisfy it", () => {
    expect(deniedCopy({ resource: "Invoices", roles: ["brewer"], needs: ["admin", "sales"] })).toEqual({
      note: "You do not have access to Invoices.", signedInAs: "brewer", needs: "admin or sales", hint: "An admin can change your role in Settings, then Team.",
    });
    expect(deniedCopy({ resource: "Settings", roles: ["sales"], needs: ["admin"] }).hint).toBe("Ask an admin at your brewery.");
    expect(deniedCopy({ resource: "X", roles: ["sales"], needs: [] }).needs).toBe("another role");
  });
  it("names every held role when a combined membership still lacks permission", () => {
    expect(deniedCopy({ resource: "Settings", roles: ["sales", "brewer"], needs: ["admin"] }).signedInAs).toBe("sales, brewer");
  });
  it("encodes the resource and roles into the /denied href", () => {
    expect(deniedHref("Price groups", ["admin", "sales"])).toBe("/denied?for=Price%20groups&needs=admin%2Csales");
  });
});
