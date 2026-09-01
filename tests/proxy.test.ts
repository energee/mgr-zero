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

import { proxy } from "@/proxy";

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
