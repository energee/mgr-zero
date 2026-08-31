// tests/write-atomicity.test.ts — enforces .agents/ARCHITECTURE.md iron rule 5: a
// command block with two or more supabase-js write calls must go through one
// plpgsql function (`.rpc(`) or carry an `// atomic-exempt:` comment.
// Source-level check; blocks are split on defineCommand/defineQuery, and code
// before the first block (shared helpers) counts as its own block.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..", "lib", "commands");
const WRITE = /\.(insert|upsert|update|delete)\(/g;

describe("write atomicity (iron rule 5)", () => {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "registry.ts")) {
    it(file, () => {
      const src = readFileSync(join(dir, file), "utf8");
      const blocks = src.split(/(?=^define(?:Command|Query)\(\{)/m);
      const offenders = blocks
        .filter((b) => (b.match(WRITE) ?? []).length >= 2 && !b.includes(".rpc(") && !b.includes("atomic-exempt:"))
        .map((b) => b.slice(0, 80).replace(/\s+/g, " "));
      expect(offenders, "multi-write block without rpc or atomic-exempt").toEqual([]);
    });
  }
});
