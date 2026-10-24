// Password entry keeps its title, verified account, and local staff/customer exit.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getRequestIdentity: vi.fn(),
  getStaffMemberships: vi.fn(),
  getCustomerMemberships: vi.fn(),
}));
vi.mock("@/lib/auth/request-context", () => auth);
vi.mock("@/app/(auth)/actions", () => ({ savePassword: vi.fn() }));

import PasswordPage, { metadata } from "@/app/(auth)/password/page";

beforeEach(() => {
  auth.getRequestIdentity.mockResolvedValue({ email: "operator@example.com", userId: "operator" });
  auth.getStaffMemberships.mockResolvedValue([{}]);
  auth.getCustomerMemberships.mockResolvedValue([]);
});

it("names the password tab and returns to the page opened from Me (#1250)", async () => {
  expect(metadata.title).toBe("Change password");
  const page = await PasswordPage({ searchParams: Promise.resolve({ next: "/orders" }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain('href="/orders"');
  expect(html).toContain("Back to MGR");
  expect(html).toContain("operator@example.com");
});

it("provides a staff home exit for a direct visit or recovery link (#1250)", async () => {
  const page = await PasswordPage({ searchParams: Promise.resolve({}) });
  expect(renderToStaticMarkup(page)).toContain('href="/"');
});

it("returns a customer-only recovery visit to Shop (#1250)", async () => {
  auth.getStaffMemberships.mockResolvedValue([]);
  auth.getCustomerMemberships.mockResolvedValue([{}]);
  const page = await PasswordPage({ searchParams: Promise.resolve({}) });
  expect(renderToStaticMarkup(page)).toContain('href="/portal"');
});
