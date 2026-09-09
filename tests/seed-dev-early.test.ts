import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); mocks.createClient.mockReset(); });

describe("seed entrypoint refusal", () => {
  it.each(["https://hosted.supabase.co", "http://@localhost:54321", "http://:@localhost:54321"])("refuses raw %s before constructing a client or making network calls", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    vi.stubEnv("SUPABASE_SECRET_KEY", "test-secret-key");
    mocks.createClient.mockImplementation(() => { throw new Error("CLIENT_CONSTRUCTED"); });
    await expect(import("@/scripts/seed-dev")).rejects.toThrow("Development seed requires a local Supabase URL");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
