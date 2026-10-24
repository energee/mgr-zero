import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), getClaims: vi.fn(), signOut: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }));
const verifyCurrentPassword = vi.hoisted(() => vi.fn());
const memberships = vi.hoisted(() => ({ staff: [{}] as unknown[], customer: [] as unknown[] }));
const cookieStore = vi.hoisted(() => ({ set: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ auth }), verifyCurrentPassword }));
vi.mock("@/lib/auth/request-context", async (original) => ({
  ...await original<typeof import("@/lib/auth/request-context")>(),
  createRequestAuthContext: () => ({ getIdentity: async () => ({ userId: "owner" }), getStaffMemberships: async () => memberships.staff, getCustomerMemberships: async () => memberships.customer }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => new Headers({ origin: "https://mgr.example" }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { emailLogin, savePassword } from "@/app/(auth)/actions";
import { PASSWORD_SAVED_COOKIE } from "@/lib/auth/password";

describe("passwordless sign-in", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([undefined, "", "not-an-email"])("rejects invalid email %s before Auth even without browser validation (#708)", async (email) => {
    const form = new FormData();
    if (email !== undefined) form.set("email", email);
    await expect(emailLogin(form)).rejects.toThrow(new Error("redirect:/login?error=email"));
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("emails an existing account a same-origin confirmation link", async () => {
    const form = new FormData();
    form.set("email", "maria@example.com");

    await expect(emailLogin(form)).rejects.toThrow(new Error("redirect:/login?sent=1"));
    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: "maria@example.com",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://mgr.example/auth/confirm?next=/",
      },
    });
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

  it("rejects wrong current password and never changes the account", async () => {
    verifyCurrentPassword.mockResolvedValue("invalid_credentials");
    await expect(savePassword(changeForm({ email: "attacker@example.com" }))).rejects.toThrow(new Error("redirect:/password?error=wrong_current"));
    expect(verifyCurrentPassword).toHaveBeenCalledWith("owner@example.com", "old-password", "owner");
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("saves with current password then revokes only other sessions", async () => {
    await expect(savePassword(changeForm())).rejects.toThrow(new Error("redirect:/"));
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
    await expect(savePassword(changeForm({ currentPassword: "" }))).rejects.toThrow(new Error("redirect:/login"));
    expect(verifyCurrentPassword).not.toHaveBeenCalled();
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password" });
    expect(auth.signOut.mock.calls).toEqual([[{ scope: "others" }], [{ scope: "local" }]]);
  });

  it("reports a saved password separately when session revocation fails", async () => {
    auth.signOut.mockResolvedValue({ error: { code: "unexpected_failure" } });
    await expect(savePassword(changeForm())).rejects.toThrow(new Error("redirect:/password?saved=1&error=revoke_failed"));
    expect(auth.updateUser).toHaveBeenCalledTimes(1);
  });

  it("sends a buyer's recovery back to the portal sign-in", async () => {
    memberships.staff = [];
    memberships.customer = [{}];
    auth.getClaims.mockResolvedValue({ data: { claims: { sub: "owner", amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) }] } }, error: null });
    await expect(savePassword(changeForm({ currentPassword: "" }))).rejects.toThrow(new Error("redirect:/portal/login"));
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
    await expect(savePassword(changeForm())).rejects.toThrow(new Error("redirect:/password?error=reauth_failed"));
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
