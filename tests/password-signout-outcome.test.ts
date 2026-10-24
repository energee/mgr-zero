import { createServerClient as createSSR } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({ db: undefined as SupabaseClient | undefined }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => boundary.db, verifyCurrentPassword: vi.fn() }));
const savedCookies = vi.hoisted(() => new Set<string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({ set: (name: string) => savedCookies.add(name), has: (name: string) => savedCookies.has(name) }),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string): never => { throw new Error(`redirect:${path}`); } }));

import PasswordPage from "@/app/(auth)/password/page";
import { endPasswordSessions, savePassword } from "@/app/(auth)/actions";
import { PASSWORD_SAVED_COOKIE } from "@/lib/auth/password";

/** Exercise the installed Auth and SSR cookie adapters, not a signOut stub.
 * All transport responses belong to this synthetic SDK boundary; no Auth user
 * or provider is created and no network request is sent.
 */
async function signedInBoundary(failureScope: "local" | "global" | "others") {
  const now = Math.floor(Date.now() / 1000);
  const user = { id: "13190000-0000-4000-8000-000000000001", aud: "authenticated", email: "password-outcome@test.local", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: now + 3600, iat: now, amr: [{ method: "recovery", timestamp: now }] })}.c2lnbmF0dXJl`;
  const jar = new Map<string, string>();
  const removed: string[] = [];
  const db = createSSR("https://password-outcome.supabase.co", "synthetic-publishable-key", {
    auth: { autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith("/logout")) {
        if (url.searchParams.get("scope") === failureScope) {
          return new Response(JSON.stringify({ code: "unexpected_failure", msg: "Synthetic server failure" }), { status: 502, headers: { "Content-Type": "application/json" } });
        }
        return new Response(null, { status: 204 });
      }
      // Membership reads: this synthetic account belongs to no brewery or customer.
      if (url.pathname.startsWith("/rest/v1/")) return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.pathname.endsWith("/user")) return new Response(JSON.stringify(user), { status: 200, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected SDK endpoint ${url.pathname}`);
    } },
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (changes) => changes.forEach(({ name, value, options }) => {
        if (options.maxAge === 0) { removed.push(name); jar.delete(name); }
        else jar.set(name, value);
      }),
    },
  });
  const { error } = await db.auth.setSession({ access_token: token, refresh_token: "synthetic-refresh-token" });
  expect(error).toBeNull();
  expect(jar.size).toBeGreaterThan(0);
  boundary.db = db;
  return { db, removed };
}

describe("saved password outcome after installed SDK cookie clearing", () => {
  it.each(["local", "global"] as const)("keeps saved result reachable after failed %s logout clears the session", async (scope) => {
    savedCookies.clear();
    const { db, removed } = await signedInBoundary(scope);
    if (scope === "global") savedCookies.add(PASSWORD_SAVED_COOKIE);
    if (scope === "local") {
      const form = new FormData();
      form.set("password", "synthetic-new-password");
      form.set("confirmPassword", "synthetic-new-password");
      await expect(savePassword(form)).rejects.toThrow("redirect:/password?saved=1&error=signout_failed");
    } else {
      await expect(endPasswordSessions()).rejects.toThrow("redirect:/password?saved=1&error=revoke_failed");
    }
    expect(removed.some(name => name.includes("auth-token"))).toBe(true);
    expect((await db.auth.getSession()).data.session).toBeNull();
    const page = await PasswordPage({ searchParams: Promise.resolve({ saved: "1", error: scope === "local" ? "signout_failed" : "revoke_failed" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Password saved");
    expect(html).toContain("You do not need to change it again.");
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('name="password"');
    expect(html).not.toContain("Reset link expired");
    expect(html).toContain(scope === "local" ? "Other sessions were signed out" : "could not confirm that other sessions were signed out");
    await expect(endPasswordSessions()).rejects.toThrow("redirect:/password?saved=1&error=revoke_failed");
  });

  it("ends a retained recovery session before offering a real sign-in", async () => {
    savedCookies.clear();
    const { db } = await signedInBoundary("others");
    const form = new FormData();
    form.set("password", "synthetic-new-password");
    form.set("confirmPassword", "synthetic-new-password");
    await expect(savePassword(form)).rejects.toThrow("redirect:/password?saved=1&error=revoke_failed");
    expect((await db.auth.getSession()).data.session).not.toBeNull();

    const page = await PasswordPage({ searchParams: Promise.resolve({ saved: "1", error: "revoke_failed" }) });
    const html = renderToStaticMarkup(page);
    expect(html).toContain("Password saved");
    expect(html).toContain("Select Sign out all sessions to try again.");
    expect(html).toContain("Sign out all sessions");
    expect(html).not.toContain('href="/login"');
    expect(html).not.toContain("Sign in with your new password");
    expect(page.props.children[1].props.extraAction).toBe(endPasswordSessions);

    await expect(page.props.children[1].props.extraAction()).rejects.toThrow("redirect:/login");
    expect((await db.auth.getSession()).data.session).toBeNull();
  });

  it("ignores a crafted saved link that no save produced", async () => {
    savedCookies.clear();
    boundary.db = createSSR("https://password-outcome.supabase.co", "synthetic-publishable-key", { cookies: { getAll: () => [], setAll: () => {} } });
    await expect(PasswordPage({ searchParams: Promise.resolve({ saved: "1" }) })).rejects.toThrow(new Error("redirect:/reset?expired=1"));
  });

  it("sends a buyer's saved outcome to the portal sign-in", async () => {
    savedCookies.clear();
    savedCookies.add(PASSWORD_SAVED_COOKIE);
    boundary.db = createSSR("https://password-outcome.supabase.co", "synthetic-publishable-key", { cookies: { getAll: () => [], setAll: () => {} } });
    const html = renderToStaticMarkup(await PasswordPage({ searchParams: Promise.resolve({ saved: "1", portal: "1", error: "signout_failed" }) }));
    expect(html).toContain('href="/portal/login"');
  });
});
