import { describe, expect, it, vi } from "vitest";
import { inviteAudience, inviteLanding } from "@/lib/auth/invite";
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

  it("derives the displayed destination from membership", async () => {
    const staff = [{ breweryId: "brewery", breweryName: "Demo Brewing", role: "warehouse" as const }];
    expect(await inviteLanding(auth(staff), "staff")).toMatchObject({ name: "Demo Brewing", role: "warehouse" });
    expect(await inviteLanding(auth(staff), "customer")).toBeUndefined();
    const customer = [{ breweryId: "brewery", breweryName: "Demo Brewing", customerId: "customer", customerName: "Bar" }];
    expect(await inviteLanding(auth([], customer), "customer")).toMatchObject({ name: "Demo Brewing", role: "customer" });
  });
});
