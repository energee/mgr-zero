import { expect, it } from "vitest";
import { resolveTestEnv } from "../scripts/test-env.mjs";
const local = "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54351\nDATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54352/postgres\nSUPABASE_SECRET_KEY=fixture-secret\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=fixture-public\nMGR_TEST_STACK=1";
it("pins local test credentials and endpoints over inherited Bun app settings", () => {
  const env = resolveTestEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://remote.invalid", DATABASE_URL: "postgresql://remote.invalid/app", SUPABASE_SECRET_KEY: "app", EXTRA: "keep" }, local);
  expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("http://127.0.0.1:54351");
  expect(env.SUPABASE_SECRET_KEY).toBe("fixture-secret");
  expect(env.EXTRA).toBe("keep");
});
it("fails closed before setup for missing or nonisolated local configuration", () => {
  expect(() => resolveTestEnv({}, undefined)).toThrow(/test-db/);
  for (const text of [local.replace("54351", "54341"), local.replace("54352", "54342"), local.replaceAll("127.0.0.1", "remote.invalid"), local.replace("MGR_TEST_STACK=1", "MGR_TEST_STACK=0"), local.replace("SUPABASE_SECRET_KEY=fixture-secret", "")]) expect(() => resolveTestEnv({}, text)).toThrow(/isolated/);
});
it("preserves CI's own disposable environment without a local test file", () => {
  const ci = { CI: "true", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54341", DATABASE_URL: "postgresql://localhost:54342/postgres" };
  expect(resolveTestEnv(ci, undefined)).toEqual(ci);
});
