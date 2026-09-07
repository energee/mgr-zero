// tests/pr-directives.test.ts — the pure half of scripts/pr-directives.ts.
import { describe, expect, it } from "vitest";
import { check, moveDone, openItems, parseDirectives } from "../scripts/pr-directives";

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

describe("parseDirectives", () => {
  it("reads TODO: and DOCS: lines anywhere in the body", () => {
    expect(parseDirectives("Progress note.\nTODO: Program 6\n\nDOCS: none \n")).toEqual({ todo: ["Program 6"], docs: "none" });
    expect(parseDirectives("no markers")).toEqual({ todo: [], docs: null });
  });
});

describe("openItems", () => {
  it("lists unchecked items only", () => {
    expect(openItems(TODO)).toEqual(["Program 5 — production merged", "Program 6 — purchasing merged"]);
  });
});

describe("check", () => {
  it("passes a unique match and DOCS: none", () => expect(check(TODO, "TODO: program 6\nDOCS: none")).toEqual([]));
  it("fails zero and ambiguous matches and unknown DOCS values", () => {
    expect(check(TODO, "TODO: Program 9")).toHaveLength(1);
    expect(check(TODO, "TODO: merged")).toHaveLength(1);
    expect(check(TODO, "DOCS: staff-guide")).toHaveLength(1);
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
