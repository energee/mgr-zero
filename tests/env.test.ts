// tests/env.test.ts — validates the explicit public/server environment boundary.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readPublicEnv } from "@/lib/env/public";
import { readServerEnv } from "@/lib/env/server-parser";

const validPublic = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54341",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-key",
};

const validServer = {
  ...validPublic,
  SUPABASE_SECRET_KEY: "service-role-key",
  COMMAND_RATE_LIMIT_HMAC_SECRET: "a-command-rate-limit-secret-that-is-long-enough",
};

describe("environment validation", () => {
  it("fails fast when a required public value is missing or malformed", () => {
    expect(() => readPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL"
    );
    expect(() => readPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: validPublic.NEXT_PUBLIC_SUPABASE_URL })).toThrow(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  });

  it("fails fast when server-only configuration is missing, invalid, or too short", () => {
    expect(() => readServerEnv(validPublic)).toThrow("SUPABASE_SECRET_KEY");
    expect(() =>
      readServerEnv({ ...validServer, VERCEL_ENV: "staging" })
    ).toThrow("VERCEL_ENV");
    expect(() =>
      readServerEnv({ ...validServer, COMMAND_RATE_LIMIT_HMAC_SECRET: "a".repeat(31) })
    ).toThrow("COMMAND_RATE_LIMIT_HMAC_SECRET");
    expect(readServerEnv({ ...validServer, COMMAND_RATE_LIMIT_HMAC_SECRET: "a".repeat(32) })).toMatchObject({
      commandRateLimitHmacSecret: "a".repeat(32),
    });
  });

  it("uses direct static public environment references for browser inlining", () => {
    const publicEnv = readFileSync(resolve(__dirname, "..", "lib", "env", "public.ts"), "utf8");

    expect(publicEnv).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(publicEnv).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(publicEnv).not.toMatch(/process\.env\[/);
    expect(publicEnv).not.toContain("const env = process.env");
  });

  it("keeps server secrets outside the browser client module graph", () => {
    const publicEnv = readFileSync(resolve(__dirname, "..", "lib", "env", "public.ts"), "utf8");
    const serverEnv = readFileSync(resolve(__dirname, "..", "lib", "env", "server.ts"), "utf8");
    const serverOnlyDeclaration = readFileSync(
      resolve(__dirname, "..", "lib", "env", "server-only.d.ts"),
      "utf8"
    );
    const seed = readFileSync(resolve(__dirname, "..", "scripts", "seed-dev.ts"), "utf8");
    const browserClient = readFileSync(resolve(__dirname, "..", "lib", "supabase", "client.ts"), "utf8");

    expect(publicEnv).not.toContain("SUPABASE_SECRET_KEY");
    expect(publicEnv).not.toContain("COMMAND_RATE_LIMIT_HMAC_SECRET");
    expect(browserClient).not.toContain("@/lib/env/server");
    expect(browserClient).not.toContain("SUPABASE_SECRET_KEY");
    expect(serverEnv).toContain('import "server-only"');
    expect(serverOnlyDeclaration).toContain('declare module "server-only"');
    expect(seed).not.toContain('from "@/lib/env/server";');
  });
});
