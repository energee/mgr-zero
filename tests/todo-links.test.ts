// tests/todo-links.test.ts — every backtick file path in TODO.md must exist,
// so a renamed plan or spec breaks here instead of rotting in the roadmap.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

describe("TODO.md", () => {
  it("links only files that exist", () => {
    const paths = [...readFileSync(join(ROOT, "TODO.md"), "utf8").matchAll(/`([^`\s]+\.(?:md|ts|tsx))`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(5);
    expect(paths.filter((p) => !existsSync(join(ROOT, p)))).toEqual([]);
  });
});
