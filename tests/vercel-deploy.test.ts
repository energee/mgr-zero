// Production builds must migrate the hosted database before compiling the app.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vercel deployment", () => {
  it("pushes migrations before the production build only", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const script = readFileSync("scripts/vercel-build.sh", "utf8");
    expect(config.buildCommand).toBe("bash scripts/vercel-build.sh");
    expect(script).toMatch(/VERCEL_ENV.*production/);
    expect(script.indexOf("supabase db push")).toBeLessThan(script.indexOf("bun run build"));
    expect(script).toContain("POSTGRES_URL_NON_POOLING");
  });

  // Supabase CLI 3 names the target with --remote; --db-url is deprecated and goes in CLI 4.
  // A hosted change is only accepted non-interactively with --yes.
  it("pushes with the CLI 3 target flag and without a prompt", () => {
    const script = readFileSync("scripts/vercel-build.sh", "utf8");
    expect(script).toContain('supabase db push --remote="$POSTGRES_URL_NON_POOLING" --yes');
    expect(script).not.toContain("--db-url");
  });

  // CI starts the test stack with the CLI that setup-cli installs, and the scripts call `bunx supabase`.
  // Two versions once hid a CLI major's type changes: the stack ran on one, the types on the other.
  it("installs in CI the Supabase CLI version the scripts run", () => {
    const wanted = JSON.parse(readFileSync("package.json", "utf8")).devDependencies.supabase.replace(/^\^/, "");
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    const pinned = [...ci.matchAll(/supabase\/setup-cli@[^\n]*\n\s*with: \{ version: ([\d.]+) \}/g)].map(match => match[1]);
    expect(pinned.length).toBeGreaterThan(0);
    expect(new Set(pinned)).toEqual(new Set([wanted]));
  });
});
