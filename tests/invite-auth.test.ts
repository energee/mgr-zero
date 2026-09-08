import { describe, expect, it, vi } from "vitest";
import { acceptInviteErrorPath, inviteAudience, inviteLanding, safeNextPath } from "@/lib/auth/invite";
import type { CustomerMembership, RequestAuthContext, StaffMembership } from "@/lib/auth/request-context";

const auth = (staff: StaffMembership[] = [], customer: CustomerMembership[] = []): RequestAuthContext => ({
  getIdentity: vi.fn(async () => ({ userId: "user", email: "invited@test.local" })),
  getStaffMemberships: vi.fn(async () => staff),
  getCustomerMemberships: vi.fn(async () => customer),
  getSupabaseClient: vi.fn(), getStaffMembership: vi.fn(), getCustomerMembership: vi.fn(),
} as unknown as RequestAuthContext);

describe("invite acceptance", () => {
  it("accepts only known audiences", () => {
    expect(inviteAudience("staff")).toBe("staff");
    expect(inviteAudience("customer")).toBe("customer");
    expect(inviteAudience("warehouse")).toBeNull();
  });

  it("keeps callback redirects on the request origin", () => {
    expect(safeNextPath("http://localhost:3000/auth/confirm", "/password?from=mail")).toBe("/password?from=mail");
    expect(safeNextPath("http://localhost:3000/auth/confirm", "//evil.example/path")).toBe("/password");
    expect(safeNextPath("http://localhost:3000/auth/confirm", "/\t/evil.example")).toBe("/password");
    expect(safeNextPath("http://localhost:3000/auth/confirm", "https://evil.example")).toBe("/password");
  });

  it("preserves valid invite context after form validation", () => {
    expect(acceptInviteErrorPath("staff", "Pat Brewer")).toBe("/accept?audience=staff&error=1&name=Pat+Brewer");
    expect(acceptInviteErrorPath(null, "Pat Brewer")).toBe("/invite-expired");
  });

  it("derives the displayed destination from membership", async () => {
    const staff = [{ breweryId: "brewery", breweryName: "Demo Brewing", role: "warehouse" as const }];
    expect(await inviteLanding(auth(staff), "staff")).toMatchObject({ name: "Demo Brewing", role: "warehouse" });
    expect(await inviteLanding(auth(staff), "customer")).toBeUndefined();
    const customer = [{ breweryId: "brewery", breweryName: "Demo Brewing", customerId: "customer", customerName: "Bar" }];
    expect(await inviteLanding(auth([], customer), "customer")).toMatchObject({ name: "Demo Brewing", role: "customer" });
  });
});
