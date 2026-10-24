// Password entry returns to a safe local staff/customer destination.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  getClaims: vi.fn(),
  homePath: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth }),
}));
vi.mock("@/lib/auth/request-context", () => ({
  createRequestAuthContext: () => ({}),
  homePath: auth.homePath,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ has: () => false }) }));
vi.mock("@/app/(auth)/actions", () => ({ savePassword: vi.fn(), endPasswordSessions: vi.fn() }));

import PasswordPage from "@/app/(auth)/password/page";

beforeEach(() => {
  auth.getUser.mockResolvedValue({ data: { user: { email: "operator@example.com", id: "operator" } } });
  auth.getClaims.mockResolvedValue({ data: { claims: null }, error: null });
  auth.homePath.mockResolvedValue("/");
});

it("returns to the page opened from Me (#1250)", async () => {
  const page = await PasswordPage({ searchParams: Promise.resolve({ next: "/orders" }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain('href="/orders"');
  expect(html).toContain('name="next" value="/orders"');
});

it("provides a staff home exit for a direct visit or recovery link (#1250)", async () => {
  const page = await PasswordPage({ searchParams: Promise.resolve({}) });
  expect(renderToStaticMarkup(page)).toContain('href="/"');
});

it("returns a customer-only visit to Shop (#1250)", async () => {
  auth.homePath.mockResolvedValue("/portal");
  const page = await PasswordPage({ searchParams: Promise.resolve({}) });
  expect(renderToStaticMarkup(page)).toContain('href="/portal"');
});

it.each(["https://outside.example", "//outside.example", "/password"])("does not use unsafe return destination %s", async next => {
  const page = await PasswordPage({ searchParams: Promise.resolve({ next }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain('href="/"');
  expect(html).not.toContain(`href="${next}"`);
});
