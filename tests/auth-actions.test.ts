import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), signInWithPassword: vi.fn(), updateUser: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }));

vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: async () => new Headers({ origin: "https://mgr.example" }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { emailLogin, login } from "@/app/(auth)/actions";

describe("passwordless sign-in", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([undefined, "", "not-an-email"])("rejects invalid email %s before Auth even without browser validation (#708)", async (email) => {
    const form = new FormData();
    if (email !== undefined) form.set("email", email);
    await expect(emailLogin(form)).rejects.toThrow("redirect:/login?error=email");
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("emails an existing account a same-origin confirmation link", async () => {
    const form = new FormData();
    form.set("email", "maria@example.com");

    await expect(emailLogin(form)).rejects.toThrow("redirect:/login?sent=1");
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
  it("redirects with the Supabase error code, never its message (#472)", async () => {
    const { savePassword } = await import("@/app/(auth)/actions");
    auth.updateUser.mockResolvedValue({ error: { code: "same_password", message: "New password should be different from the old password." } });
    const form = new FormData();
    form.set("password", "hunter2hunter2");
    await expect(savePassword(form)).rejects.toThrow("redirect:/password?error=same_password");
  });
});

describe("password sign-in failure (#1320)", () => {
  it.each([false, true])("keeps the email and original sign-in surface (portal=%s)", async (portal) => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });
    const form = new FormData();
    form.set("email", "qa+buyer@example.com");
    form.set("password", "never-put-password-in-url");
    if (portal) form.set("portal", "1");
    const surface = portal ? "/portal/login" : "/login";
    await expect(login(form)).rejects.toThrow(`redirect:${surface}?error=1&email=qa%2Bbuyer%40example.com`);
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "qa+buyer@example.com", password: "never-put-password-in-url" });
  });
});
