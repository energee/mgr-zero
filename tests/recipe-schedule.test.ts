// tests/recipe-schedule.test.ts — the only logic in the recipe builder. A
// schedule's footer states its total, and the mash footer names the rest the
// prediction reads, because Recipe no longer carries a Mash temp scalar.
import { describe, expect, it } from "vitest";
import { saccharificationRest, totalDuration, type Step } from "../lib/mgr/recipe-schedule";

const mash: Step[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, duration: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, duration: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, duration: 10 },
];

describe("totalDuration", () => {
  it("sums a schedule and answers zero for an empty one", () => {
    expect(totalDuration(mash)).toBe(85);
    expect(totalDuration([])).toBe(0);
  });
});

describe("saccharificationRest", () => {
  it("picks the longest step in the conversion range", () => {
    expect(saccharificationRest(mash)?.name).toBe("Saccharification");
  });

  it("prefers duration over order when two steps are both in range", () => {
    const stepped: Step[] = [
      { name: "Beta", kind: "infusion", tempF: 145, duration: 20 },
      { name: "Alpha", kind: "infusion", tempF: 158, duration: 40 },
    ];
    expect(saccharificationRest(stepped)?.name).toBe("Alpha");
  });

  it("answers null when nothing rests in range", () => {
    expect(saccharificationRest([])).toBeNull();
    expect(saccharificationRest([{ name: "Mash-out", kind: "direct heat", tempF: 168, duration: 10 }]))
      .toBeNull();
  });
});
