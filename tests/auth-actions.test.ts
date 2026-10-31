import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Registry from "@/lib/commands/registry";

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(), signOut: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }));
const verifyCurrentPassword = vi.hoisted(() => vi.fn());
const memberships = vi.hoisted(() => ({ staff: [{}] as unknown[], customer: [] as unknown[] }));
const cookieStore = vi.hoisted(() => ({ set: vi.fn() }));
const pendingInvitations = vi.hoisted(() => vi.fn(async () => [] as unknown[]));
vi.mock("@/lib/commands/registry", async (original) => ({
  ...await original<typeof Registry>(),
  runCommand: pendingInvitations,
}));

vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ auth }), verifyCurrentPassword }));
vi.mock("@/lib/auth/request-context", async (original) => ({
  ...await original<typeof import("@/lib/auth/request-context")>(),
  createRequestAuthContext: () => ({ getIdentity: async () => ({ userId: "owner" }), getSupabaseClient: async () => ({ auth }), getStaffMemberships: async () => memberships.staff, getCustomerMemberships: async () => memberships.customer }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ origin: "https://attacker.invalid" }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { emailLogin, login, savePassword, sendReset } from "@/app/(auth)/actions";
import { PASSWORD_SAVED_COOKIE } from "@/lib/auth/password";

vi.stubEnv("APP_URL", "https://mgr.example");
afterAll(() => vi.unstubAllEnvs());

describe("passwordless sign-in", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([undefined, "", "not-an-email"])("rejects invalid email %s before Auth even without browser validation (#708)", async (email) => {
    const form = new FormData();
    if (email !== undefined) form.set("email", email);
    await expect(emailLogin(form)).rejects.toThrow(new Error("redirect:/login?error=email"));
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("emails an existing account a configured-origin link regardless of request Origin", async () => {
    const form = new FormData();
    form.set("email", "maria@example.com");

    await expect(emailLogin(form)).rejects.toThrow(new Error("redirect:/login?sent=1"));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "maria@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://mgr.example/auth/confirm?next=%2F",
      },
    });
  });

  it("keeps the deep link in the email callback and sent page", async () => {
    const form = new FormData();
    form.set("email", "maria@example.com");
    form.set("next", "/settings/team?tab=invites");
    await expect(emailLogin(form)).rejects.toThrow("redirect:/login?sent=1&next=%2Fsettings%2Fteam%3Ftab%3Dinvites");
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "maria@example.com",
      options: { shouldCreateUser: false, emailRedirectTo: "https://mgr.example/auth/confirm?next=%2Fsettings%2Fteam%3Ftab%3Dinvites" },
    });
  });

  it("keeps the deep link when an email address is invalid", async () => {
    const form = new FormData();
    form.set("email", "invalid");
    form.set("next", "/settings/team");
    await expect(emailLogin(form)).rejects.toThrow("redirect:/login?error=email&next=%2Fsettings%2Fteam");
  });
});

describe("set new password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getUser.mockResolvedValue({ data: { user: { id: "owner", email: "owner@example.com" } }, error: null });
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner", amr: [{ method: "password", timestamp: Date.now() / 1000 }] } }, error: null });
    verifyCurrentPassword.mockResolvedValue(null);
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    memberships.staff = [{}];
    memberships.customer = [];
  });

  function changeForm(overrides: Record<string, string> = {}) {
    const form = new FormData();
    for (const [name, value] of Object.entries({ currentPassword: "old-password", password: "new-password", confirmPassword: "new-password", ...overrides })) form.set(name, value);
    return form;
  }

  it("redirects with the Supabase error code, never its message (#472)", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password", message: "provider detail" } });
    await expect(savePassword(changeForm())).rejects.toThrow(new Error("redirect:/password?error=same_password"));
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("refuses mismatched confirmation before reauthentication or update", async () => {
    await expect(savePassword(changeForm({ confirmPassword: "a typo" }))).rejects.toThrow(new Error("redirect:/password?error=confirmPassword"));
    expect(verifyCurrentPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it.each([
    { field: "currentPassword", value: "" },
    { field: "password", value: "short" },
    { field: "confirmPassword", value: "a typo" },
  ])("retains the local exit when $field is invalid", async ({ field, value }) => {
    await expect(savePassword(changeForm({ [field]: value, next: "/orders" }))).rejects.toThrow(`redirect:/password?error=${field}&next=%2Forders`);
    expect(verifyCurrentPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("rejects wrong current password and never changes the account", async () => {
    verifyCurrentPassword.mockResolvedValue("invalid_credentials");
    await expect(savePassword(changeForm({ email: "attacker@example.com", next: "/orders" }))).rejects.toThrow(new Error("redirect:/password?error=wrong_current&next=%2Forders"));
    expect(verifyCurrentPassword).toHaveBeenCalledWith("owner@example.com", "old-password", "owner");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("retains the local exit when current-password verification fails", async () => {
    verifyCurrentPassword.mockResolvedValue("unexpected_failure");
    await expect(savePassword(changeForm({ next: "/orders" }))).rejects.toThrow("redirect:/password?error=reauth_failed&next=%2Forders");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("saves with current password then revokes only other sessions", async () => {
    await expect(savePassword(changeForm({ next: "/orders" }))).rejects.toThrow(new Error("redirect:/"));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password", current_password: "old-password" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(auth.signOut.mock.invocationCallOrder[0]);
  });

  it("does not trust form recovery flags or unverified claims", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner", amr: [{ method: "recovery", timestamp: Date.now() / 1000 }] } }, error: { code: "bad_jwt" } });
    await expect(savePassword(changeForm({ currentPassword: "", recovery: "true" }))).rejects.toThrow(new Error("redirect:/password?error=currentPassword"));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("accepts Auth-verified recovery without an old password and ends the recovery session", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await expect(savePassword(changeForm({ currentPassword: "", next: "/orders" }))).rejects.toThrow(new Error("redirect:/login"));
    expect(verifyCurrentPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(auth.signOut.mock.calls).toEqual([[{ scope: "others" }], [{ scope: "local" }]]);
  });

  it("reports a saved password separately when session revocation fails", async () => {
    auth.signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    await expect(savePassword(changeForm({ next: "/orders" }))).rejects.toThrow(new Error("redirect:/password?saved=1&error=revoke_failed&next=%2Forders"));
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it("retains the saved outcome and local exit when the recovery session cannot end", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    auth.signOut.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: "unexpected_failure" } });
    await expect(savePassword(changeForm({ currentPassword: "", next: "/orders" }))).rejects.toThrow("redirect:/password?saved=1&error=signout_failed&next=%2Forders");
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
    expect(cookieStore.set).toHaveBeenCalledWith(PASSWORD_SAVED_COOKIE, "1", expect.objectContaining({ httpOnly: true }));
  });

  it("sends a buyer's recovery back to the portal sign-in", async () => {
    memberships.staff = [];
    memberships.customer = [{}];
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await expect(savePassword(changeForm({ currentPassword: "", next: "/orders" }))).rejects.toThrow(new Error("redirect:/portal/login"));
  });

  it("keeps a buyer's saved outcome on the portal and marks it as really saved", async () => {
    memberships.staff = [];
    memberships.customer = [{}];
    auth.signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    await expect(savePassword(changeForm())).rejects.toThrow(new Error("redirect:/password?saved=1&portal=1&error=revoke_failed"));
    expect(cookieStore.set).toHaveBeenCalledWith(PASSWORD_SAVED_COOKIE, "1", expect.objectContaining({ path: "/password", httpOnly: true }));
  });

  it("does not ask an account without an email for a current password", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "owner", email: undefined } }, error: null });
    await expect(savePassword(changeForm({ next: "/orders" }))).rejects.toThrow(new Error("redirect:/password?error=reauth_failed&next=%2Forders"));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("preserves the local exit after a refused password (#1250)", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
    await expect(savePassword(changeForm({ next: "/orders" }))).rejects.toThrow("redirect:/password?error=same_password&next=%2Forders");
  });

  it.each(["https://attacker.example", "//attacker.example", "/password"])("does not preserve unsafe or looping next %s", async (next) => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
    await expect(savePassword(changeForm({ next }))).rejects.toThrow("redirect:/password?error=same_password&next=%2F");
  });
});

describe("password sign-in failure (#1398)", () => {
  it.each([false, true])("returns useful state without redirecting or retaining the password (portal=%s)", async (portal) => {
    redirect.mockClear();
    auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", message: "Private provider detail" } });
    const form = new FormData();
    form.set("email", "qa+buyer@example.com");
    form.set("password", "never-put-password-in-url");
    if (portal) form.set("portal", "1");
    await expect(login({}, form)).resolves.toEqual({ email: "qa+buyer@example.com", error: "Incorrect email or password." });
    expect(redirect).not.toHaveBeenCalled();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "qa+buyer@example.com", password: "never-put-password-in-url" });
  });
});

describe("staff sign-in return target (#1399)", () => {
  beforeEach(() => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    pendingInvitations.mockResolvedValue([]);
    memberships.staff = [{}];
    memberships.customer = [];
  });

  it.each([
    ["/settings/team?tab=invites", "/settings/team?tab=invites"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
    ["/\\evil.example", "/"],
    ["/password", "/"],
    ["", "/"],
  ])("routes next=%s to %s", async (next, destination) => {
    const form = new FormData();
    form.set("email", "maria@example.com");
    form.set("password", "password");
    form.set("next", next);
    await expect(login({}, form)).rejects.toThrow(`redirect:${destination}`);
  });

  it("keeps pending invitations ahead of a return target", async () => {
    pendingInvitations.mockResolvedValue([{}]);
    const form = new FormData();
    form.set("next", "/settings/team");
    await expect(login({}, form)).rejects.toThrow("redirect:/invitations");
  });

  it("falls back to the account home for unsafe next", async () => {
    memberships.staff = [];
    memberships.customer = [{}];
    const form = new FormData();
    form.set("next", "//evil.example");
    await expect(login({}, form)).rejects.toThrow("redirect:/portal");
  });
});

describe("reset submission outcome (#1398)", () => {
  it.each([false, true])("confirms only a successful Auth request (portal=%s)", async (portal) => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const form = new FormData();
    form.set("email", "buyer@example.com");
    if (portal) form.set("portal", "1");
    await expect(sendReset({}, form)).resolves.toEqual({ email: "buyer@example.com", sent: true });
    expect(auth.resetPasswordForEmail).toHaveBeenLastCalledWith("buyer@example.com", {
      redirectTo: `https://mgr.example/auth/confirm?next=${encodeURIComponent(portal ? "/password?portal=1" : "/password")}`,
    });
  });

  it("replaces a previous success with a safe failure when Auth refuses the request", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: { message: "Private provider detail" } });
    const form = new FormData();
    form.set("email", "buyer@example.com");
    await expect(sendReset({ sent: true }, form)).resolves.toEqual({
      email: "buyer@example.com", error: "The reset link could not be requested. Try again.",
    });
  });
});
