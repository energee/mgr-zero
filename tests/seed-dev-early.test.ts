import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/env/server-parser", () => ({
  readServerEnv: () => ({ supabaseUrl: "https://hosted.supabase.co", supabaseSecretKey: "unused" }),
}));

it("refuses a hosted seed target before constructing a client or making network calls", async () => {
  await expect(import("@/scripts/seed-dev")).rejects.toThrow("Development seed requires a local Supabase URL");
  expect(mocks.createClient).not.toHaveBeenCalled();
});
