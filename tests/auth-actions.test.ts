import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn() }));
const redirect = vi.hoisted(() => vi.fn((path: string): never => { throw new Error(`redirect:${path}`); }));

vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ auth }) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(),
  headers: async () => new Headers({ origin: "https://mgr.example" }),
}));
vi.mock("next/navigation", () => ({ redirect }));

import { emailLogin } from "@/app/(auth)/actions";

describe("passwordless sign-in", () => {
  beforeEach(() => vi.clearAllMocks());

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
