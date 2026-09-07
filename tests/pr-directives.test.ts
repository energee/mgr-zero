// tests/pr-directives.test.ts — lib/pr-directives.ts, the pure half of the CLI.
import { describe, expect, it } from "vitest";
import { check, moveDone, openItems, parseTodoTargets } from "@/lib/pr-directives";

const TODO = `# TODO

## Phase 1
- [ ] Program 5 — production merged
- [ ] Program 6 — purchasing merged
- [x] not open
`;

const PROGRESS = `# PROGRESS

## Done
- 2026-09-07 — Programs 0–4b (#185)
`;

describe("parseTodoTargets", () => {
  it("reads TODO: lines anywhere in the body", () => {
    expect(parseTodoTargets("Progress note.\nTODO: Program 6 \nDOCS: none\n")).toEqual(["Program 6"]);
    expect(parseTodoTargets("no markers")).toEqual([]);
  });
});

describe("openItems", () => {
  it("lists unchecked items only", () => {
    expect(openItems(TODO)).toEqual(["Program 5 — production merged", "Program 6 — purchasing merged"]);
  });
});

describe("check", () => {
  it("passes a unique, case-insensitive match", () => expect(check(TODO, "TODO: program 6\nDOCS: none")).toEqual([]));
  it("fails zero and ambiguous matches", () => {
    expect(check(TODO, "TODO: Program 9")).toHaveLength(1);
    expect(check(TODO, "TODO: merged")).toHaveLength(1);
  });
});

describe("moveDone", () => {
  it("removes the item from TODO and logs it at the top of PROGRESS Done", () => {
    const out = moveDone(TODO, PROGRESS, "Program 6", "2026-09-08", 200);
    expect(openItems(out.todo)).toEqual(["Program 5 — production merged"]);
    expect(out.progress).toBe(`# PROGRESS

## Done
- 2026-09-08 — Program 6 — purchasing merged (#200)
- 2026-09-07 — Programs 0–4b (#185)
`);
  });
  it("throws when the target is gone (already moved)", () => {
    expect(() => moveDone(TODO, PROGRESS, "Program 9", "2026-09-08", 1)).toThrow(/matches 0/);
  });
});
