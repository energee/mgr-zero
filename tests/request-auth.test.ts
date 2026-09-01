// tests/request-auth.test.ts — proves request authentication and membership resolution stay distinct and deduplicated.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeBrewery, makeStaff } from "./helpers";

const request = vi.hoisted(() => ({ db: undefined as SupabaseClient | undefined }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => request.db),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

vi.mock("next/navigation", () => ({
  redirect: navigation.redirect,
}));

import { buildContext } from "@/lib/commands/context";
import { POST } from "@/app/api/command/route";
import { publicEnv } from "@/lib/env/public";
import { login } from "@/app/(auth)/actions";
import { createServerClient } from "@/lib/supabase/server";

afterEach(() => {
  request.db = undefined;
  vi.clearAllMocks();
});

function requestClient(fetch: typeof globalThis.fetch) {
  return createClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  });
}

async function signInAs(email: string, fetch: typeof globalThis.fetch) {
  const db = requestClient(fetch);
  const { error } = await db.auth.signInWithPassword({ email, password: "test-password-1" });
  if (error) throw error;
  return db;
}

describe("request authentication", () => {
  it("distinguishes an unauthenticated request from a valid identity without brewery membership", async () => {
    request.db = requestClient(globalThis.fetch);
    await expect(buildContext(crypto.randomUUID())).rejects.toMatchObject({
      message: "unauthenticated",
      status: 401,
      code: "unauthenticated",
    });
    const memberBrewery = await makeBrewery();
    const otherBrewery = await makeBrewery();
    const staff = await makeStaff(memberBrewery.id);
    request.db = await signInAs(staff.email, globalThis.fetch);

    await expect(buildContext(otherBrewery.id)).rejects.toMatchObject({
      message: "not a member of this brewery",
      status: 403,
      code: "not_member",
    });
  });
  it("composes one identity validation and one staff membership query for command route context", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    const nativeFetch = globalThis.fetch;
    let membershipRequests = 0;
    const countingFetch: typeof globalThis.fetch = async (input, init) => {
      const value = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      if (new URL(value).pathname.endsWith("/rest/v1/brewery_users")) membershipRequests += 1;
      return nativeFetch(input, init);
    };

    request.db = await signInAs(staff.email, countingFetch);
    const getClaims = vi.spyOn(request.db.auth, "getClaims");
    membershipRequests = 0;

    const response = await POST(
      new Request("http://localhost/api/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ breweryId: brewery.id, name: "list_products", input: {} }),
      })
    );

    expect(response.status).toBe(200);

    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(membershipRequests).toBe(1);
  });

  it("uses one signed-in client, identity lookup, and staff lookup when routing a staff login", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    const nativeFetch = globalThis.fetch;
    let membershipRequests = 0;
    const countingFetch: typeof globalThis.fetch = async (input, init) => {
      const value = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      if (new URL(value).pathname.endsWith("/rest/v1/brewery_users")) membershipRequests += 1;
      return nativeFetch(input, init);
    };

    request.db = await signInAs(staff.email, countingFetch);
    const getClaims = vi.spyOn(request.db.auth, "getClaims");
    vi.mocked(createServerClient).mockClear();
    membershipRequests = 0;

    const form = new FormData();
    form.set("email", staff.email);
    form.set("password", "test-password-1");

    await expect(login(form)).rejects.toThrow("redirect:/");

    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(membershipRequests).toBe(1);
  });
});
