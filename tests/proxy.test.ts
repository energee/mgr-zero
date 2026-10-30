// tests/proxy.test.ts — verifies the proxy refreshes the session with one local claims check and its refresh cookies preserve no-cache response headers.
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn());
const getClaims = vi.hoisted(() => vi.fn());
const getUser = vi.hoisted(() => vi.fn());

type SsrOptions = {
  cookies: {
    setAll: (
      cookies: Array<{ name: string; value: string; options: Record<string, unknown> }>,
      headers: Record<string, string>
    ) => void;
  };
};

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { config, proxy } from "@/proxy";

beforeEach(() => {
  createServerClient.mockReset();
  getClaims.mockReset();
  getUser.mockReset();
  createServerClient.mockImplementation((_url: string, _key: string, options: SsrOptions) => {
    getClaims.mockImplementation(async () => {
      options.cookies.setAll(
        [{ name: "sb-session", value: "refreshed", options: { httpOnly: true } }],
        {
          "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          Expires: "0",
          Pragma: "no-cache",
        }
      );
      return { data: null, error: null };
    });
    return { auth: { getClaims, getUser } };
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("Supabase proxy refresh", () => {
  it("skips non-document assets and endpoints, but protects every document route", () => {
    const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    for (const path of ["/api/search", "/api/command", "/_next/static/chunk.js", "/favicon.ico", "/mock/avatar.jpg"]) {
      expect(matches(path), path).toBe(false);
    }
    for (const path of ["/docs", "/docs/staff-guide", "/screens/frame/0", "/inventory", "/login", "/portal/login"]) {
      expect(matches(path), path).toBe(true);
    }
  });

  it.each(["/docs", "/docs/staff-guide", "/screens/frame/0"])("protects public %s without a session check", async (path) => {
    const response = await proxy(new NextRequest(`http://localhost:3000${path}`));
    expect(createServerClient).not.toHaveBeenCalled();
    expect(response.headers.get("content-security-policy")).toContain("'strict-dynamic'");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("server-timing")).toBeNull();
  });

  it.each([false, true])("replaces caller nonces with fresh request/response CSP, including refresh=%s", async (refresh) => {
    vi.stubEnv("NODE_ENV", "production");
    if (!refresh) createServerClient.mockReturnValue({ auth: { getClaims: async () => ({ data: null, error: null }) } });
    const request = () => new NextRequest("http://localhost:3000/login", {
      headers: { "x-nonce": "attacker", "Content-Security-Policy": "script-src 'unsafe-inline'" },
    });
    const response = await proxy(request());
    const nonce = response.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]+$/);
    expect(nonce).not.toBe("attacker");
    const csp = response.headers.get("content-security-policy");
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).toContain("frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(response.headers.get("x-middleware-request-content-security-policy")).toBe(csp);
    const second = await proxy(request());
    expect(second.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
  });

  it("allows development debugging eval without permitting arbitrary inline scripts", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await proxy(new NextRequest("http://localhost:3000/login"));
    expect(response.headers.get("content-security-policy")).toContain("'unsafe-eval'");
    expect(response.headers.get("content-security-policy")).not.toContain("'unsafe-inline'");
  });

  it("forwards refreshed cookies through one current request override", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/inventory", {
        headers: { cookie: "sb-session=stale" },
      })
    );

    expect(response.headers.get("x-middleware-override-headers")?.split(",").map(value => value.trim())).toContain("cookie");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-session=refreshed");
  });

  it("preserves refresh cache headers while rebuilding the response", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/inventory"));

    expect(response.headers.get("Cache-Control")).toBe(
      "private, no-cache, no-store, must-revalidate, max-age=0"
    );
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });

  it.each([false, true])("forwards the original path and query, replacing client input (refresh=%s)", async (refresh) => {
    if (!refresh) createServerClient.mockReturnValue({ auth: { getClaims: async () => ({ data: null, error: null }) } });
    const response = await proxy(new NextRequest("http://localhost:3000/settings/team?tab=invites", {
      headers: { "x-mgr-path": "//evil.example" },
    }));
    expect(response.headers.get("x-middleware-request-x-mgr-path")).toBe("/settings/team?tab=invites");
  });

  // getClaims refreshes an expired session like getUser, but verifies the JWT
  // locally instead of calling Supabase Auth on every navigation.
  it("refreshes through one local claims check, not a getUser round trip", async () => {
    await proxy(new NextRequest("http://localhost:3000/inventory"));

    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(getUser).not.toHaveBeenCalled();
  });

  // #1490: the session stage of a hosted page load, read in the browser's Server-Timing.
  it("times the session refresh in a Server-Timing header", async () => {
    const response = await proxy(new NextRequest("http://localhost:3000/inventory"));

    expect(response.headers.get("server-timing")).toMatch(/^session;dur=[\d.]+$/);
  });
});
