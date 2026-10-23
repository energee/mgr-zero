// tests/no-membership-page.test.ts — where /no-membership sends each kind of
// signed-in account, and that a staff login reaching it from the portal is told
// the portal is for customers and offered Today (#1145).
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ staff: [] as unknown[], customers: [] as unknown[] }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect ${href}`); } }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: () => ({ dedicated: false }) }));
vi.mock("@/app/(auth)/actions", () => ({ logout: async () => undefined }));
vi.mock("@/lib/auth/request-context", () => ({
  getRequestIdentity: async () => ({ userId: "person" }),
  getStaffMemberships: async () => state.staff,
  getCustomerMemberships: async () => state.customers,
}));

import NoMembershipPage from "../app/(auth)/no-membership/page";

beforeEach(() => { state.staff = []; state.customers = []; });

it("tells a staff-only login the portal is for customers and links back to Today", async () => {
  state.staff = [{ breweryId: "brewery" }];
  const html = renderToStaticMarkup(await NoMembershipPage());
  expect(html).toContain("The portal is for customer accounts. You are signed in as staff.");
  expect(html).toContain('href="/"');
  expect(html).toContain("Back to Today");
  expect(html).not.toContain("Create brewery");
});

it("sends an account with a customer membership home: the portal, or Today for staff too", async () => {
  state.customers = [{ customerId: "customer" }];
  await expect(NoMembershipPage()).rejects.toThrow(/^redirect \/portal$/);
  state.staff = [{ breweryId: "brewery" }];
  await expect(NoMembershipPage()).rejects.toThrow(/^redirect \/$/);
});

it("keeps No brewery yet for a login on no brewery and no customer", async () => {
  const html = renderToStaticMarkup(await NoMembershipPage());
  expect(html).toContain("No brewery yet");
  expect(html).toContain('href="/create-brewery"');
});
