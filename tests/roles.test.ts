import { describe, expect, it } from "vitest";
import { hasAnyRole, onlyRoles } from "@/lib/mgr/roles";

describe("shared role predicates", () => {
  it("allows any overlap without treating an unlisted admin as an allowed role", () => {
    expect(hasAnyRole(["sales", "brewer"], ["brewer"])).toBe(true);
    expect(hasAnyRole(["sales", "brewer"], ["admin", "warehouse"])).toBe(false);
    expect(hasAnyRole(["admin"], ["sales"])).toBe(false);
    expect(hasAnyRole(["admin"], ["admin", "sales"])).toBe(true);
    expect(hasAnyRole([], ["admin"])).toBe(false);
    expect(hasAnyRole(["customer"], ["admin", "sales"])).toBe(false);
  });

  it("restricts only a nonempty set entirely made of excluded roles", () => {
    expect(onlyRoles(["taproom"], ["taproom"])).toBe(true);
    expect(onlyRoles(["taproom", "warehouse"], ["taproom", "warehouse"])).toBe(true);
    expect(onlyRoles(["taproom", "brewer"], ["taproom"])).toBe(false);
    expect(onlyRoles(["taproom", "admin"], ["taproom"])).toBe(false);
    expect(onlyRoles([], ["taproom"])).toBe(false);
    expect(onlyRoles(["taproom"], [])).toBe(false);
  });
});
