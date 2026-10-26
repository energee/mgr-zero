// Gates the staff deep-link redirect, shared hidden form field, and consent-first email callback.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type * as Registry from "@/lib/commands/registry";

const identity = vi.hoisted(() => vi.fn());
const pending = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
const requestHeaders = vi.hoisted(() => new Headers());
const exchangeCodeForSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/commands/registry", async original => ({ ...await original<typeof Registry>(), runCommand: pending }));
vi.mock("@/lib/auth/request-context", () => ({
  getRequestIdentity: identity,
  getStaffMemberships: async () => [],
  getRequestAuthContext: () => ({
    getIdentity: identity,
    getSupabaseClient: async () => ({}),
    getStaffMemberships: async () => [{}],
    getCustomerMemberships: async () => [],
  }),
  homePath: async () => "/",
}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders, cookies: async () => ({ get: () => undefined }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string): never => { throw new Error(`redirect:${path}`); } }));
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { exchangeCodeForSession } }) }));

import { getActiveBrewery } from "@/lib/brewery";
import LoginPage from "@/app/(auth)/login/page";
import { LoginForm } from "@/components/login-form";
import { GET } from "@/app/(auth)/auth/confirm/route";

beforeEach(() => {
  identity.mockResolvedValue(null);
  pending.mockResolvedValue([]);
  requestHeaders.delete("x-mgr-path");
  exchangeCodeForSession.mockResolvedValue({ data: { user: { id: "staff" } }, error: null });
});

describe("staff deep-link sign-in (#1399)", () => {
  it("encodes the requested staff path and query in the signed-out redirect", async () => {
    requestHeaders.set("x-mgr-path", "/settings/team?tab=invites");
    await expect(getActiveBrewery()).rejects.toThrow("redirect:/login?next=%2Fsettings%2Fteam%3Ftab%3Dinvites");
  });

  it("passes next from the page to the existing shared form", async () => {
    const page = await LoginPage({ searchParams: Promise.resolve({ next: "/settings/team" }) });
    expect(page.type).toBe(LoginForm);
    expect(page.props.next).toBe("/settings/team");
    const html = renderToStaticMarkup(createElement(LoginForm, { next: "/settings/team" }));
    expect(html).toMatch(/<form[^>]*>[\s\S]*<input[^>]*name="next"[^>]*value="\/settings\/team"/);
    expect(html).toContain("Email me a link");
  });

  it("honors next for an already signed-in visit to login", async () => {
    identity.mockResolvedValue({ userId: "staff" });
    await expect(LoginPage({ searchParams: Promise.resolve({ next: "/settings/team" }) })).rejects.toThrow("redirect:/settings/team");
  });

  it.each([false, true])("keeps email-link invitations first (pending=%s)", async hasInvitations => {
    pending.mockResolvedValue(hasInvitations ? [{}] : []);
    const response = await GET(new NextRequest("http://localhost:3000/auth/confirm?code=valid&next=%2Fsettings%2Fteam%3Ftab%3Dinvites"));
    expect(response.headers.get("location")).toBe(`http://localhost:3000${hasInvitations ? "/invitations" : "/settings/team?tab=invites"}`);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("valid");
  });

  it.each(["/password", "/password?portal=1"])("finishes recovery at %s even with pending invitations", async next => {
    pending.mockResolvedValue([{}]);
    const response = await GET(new NextRequest(`http://localhost:3000/auth/confirm?${new URLSearchParams({ code: "recovery", next })}`));
    expect(response.headers.get("location")).toBe(`http://localhost:3000${next}`);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("recovery");
  });
});
