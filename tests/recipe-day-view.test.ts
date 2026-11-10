// tests/recipe-day-view.test.ts — the recipe sheet's day at a glance, worked
// out from what the sheet holds: how wide each step of a drawing is
// (spanShares), the brew-day band (brewDayBand), the cellar's temperature
// profile (cellarProfile), what goes in and when (brewDayMoments,
// cellarMoments), the sentences above them (assumptions, brewDayFacts,
// cellarFacts) and a note closed as a sentence (sentence). Pure: no database.
import { describe, expect, it } from "vitest";
import { assumptions, brewDayBand, brewDayFacts, brewDayMoments, cellarFacts, cellarMoments, cellarProfile, sentence, spanShares } from "@/lib/mgr/recipe-day-view";
import type { FermentationStage, MashStep } from "@/lib/mgr/recipe-process-view";
import { ingredientCells, type RecipeIngredientView, type RecipeWaterView } from "@/lib/mgr/recipe-view";

const MASH: MashStep[] = [
  { name: "Mash-in", kind: "infusion", tempF: 104, minutes: 15 },
  { name: "Saccharification", kind: "infusion", tempF: 152, minutes: 60 },
  { name: "Mash-out", kind: "direct heat", tempF: 168, minutes: 10 },
];
const NUMBERS = { boilMin: "60", whirlpoolMin: "20", whirlpoolRest: "10", whirlpoolTemp: "180", knockoutTemp: "65", preBoil: "16.8", efficiency: "72", attenuation: "78" };
/** A line as the page builds it: its cells, and its pack when the test gives one. */
const line = (key: string, stage: RecipeIngredientView["stage"], timing: number | null, perBbl: number, extra: Partial<RecipeIngredientView> = {}): RecipeIngredientView =>
  ({ key, title: key, ...ingredientCells(stage, timing, perBbl, "lb"), ...extra });
const rounded = (xs: number[]) => xs.map((x) => Math.round(x * 10) / 10);

describe("spanShares", () => {
  it("gives each stretch its share of the span by length", () => {
    expect(spanShares([60, 60, 30], 12)).toEqual([40, 40, 20]);
  });
  it("draws no stretch narrower than the floor, and takes the room from the longer ones", () => {
    // 15, 60, 10, 60 and 30 minutes: the two short rests and the whirlpool are held at 15%, the two hours share the rest.
    expect(rounded(spanShares([15, 60, 10, 60, 30], 15))).toEqual([15, 27.5, 15, 27.5, 15]);
    expect(spanShares([15, 60, 10, 60, 30], 15).reduce((sum, share) => sum + share, 0)).toBeCloseTo(100, 10);
  });
  it("shares the span equally when there are too many stretches for the floor", () => {
    expect(rounded(spanShares([1, 50, 1, 1, 1, 1, 1, 1, 1, 1], 15))).toEqual(Array(10).fill(10));
  });
});

describe("brewDayBand", () => {
  const band = brewDayBand(MASH, NUMBERS, [line("extract", "boil", 60, 0.01), line("citra", "boil", 10, 0.4), line("wp", "whirlpool", null, 0.5), line("late", "whirlpool", 5, 0.5), line("dry", "dry_hop", 3 * 1440, 1.2)])!;

  it("draws each mash rest at its temperature with its minutes, then the boil and the whirlpool", () => {
    expect(band.steps.map((s) => [s.temp, s.note])).toEqual([["104 °F", "15 min"], ["152 °F", "60 min"], ["168 °F", "10 min"], [undefined, "60 min"], ["180 °F", "20, rest 10"]]);
    // One line across the page: each step starts where the one before ends.
    expect(band.steps[0].from).toBe(0);
    expect(band.steps.at(-1)!.to).toBeCloseTo(100, 10);
    band.steps.slice(1).forEach((s, i) => expect(s.from).toBeCloseTo(band.steps[i].to, 10));
    // No step is too narrow for its labels on a phone.
    for (const s of band.steps) expect(s.to - s.from).toBeGreaterThanOrEqual(14 - 1e-9);
  });

  it("draws the boil at a fixed height with no temperature, above every rest", () => {
    const [mashIn, sacch, mashOut, boil, whirlpool] = band.steps;
    expect(boil).toMatchObject({ level: 1, temp: undefined });
    expect(mashIn.level).toBeLessThan(sacch.level);
    expect(sacch.level).toBeLessThan(mashOut.level);
    expect(mashOut.level).toBeLessThan(whirlpool.level);
    expect(whirlpool.level).toBeLessThan(1);
    expect(mashIn.level).toBeGreaterThanOrEqual(0);
  });

  it("names the mash, the boil and the whirlpool over their stretches", () => {
    expect(band.zones.map((z) => z.name)).toEqual(["Mash", "Boil", "Whirlpool"]);
    expect(band.zones[0]).toMatchObject({ from: 0, to: band.steps[2].to });
    expect(band.zones[1]).toMatchObject({ from: band.steps[3].from, to: band.steps[3].to });
    expect(band.zones[2].to).toBeCloseTo(100, 10);
  });

  it("marks where each boil and whirlpool addition goes in, and nothing for the cellar", () => {
    const [, , , boil, whirlpool] = band.steps;
    const wide = (s: typeof boil) => s.to - s.from;
    expect(band.marks).toHaveLength(4);
    // A boil addition counts minutes to the end of the boil: 60 is its start, 10 is five sixths along.
    expect(band.marks[0]).toBeCloseTo(boil.from, 10);
    expect(band.marks[1]).toBeCloseTo(boil.from + wide(boil) * 50 / 60, 10);
    // A whirlpool addition with no time goes in as the whirlpool starts; a timed one counts down to its end, before the rest.
    expect(band.marks[2]).toBeCloseTo(whirlpool.from, 10);
    expect(band.marks[3]).toBeCloseTo(whirlpool.from + wide(whirlpool) * 15 / 30, 10);
  });

  it("draws one mark for two additions at the same time, and none for a boil addition with no time", () => {
    const marks = brewDayBand(MASH, NUMBERS, [line("a", "boil", 10, 1), line("b", "boil", 10, 1), line("c", "boil", null, 1)])!.marks;
    expect(marks).toHaveLength(1);
  });

  it("closes with the knock-out temperature and the total time", () => {
    expect(band.ticks).toEqual([{ at: 0, text: "Mash-in" }, { at: 100, text: "Knock out at 65 °F, 2 hours 55 minutes" }]);
    expect(brewDayBand(MASH, { ...NUMBERS, knockoutTemp: "" }, [])!.ticks.at(-1)).toEqual({ at: 100, text: "2 hours 55 minutes" });
  });

  it("says what it shows in a sentence", () => {
    expect(band.summary).toBe("The brew day by temperature: mash rests at 104 °F for 15 minutes, 152 °F for 60 minutes, and 168 °F for 10 minutes, a 60 minute boil, and a 20 minute whirlpool at 180 °F with a 10 minute rest. Knock out at 65 °F. 4 marks show when a boil or whirlpool addition goes in.");
  });

  it("draws what a sparse recipe holds: one rest alone is not totalled again, and no rest at all draws nothing", () => {
    const one = brewDayBand([MASH[1]], {}, [])!;
    expect(one.steps.map((s) => [s.from, s.to, s.temp, s.note])).toEqual([[0, 100, "152 °F", "60 min"]]);
    expect(one.zones.map((z) => z.name)).toEqual(["Mash"]);
    // The step already says 60 min, so the band does not repeat it as a total (#1518).
    expect(one.ticks).toEqual([{ at: 0, text: "Mash-in" }]);
    expect(one.summary).toBe("The brew day by temperature: a mash rest at 152 °F for 60 minutes.");
    expect(brewDayBand([], {}, [])).toBeUndefined();
    // A boil with no mash: the band starts at the boil.
    expect(brewDayBand([], { boilMin: "90" }, [])!.ticks).toEqual([]);
  });

  it("draws a whirlpool with no temperature at the boil's height, unlabelled", () => {
    const steps = brewDayBand(MASH, { boilMin: "60", whirlpoolMin: "20" }, [])!.steps;
    expect(steps.at(-1)).toMatchObject({ level: 1, temp: undefined, note: "20 min" });
    expect(brewDayBand(MASH, { boilMin: "60", whirlpoolRest: "10", whirlpoolTemp: "180" }, [])!.steps.at(-1)!.note).toBe("rest 10 min");
  });

  it("reads a number the draft cannot use as not set", () => {
    expect(brewDayBand(MASH, { boilMin: "1e1", whirlpoolMin: "-5" }, [])!.steps).toHaveLength(3);
  });
});

describe("cellarProfile", () => {
  const stages: FermentationStage[] = [
    { name: "Primary", kind: "primary", tempF: 68, days: 4 },
    { name: "Diacetyl rest", kind: "diacetyl rest", tempF: 72, days: 2 },
    { name: "Cold crash", kind: "cold crash", tempF: 34, days: 2 },
    { name: "Conditioning", kind: "conditioning", tempF: 34, days: 10 },
  ];
  const profile = cellarProfile(stages, [line("citra", "dry_hop", 3 * 1440, 1.2), line("yeast", "fermentation", 0, 0.05)])!;

  it("draws the temperature by day, with stages at one temperature as one step", () => {
    expect(profile.steps.map((s) => s.temp)).toEqual(["68 °F", "72 °F", "34 °F"]);
    expect(profile.steps.map((s) => s.level)).toEqual([34 / 38, 1, 0]);
    expect(profile.steps[0].from).toBe(0);
    expect(profile.steps.at(-1)!.to).toBeCloseTo(100, 10);
    for (const s of profile.steps) expect(s.to - s.from).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(profile.zones).toEqual([]);
  });

  it("names the pitch, each day the temperature changes, and the last day", () => {
    expect(profile.ticks.map((t) => t.text)).toEqual(["Pitch", "Day 4", "6", "Day 18"]);
    expect(profile.ticks.map((t) => t.at)).toEqual([0, profile.steps[0].to, profile.steps[1].to, 100]);
  });

  it("marks each dry hop on its day, and not the pitch", () => {
    const [primary] = profile.steps;
    expect(profile.marks).toHaveLength(1);
    expect(profile.marks[0]).toBeCloseTo(primary.to * 3 / 4, 10);
    // A dry hop after the schedule's last day sits at its end; one with no day has no mark.
    expect(cellarProfile(stages, [line("late", "dry_hop", 30 * 1440, 1), line("some", "dry_hop", null, 1)])!.marks).toEqual([100]);
  });

  it("says what it shows in a sentence", () => {
    expect(profile.summary).toBe("Fermentation temperature by day: 68 °F for 4 days, 72 °F for 2 days, and 34 °F for 12 days, with a dry hop on day 3.");
    expect(cellarProfile(stages, [line("a", "dry_hop", 3 * 1440, 1), line("b", "dry_hop", 7 * 1440, 1)])!.summary).toMatch(/with dry hops on days 3 and 7\.$/);
  });

  it("draws one temperature as a level line, and nothing without a stage", () => {
    const one = cellarProfile([stages[0]], [])!;
    expect(one.steps).toEqual([{ from: 0, to: 100, level: 0.5, temp: "68 °F" }]);
    expect(one.ticks.map((t) => t.text)).toEqual(["Pitch", "Day 4"]);
    expect(one.summary).toBe("Fermentation temperature by day: 68 °F for 4 days.");
    expect(cellarProfile([], [])).toBeUndefined();
  });
});

describe("what goes in on brew day", () => {
  const water: RecipeWaterView = {
    target: "Hazy target", mashPh: "5.35", mashGal: "600", spargeGal: "450",
    additions: [{ name: "Gypsum", qty: 350, unit: "g", stage: "mash" }, { name: "Lactic acid", qty: 60, unit: "mL", stage: "sparge" }, { name: "Yeast nutrient", qty: 20, unit: "g", stage: "kettle" }],
  };
  const pils = line("Pilsner malt", "mash", null, 57.5, { pack: { perBbl: 57.5, factor: 55, unit: "lb", packName: "bag" }, share: 1265 / 1565 });
  const oats = line("Flaked oats", "mash", null, 300 / 22, { pack: { perBbl: 300 / 22, factor: 50, unit: "lb", packName: null }, share: 300 / 1565 });
  const extract = line("Hop extract", "boil", 60, 1 / 22, { pack: { perBbl: 1 / 22, factor: 1, unit: "each", packName: "bottle" } });
  const citra = line("Citra", "boil", 10, 0.4, { pack: { perBbl: 0.4, factor: 44, unit: "lb", packName: "box" } });
  const loose = line("Irish moss", "boil", null, 0.01);
  const whirlpool = line("Mosaic", "whirlpool", null, 0.5, { pack: { perBbl: 0.5, factor: 44, unit: "lb", packName: "box" } });
  const lateWhirlpool = line("Late Citra", "whirlpool", 5, 0.5);
  const dry = line("Dry Citra", "dry_hop", 3 * 1440, 1.2);
  const lines = [pils, oats, citra, extract, loose, lateWhirlpool, whirlpool, dry];
  const moments = brewDayMoments(lines, water, 22);

  it("runs in time order, saying each moment once: water and salts, the grain, the sparge, the kettle, each boil addition by minutes remaining, the whirlpool", () => {
    expect(moments.map((m) => [m.when, m.rows.map((r) => r.title)])).toEqual([
      ["Mash-in", ["Mash water", "Gypsum", "Pilsner malt", "Flaked oats"]],
      ["Sparge", ["Sparge water", "Lactic acid"]],
      ["Kettle", ["Yeast nutrient"]],
      ["Boil, 60 min", ["Hop extract"]],
      ["Boil, 10 min", ["Citra"]],
      ["Boil", ["Irish moss"]],
      ["Whirlpool", ["Mosaic"]],
      ["Whirlpool, 5 min", ["Late Citra"]],
    ]);
  });

  it("reads each amount for the batch: packs where they are whole, the grain with its weight and its share", () => {
    const rows = Object.fromEntries(moments.flatMap((m) => m.rows).map((r) => [r.title, r]));
    expect(rows["Pilsner malt"]).toMatchObject({ amount: "23 bags", weight: "1,265 lb", share: "81%", line: pils });
    expect(rows["Flaked oats"]).toMatchObject({ amount: "6 × 50 lb", weight: "300 lb", share: "19%" });
    expect(rows["Hop extract"]).toMatchObject({ amount: "1 bottle", weight: undefined, share: undefined });
    // Not whole packs: the amount in its unit, which is already its weight.
    expect(rows["Citra"].amount).toBe("8.8 lb");
    expect(rows["Citra"].weight).toBeUndefined();
    expect(rows["Mash water"]).toEqual({ key: "water-mash", title: "Mash water", amount: "600 gal" });
    expect(rows["Gypsum"]).toEqual({ key: "water-0", title: "Gypsum", amount: "350 g" });
    // A line whose material the page cannot see has no pack: it keeps its amount per bbl.
    expect(rows["Irish moss"].amount).toBe("0.01 lb / bbl");
  });

  it("reads a grain that is not whole bags by its weight alone", () => {
    const [row] = brewDayMoments([{ ...pils, pack: { ...pils.pack!, perBbl: 44 } }], undefined, 22)[0].rows;
    expect(row).toMatchObject({ amount: "968 lb", share: "81%" });
    expect(row.weight).toBeUndefined();
    // Thousands are grouped, and the stored four decimals are kept.
    expect(brewDayMoments([{ ...pils, pack: { ...pils.pack!, perBbl: 57.6 } }, { ...citra, pack: { ...citra.pack!, perBbl: 0.011477 } }], undefined, 22).flatMap((m) => m.rows).map((r) => r.amount)).toEqual(["1,267.2 lb", "0.2525 lb"]);
  });

  it("reads each amount per barrel without a batch size, as before", () => {
    const rows = brewDayMoments(lines, water, 0).flatMap((m) => m.rows);
    const malt = rows.find((r) => r.title === "Pilsner malt")!;
    expect(malt).toMatchObject({ amount: "57.5 lb / bbl", share: "81%" });
    expect(malt.weight).toBeUndefined();
    expect(rows.find((r) => r.title === "Citra")!.amount).toBe("0.4 lb / bbl");
    // The recipe's water is not per barrel.
    expect(rows.find((r) => r.title === "Mash water")!.amount).toBe("600 gal");
  });

  it("lists only what the recipe holds: no water, no hops", () => {
    expect(brewDayMoments([pils], undefined, 22).map((m) => m.when)).toEqual(["Mash-in"]);
    expect(brewDayMoments([dry], undefined, 22)).toEqual([]);
    expect(brewDayMoments([], { additions: [] }, 22)).toEqual([]);
  });

  it("puts the cellar's lines in the cellar: the pitch, the dry hops by day, then packaging and other additions", () => {
    const yeast = line("London Tropics", "fermentation", 0, 1 / 22, { pack: { perBbl: 1 / 22, factor: 1, unit: "each", packName: "pitch" } });
    const nutrient = line("Nutrient", "fermentation", null, 0.01);
    const day7 = line("Mosaic", "dry_hop", 7 * 1440, 1);
    const undated = line("Nelson", "dry_hop", null, 1);
    const fining = line("Biofine", "packaging", null, 0.09);
    const other = line("Oak", "other", null, 0.1);
    expect(cellarMoments([other, fining, undated, day7, dry, nutrient, yeast, pils], 22).map((m) => [m.when, m.rows.map((r) => r.title)])).toEqual([
      ["Pitch", ["Nutrient", "London Tropics"]],
      ["Day 3", ["Dry Citra"]],
      ["Day 7", ["Mosaic"]],
      ["Dry hop", ["Nelson"]],
      ["Packaging", ["Biofine"]],
      ["Other", ["Oak"]],
    ]);
    expect(cellarMoments([yeast], 22)[0].rows[0].amount).toBe("1 pitch");
    expect(cellarMoments([pils], 22)).toEqual([]);
  });
});

describe("the sentences above the lists", () => {
  it("states the two assumptions, and says so when one is not set", () => {
    expect(assumptions({ efficiency: "72", attenuation: "78" })).toEqual(["72% efficiency", "78% attenuation"]);
    expect(assumptions({ efficiency: " ", attenuation: "78" })).toEqual(["no efficiency", "78% attenuation"]);
    expect(assumptions({})).toEqual(["no efficiency", "no attenuation"]);
  });

  it("gives the brew day's facts in one line, each number opening the sheet that holds it", () => {
    const water = { target: "Hazy target", mashPh: "5.35", additions: [] };
    expect(brewDayFacts(water, NUMBERS)).toEqual([
      { text: "Hazy target", opens: "water" }, ", mash pH 5.35. Boil from ", { text: "16.8 bbl", opens: "numbers" },
      ". Whirlpool at ", { text: "180 °F", opens: "numbers" }, ", knock out at ", { text: "65 °F", opens: "numbers" }, ".",
    ]);
    const text = (facts: ReturnType<typeof brewDayFacts>) => facts.map((f) => (typeof f === "string" ? f : f.text)).join("");
    expect(text(brewDayFacts({ mashPh: "5.3" }, { knockoutTemp: "66" }))).toBe("Mash pH 5.3. Knock out at 66 °F.");
    expect(text(brewDayFacts({ target: "Burton" }, { whirlpoolTemp: "180" }))).toBe("Burton. Whirlpool at 180 °F.");
    expect(text(brewDayFacts(undefined, { preBoil: "16.8" }))).toBe("Boil from 16.8 bbl.");
    expect(brewDayFacts(undefined, {})).toEqual([]);
  });

  it("gives the cellar's length from pitch to package", () => {
    expect(cellarFacts([{ name: "Primary", kind: "primary", tempF: 68, days: 4 }, { name: "Crash", kind: "cold crash", tempF: 34, days: 14 }])).toBe("18 days from pitch to package.");
    expect(cellarFacts([{ name: "Primary", kind: "primary", tempF: 68, days: 1 }])).toBe("1 day from pitch to package.");
    expect(cellarFacts([])).toBe("");
  });

  it("closes a note as a sentence", () => {
    expect(sentence("House IPA")).toBe("House IPA.");
    expect(sentence("Keep it soft and juicy.")).toBe("Keep it soft and juicy.");
    expect(sentence("Why not?")).toBe("Why not?");
  });
});
