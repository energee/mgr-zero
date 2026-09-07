// tests/todo-links.test.ts — every backtick file path in TODO.md must exist,
// so a renamed plan or spec breaks here instead of rotting in the roadmap.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const PLANS = join(ROOT, ".agents/superpowers/plans");

describe("TODO.md", () => {
  it("links only files that exist", () => {
    const todo = readFileSync(join(ROOT, "TODO.md"), "utf8");
    const paths = [...todo.matchAll(/`([^`\s]+\.(?:md|ts|tsx))`/g)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(5);
    // Bare `backend-program-N-*.md` names live in the plans directory; the
    // rest are repo-relative.
    const missing = paths.filter((p) => !existsSync(join(p.includes("/") ? ROOT : PLANS, p)) && !existsSync(join(PLANS, `2026-09-07-${p}`)));
    expect(missing).toEqual([]);
  });
});
