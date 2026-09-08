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
