// tests/proxy.test.ts — verifies Supabase refresh cookies preserve no-cache response headers.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn());
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
  getUser.mockReset();
  createServerClient.mockImplementation((_url: string, _key: string, options: SsrOptions) => {
    getUser.mockImplementation(async () => {
      options.cookies.setAll(
        [{ name: "sb-session", value: "refreshed", options: { httpOnly: true } }],
        {
          "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0",
          Expires: "0",
          Pragma: "no-cache",
        }
      );
      return { data: { user: null }, error: null };
    });
    return { auth: { getUser } };
  });
});

describe("Supabase proxy refresh", () => {
  it("does not refresh sessions for the customer guides or their search", () => {
    const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);
    // /docs is the master chooser - the primary public entry point, not just a prefix.
    expect(matches("/docs")).toBe(false);
    expect(matches("/docs/staff-guide")).toBe(false);
    expect(matches("/api/search")).toBe(false);
    // The screen frames the docs embed are public like the docs themselves.
    expect(matches("/screens/frame/0")).toBe(false);
    expect(matches("/inventory")).toBe(true);
  });

  it("forwards refreshed cookies through one current request override", async () => {
    const response = await proxy(
      new NextRequest("http://localhost:3000/inventory", {
        headers: { cookie: "sb-session=stale" },
      })
    );

    expect(response.headers.get("x-middleware-override-headers")).toBe("cookie");
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

  it("uses exactly one auth refresh lookup", async () => {
    await proxy(new NextRequest("http://localhost:3000/inventory"));

    expect(getUser).toHaveBeenCalledTimes(1);
  });
});
