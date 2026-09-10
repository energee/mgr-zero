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
});
