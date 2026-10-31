import type { Database } from "@/lib/supabase/database";
// tests/request-auth.test.ts — proves request auth stays deduplicated and real failed entry submissions render assertive errors.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { admin, makeBrewery, makeCustomerUser, makeStaff, makeStaffCtx, seedCustomer, sql } from "./helpers";

const request = vi.hoisted(() => ({ db: undefined as SupabaseClient<Database> | undefined }));
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
  headers: vi.fn(async () => new Headers()),
}));

vi.mock("next/navigation", () => ({
  redirect: navigation.redirect,
}));

import { buildContext } from "@/lib/commands/context";
import { runCommand } from "@/lib/commands/registry";
import { POST } from "@/app/api/command/route";
import { publicEnv } from "@/lib/env/public";
import { acceptInvite, login } from "@/app/(auth)/actions";
import { createServerClient } from "@/lib/supabase/server";
import LoginPage from "@/app/(auth)/login/page";
import PortalLoginPage from "@/app/(auth)/portal/login/page";
import AcceptPage from "@/app/(auth)/accept/page";
import { LoginForm } from "@/components/login-form";
import { getActiveCustomer, getPortalContext } from "@/lib/portal";
import { getActiveBrewery } from "@/lib/brewery";

afterEach(() => {
  request.db = undefined;
  vi.clearAllMocks();
});

function requestClient(fetch: typeof globalThis.fetch) {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
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
  it("sends signed-out portal pages to portal sign-in without changing staff entry (#1416)", async () => {
    request.db = requestClient(globalThis.fetch);
    await expect(getActiveCustomer()).rejects.toThrow("redirect:/portal/login");
    await expect(getPortalContext()).rejects.toThrow("redirect:/portal/login");
    await expect(getActiveBrewery()).rejects.toThrow("redirect:/login");
    const html = renderToStaticMarkup(await PortalLoginPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("Sign in to your account");
    expect(html).toContain('href="/reset?portal=1"');
    expect(html).not.toContain("Email me a link");
  });

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

  it.each([
    ["plato", null],
    ["sg", null],
    ["plato", "sg"],
    ["sg", "plato"],
  ] as const)("loads shell gravity choices with memberships and refreshes saved preferences (%s, %s)", async (breweryUnit, mine) => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    sql(`update breweries set gravity_unit='${breweryUnit}' where id='${brewery.id}'`);
    const nativeFetch = globalThis.fetch;
    const reads: string[] = [];
    const countingFetch: typeof globalThis.fetch = async (input, init) => {
      const value = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
      const path = new URL(value).pathname;
      if (path.startsWith("/rest/v1/")) reads.push(path);
      return nativeFetch(input, init);
    };
    request.db = await signInAs(staff.email, countingFetch);
    reads.length = 0;

    expect(await getActiveBrewery()).toMatchObject({ id: brewery.id, gravityUnit: breweryUnit, myGravityUnit: null });
    expect(reads.toSorted()).toEqual(["/rest/v1/brewery_users", "/rest/v1/staff_brewery"]);

    await runCommand("set_my_gravity_unit", { unit: mine }, await buildContext(brewery.id));
    reads.length = 0;
    expect(await getActiveBrewery()).toMatchObject({ id: brewery.id, gravityUnit: breweryUnit, myGravityUnit: mine });
    expect(reads.toSorted()).toEqual(["/rest/v1/brewery_users", "/rest/v1/staff_brewery"]);

    await runCommand("set_my_gravity_unit", { unit: null }, await buildContext(brewery.id));
    expect(await getActiveBrewery()).toMatchObject({ gravityUnit: breweryUnit, myGravityUnit: null });
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
        body: JSON.stringify({ breweryId: brewery.id, name: "list_brands", input: {} }),
      })
    );

    expect(response.status).toBe(200);

    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(membershipRequests).toBe(1);
  });

  it("shares one admission budget between cookie and bearer routes", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    request.db = await signInAs(staff.email, globalThis.fetch);
    const token = (await request.db.auth.getSession()).data.session!.access_token;
    sql(`insert into private.command_admissions(user_id,window_started_at,request_count) values ('${staff.id}',now(),119)
      on conflict(user_id) do update set window_started_at=now(),request_count=119`);
    const payload = JSON.stringify({ breweryId: brewery.id, name: "list_brands", input: {} });
    expect((await POST(new Request("http://localhost/api/command", { method: "POST", headers: { "content-type": "application/json" }, body: payload }))).status).toBe(200);
    expect((await POST(new Request("http://localhost/api/command", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: payload }))).status).toBe(429);
    sql(`delete from private.command_admissions where user_id='${staff.id}'`);
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

    await expect(login({}, form)).rejects.toThrow("redirect:/");

    expect(createServerClient).toHaveBeenCalledTimes(1);
    expect(getClaims).toHaveBeenCalledTimes(1);
    expect(membershipRequests).toBe(1);
  });

  it.each([false, true])("announces an actual rejected password sign-in as an alert (portal=%s)", async portal => {
    request.db = requestClient(globalThis.fetch);
    const form = new FormData();
    const email = `missing+${crypto.randomUUID()}@mgr.test`;
    form.set("email", email);
    form.set("password", "incorrect-password-1");
    if (portal) form.set("portal", "1");

    const state = await login({}, form);
    expect(state).toEqual({ email, error: "Incorrect email or password." });
    expect(navigation.redirect).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(createElement(LoginForm, { portal, ...state }));
    expect(html).toMatch(/role="alert"[^>]*>[\s\S]*?data-slot="alert-description"[^>]*>Incorrect email or password\./);
    expect(html.match(/<input[^>]*name="email"[^>]*>/)?.[0]).toContain(`value="${email}"`);
    expect(html.match(/<input[^>]*type="password"[^>]*>/)?.[0]).toContain('value=""');
    expect(html.includes("Email me a link")).toBe(!portal);
    expect(html.includes('name="portal"')).toBe(portal);
    expect(renderToStaticMarkup(createElement(LoginForm, { portal }))).not.toContain('role="alert"');
  });

  it.each(["staff", "customer", "both", "none"] as const)("redirects an authenticated %s account away from either sign-in form (#1320)", async (kind) => {
    const brewery = await makeBrewery();
    let user;
    if (kind === "customer") {
      const customer = await seedCustomer(brewery.id);
      user = await makeCustomerUser(customer.customerId);
    } else {
      user = await makeStaff(brewery.id);
      if (kind === "none") sql(`delete from brewery_users where user_id='${user.id}'`);
      if (kind === "both") {
        const customer = await seedCustomer(brewery.id);
        const { error } = await admin.from("customer_users").insert({ user_id: user.id, customer_id: customer.customerId });
        if (error) throw error;
      }
    }
    request.db = await signInAs(user.email, globalThis.fetch);
    let destination = "/";
    if (kind === "customer") destination = "/portal";
    if (kind === "none") destination = "/no-membership";
    for (const page of [LoginPage, PortalLoginPage]) {
      await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow(`redirect:${destination}`);
    }
    // A valid session also bypasses the expired-session dialog.
    await expect(LoginPage({ searchParams: Promise.resolve({ error: "expired" }) })).rejects.toThrow(`redirect:${destination}`);
  });

  it.each(["staff", "customer"] as const)("keeps pending %s consent ahead of home on both sign-in pages (#1320)", async (kind) => {
    const inviter = await makeStaffCtx((await makeBrewery()).id);
    const existingBrewery = await makeBrewery();
    const existingCustomer = await seedCustomer(existingBrewery.id);
    const recipient = kind === "staff"
      ? await makeStaff(existingBrewery.id)
      : await makeCustomerUser(existingCustomer.customerId);
    const customer = await seedCustomer(inviter.breweryId);
    const input = kind === "staff"
      ? { email: recipient.email, role: "sales" }
      : { email: recipient.email, customerId: customer.customerId };
    const invitation = await runCommand(kind === "staff" ? "invite_staff" : "invite_customer_user", input, inviter) as { state: string };
    expect(invitation.state).toBe("pending_consent");
    request.db = await signInAs(recipient.email, globalThis.fetch);
    for (const membership of ["existing", "none"]) {
      if (membership === "none") {
        const table = kind === "staff" ? "brewery_users" : "customer_users";
        sql(`delete from ${table} where user_id='${recipient.id}'`);
      }
      for (const page of [LoginPage, PortalLoginPage]) {
        await expect(page({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirect:/invitations");
      }
    }
  });

  it.each([false, true])("keeps generic and expired-session sign-in failures assertive (portal=%s)", portal => {
    for (const error of ["Sign-in failed.", "Your session expired. Sign in again."]) {
      const html = renderToStaticMarkup(createElement(LoginForm, { portal, error }));
      expect(html).toContain('role="alert"');
      expect(html).not.toContain('role="note"');
      expect(html).toContain(error);
    }
  });

  it("announces failed invitation acceptance validation on the authenticated live page", async () => {
    const brewery = await makeBrewery();
    const staff = await makeStaff(brewery.id);
    const updated = await admin.auth.admin.updateUserById(staff.id, { user_metadata: { mgr_invite_kind: "staff", mgr_invite_accepted: false } });
    if (updated.error) throw updated.error;
    request.db = await signInAs(staff.email, globalThis.fetch);
    const before = renderToStaticMarkup(await AcceptPage({ searchParams: Promise.resolve({ audience: "staff" }) }));
    expect(before).not.toContain('role="alert"');
    const form = new FormData();
    form.set("audience", "staff");
    form.set("name", "Pat Brewer");
    form.set("password", "short");

    await expect(acceptInvite(form)).rejects.toThrow("redirect:/accept?audience=staff&error=1&name=Pat+Brewer");
    const target = new URL(navigation.redirect.mock.lastCall![0], "https://mgr.test");
    const html = renderToStaticMarkup(await AcceptPage({ searchParams: Promise.resolve(Object.fromEntries(target.searchParams)) }));
    expect(html).toMatch(/role="alert"[^>]*>[\s\S]*?data-slot="alert-description"[^>]*>Enter your name and a password of at least 8 characters\./);
    expect(html).toContain('value="Pat Brewer"');
    expect(html).not.toContain('role="note"');
  });
});
