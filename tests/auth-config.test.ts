import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("allows password recovery callbacks on both local browser origins", () => {
  for (const file of ["supabase/config.toml", "tests/supabase/supabase/config.toml"]) {
    const config = readFileSync(file, "utf8");
    for (const host of ["localhost", "127.0.0.1"]) for (const port of [3000, 3002]) {
      expect(config).toContain(`"http://${host}:${port}/auth/confirm**"`);
    }
  }
});

it("keeps local Auth invitation-only: no self-serve signup (#467)", () => {
  for (const file of ["supabase/config.toml", "tests/supabase/supabase/config.toml"]) {
    const config = readFileSync(file, "utf8");
    expect(config).not.toMatch(/^enable_signup = true$/m);
    expect(config.match(/^enable_signup = false$/gm)?.length).toBeGreaterThanOrEqual(2);
  }
});
