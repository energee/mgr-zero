// lib/mgr/recipe-day-view.ts — the recipe sheet as "the day at a glance",
// worked out from what the sheet already holds; nothing here is stored.
// Two drawings share one shape (StepLineModel, drawn by
// components/mgr/views/step-line.tsx): the brew-day band, one temperature line
// from mash-in to knock-out with a mark where each boil and whirlpool addition
// goes in (brewDayBand), and the cellar's temperature by day with a mark for
// each dry hop (cellarProfile). A drawing's x values are percents of its span,
// and a short step is never drawn too narrow for its labels (spanShares).
// Under them, everything that goes in, in time order, with each moment said
// once: brew day (brewDayMoments) and the cellar (cellarMoments). Each row
// reads its amount for the batch, or per bbl while the recipe has no batch
// size. Also the sentences above the lists: the two assumptions under the
// figures (assumptions), the brew day's facts (brewDayFacts) and the cellar's
// length (cellarFacts).
import { formatDuration, MINUTES_PER_DAY } from "@/lib/time-window";
import { sentenceCase } from "./labels";
import { batchQty } from "./pack-qty";
import { plural } from "./plural";
import { isNumber } from "./quantity-input";
import { scheduleDays, type FermentationStage, type MashStep } from "./recipe-process-view";
import { batchTotalText, wholePercent, type RecipeIngredientView, type RecipeNumberKey, type RecipeWaterView } from "./recipe-view";
import { andList } from "./submit-reason";

/** A temperature line in steps, as StepLine draws it. Every x (`from`, `to`, `at`, a mark) is a percent of the line's
 *  span. `level` is a step's height, from 0 (the lowest) to 1 (the highest). */
export type StepLineModel = {
  /** What the drawing shows, in a sentence: its accessible name. */
  summary: string;
  /** `temp` is written over the step ("152 °F") and `note` under it ("60 min"). */
  steps: { from: number; to: number; level: number; temp?: string; note?: string }[];
  /** Named stretches of the span, shaded behind the line: Mash, Boil, Whirlpool. */
  zones: { name: string; from: number; to: number }[];
  /** Where an addition goes in, on the baseline. */
  marks: number[];
  /** What the baseline says under itself: its ends, and any day between. */
  ticks: { at: number; text: string }[];
};

/** Each stretch's share of the span as a percent, by its length. No stretch is drawn narrower than `floor` percent, so
 *  its labels fit on a phone; the longer ones give up the room. With too many stretches for that, all share equally. */
export function spanShares(lengths: readonly number[], floor: number): number[] {
  const least = Math.min(floor, 100 / lengths.length);
  const held = new Set<number>();
  for (;;) {
    const free = 100 - least * held.size;
    const total = lengths.reduce((sum, length, i) => (held.has(i) ? sum : sum + length), 0);
    const shares = lengths.map((length, i) => (held.has(i) ? least : free * length / total));
    const short = shares.findIndex((share, i) => !held.has(i) && share < least);
    if (short < 0) return shares;
    held.add(short);
  }
}

/** Steps laid end to end across the span: each one's `from` and `to`, by its length (spanShares). */
function layOut<T extends { length: number }>(steps: readonly T[], floor: number): (T & { from: number; to: number })[] {
  let at = 0;
  return spanShares(steps.map((s) => s.length), floor).map((share, i) => {
    const from = at;
    // The last step ends on the edge exactly, whatever the shares' rounding adds up to.
    at = i === steps.length - 1 ? 100 : at + share;
    return { ...steps[i], from, to: at };
  });
}

/** A point part of the way along a laid-out step. */
const along = (step: { from: number; to: number }, fraction: number) => step.from + (step.to - step.from) * Math.min(1, Math.max(0, fraction));
/** Marks left to right, one for additions that go in together. */
const distinct = (marks: number[]) => [...new Set(marks)].sort((a, b) => a - b);
/** A typed process number the drawing can use: plain notation, above zero. Anything else reads as not set. */
const positive = (text: string | undefined) => (text !== undefined && isNumber(text) && Number(text) > 0 ? Number(text) : undefined);
const degrees = (tempF: number | string) => `${tempF} °F`;

/** The narrowest a band step is drawn, in percent: room for "104 °F" over it at phone width. */
const BAND_FLOOR = 14;
/** The lowest temperature the band's scale starts from, unless a rest is cooler. The boil sits at 212 on that scale. */
const BAND_LOW_F = 95, BAND_HIGH_F = 212;

/** The brew day's times and temperatures as the band reads them off the sheet: the rests that last, and each process
 *  number the sheet holds. A number the draft cannot use reads as not set. */
type BrewDay = { rests: MashStep[]; boilMin?: number; whirlpoolMin: number; restMin: number; whirlpoolTemp?: number; knockout?: number };
const brewDay = (mash: readonly MashStep[], numbers: Partial<Record<RecipeNumberKey, string>>): BrewDay => ({
  rests: mash.filter((step) => step.minutes > 0),
  boilMin: positive(numbers.boilMin), whirlpoolMin: positive(numbers.whirlpoolMin) ?? 0, restMin: positive(numbers.whirlpoolRest) ?? 0,
  whirlpoolTemp: positive(numbers.whirlpoolTemp), knockout: positive(numbers.knockoutTemp),
});

/** The band in a sentence, for a screen reader: each rest, the boil, the whirlpool and its rest, then the knock-out and what the marks are. */
function bandSummary({ rests, boilMin, whirlpoolMin, restMin, whirlpoolTemp, knockout }: BrewDay, marks: number): string {
  const held = rests.map((step) => `${degrees(step.tempF)} for ${plural(step.minutes, "minute")}`);
  const at = whirlpoolTemp ? ` at ${degrees(whirlpoolTemp)}` : "";
  const said = [
    held.length > 1 ? `mash rests at ${andList(held)}` : held.length ? `a mash rest at ${held[0]}` : "",
    boilMin ? `a ${boilMin} minute boil` : "",
    whirlpoolMin ? `a ${whirlpoolMin} minute whirlpool${at}${restMin ? ` with a ${restMin} minute rest` : ""}` : restMin ? `a ${restMin} minute whirlpool rest${at}` : "",
  ].filter(Boolean);
  return [
    `The brew day by temperature: ${andList(said)}.`,
    knockout ? `Knock out at ${degrees(knockout)}.` : "",
    marks ? `${plural(marks, "mark")} ${marks === 1 ? "shows" : "show"} when a boil or whirlpool addition goes in.` : "",
  ].filter(Boolean).join(" ");
}

/** The brew day as one temperature line, mash-in to knock-out: each mash rest at its temperature with its minutes,
 *  then the boil and the whirlpool with its rest, when the recipe holds them. The boil draws at a fixed height with no
 *  temperature, because the boiling point depends on altitude; a whirlpool with no temperature draws level with it.
 *  A mark shows where each boil and whirlpool addition goes in. A boil addition's minutes count down to the end of the
 *  boil, and a whirlpool addition's to the end of the whirlpool, before its rest. A whirlpool addition with no time
 *  goes in as the whirlpool starts; a boil addition with no time has no known place, so it has no mark.
 *  Undefined when the recipe holds none of the three. */
export function brewDayBand(mash: readonly MashStep[], numbers: Partial<Record<RecipeNumberKey, string>>, lines: readonly Pick<RecipeIngredientView, "stage" | "timingMinutes">[]): StepLineModel | undefined {
  const day = brewDay(mash, numbers);
  const { rests, boilMin, whirlpoolMin, restMin, whirlpoolTemp, knockout } = day;
  const low = Math.min(BAND_LOW_F, ...rests.map((step) => step.tempF));
  const level = (tempF: number | undefined) => (tempF === undefined ? 1 : Math.min(1, Math.max(0, (tempF - low) / (BAND_HIGH_F - low))));
  const whirlpoolNote = whirlpoolMin && restMin ? `${whirlpoolMin}, rest ${restMin}` : whirlpoolMin ? `${whirlpoolMin} min` : `rest ${restMin} min`;
  const steps = layOut([
    ...rests.map((step) => ({ zone: "Mash", length: step.minutes, level: level(step.tempF), temp: degrees(step.tempF), note: `${step.minutes} min` })),
    ...(boilMin ? [{ zone: "Boil", length: boilMin, level: 1, temp: undefined, note: `${boilMin} min` }] : []),
    ...(whirlpoolMin + restMin ? [{ zone: "Whirlpool", length: whirlpoolMin + restMin, level: level(whirlpoolTemp), temp: whirlpoolTemp ? degrees(whirlpoolTemp) : undefined, note: whirlpoolNote }] : []),
  ], BAND_FLOOR);
  if (steps.length === 0) return undefined;
  const zones = ["Mash", "Boil", "Whirlpool"].flatMap((name) => {
    const inZone = steps.filter((step) => step.zone === name);
    return inZone.length ? [{ name, from: inZone[0].from, to: inZone[inZone.length - 1].to }] : [];
  });
  const boil = steps.find((step) => step.zone === "Boil"), whirlpool = steps.find((step) => step.zone === "Whirlpool");
  const marks = distinct(lines.flatMap((line) => {
    if (line.stage === "boil" && boil && line.timingMinutes !== null) return [along(boil, 1 - line.timingMinutes / boil.length)];
    if (line.stage === "whirlpool" && whirlpool) return [line.timingMinutes === null ? whirlpool.from : along(whirlpool, (whirlpoolMin - line.timingMinutes) / whirlpool.length)];
    return [];
  }));
  // One step already says its minutes, so it is not totalled again (#1518).
  const total = steps.length > 1 ? formatDuration(steps.reduce((sum, step) => sum + step.length, 0)) : "";
  const end = [knockout ? `Knock out at ${degrees(knockout)}` : "", total].filter(Boolean).join(", ");
  return {
    summary: bandSummary(day, marks.length),
    // A temperature is written where it changes.
    steps: steps.map(({ from, to, level, temp, note }, i) => ({ from, to, level, temp: temp && temp !== steps[i - 1]?.temp ? temp : undefined, note })),
    zones, marks,
    ticks: [...(rests.length ? [{ at: 0, text: "Mash-in" }] : []), ...(end ? [{ at: 100, text: end }] : [])],
  };
}

/** The narrowest a cellar step is drawn, in percent: room for its day under the baseline at phone width. */
const CELLAR_FLOOR = 15;
/** A line's day in the cellar, from the start of fermentation, or null when it has none. */
const cellarDay = (line: Pick<RecipeIngredientView, "timingMinutes">) => (line.timingMinutes === null ? null : line.timingMinutes / MINUTES_PER_DAY);

/** The cellar's temperature by day: one step per run of stages at one temperature, named by its temperature, with the
 *  pitch, each day the temperature changes and the last day under the baseline, and a mark on each dry hop's day. A
 *  dry hop after the schedule's last day sits at its end. Undefined without a stage. */
export function cellarProfile(stages: readonly FermentationStage[], lines: readonly Pick<RecipeIngredientView, "stage" | "timingMinutes">[]): StepLineModel | undefined {
  const runs: { tempF: number; length: number; start: number }[] = [];
  for (const stage of stages.filter((s) => s.days > 0)) {
    const last = runs[runs.length - 1];
    if (last?.tempF === stage.tempF) last.length += stage.days;
    else runs.push({ tempF: stage.tempF, length: stage.days, start: last ? last.start + last.length : 0 });
  }
  if (runs.length === 0) return undefined;
  const temps = runs.map((run) => run.tempF), low = Math.min(...temps), high = Math.max(...temps);
  const steps = layOut(runs, CELLAR_FLOOR);
  const hopDays = distinct(lines.flatMap((line) => (line.stage === "dry_hop" ? cellarDay(line) ?? [] : [])));
  const at = (day: number) => {
    const step = steps.find((s) => day < s.start + s.length);
    return step ? along(step, (day - step.start) / step.length) : 100;
  };
  const held = runs.map((run) => `${degrees(run.tempF)} for ${plural(run.length, "day")}`);
  return {
    summary: `Fermentation temperature by day: ${andList(held)}${hopDays.length ? `, with ${hopDays.length === 1 ? "a dry hop on day" : "dry hops on days"} ${andList(hopDays.map(String))}` : ""}.`,
    steps: steps.map(({ from, to, tempF }) => ({ from, to, level: high === low ? 0.5 : (tempF - low) / (high - low), temp: degrees(tempF) })),
    zones: [],
    marks: distinct(hopDays.map(at)),
    ticks: [
      { at: 0, text: "Pitch" },
      // "Day" is said once between the ends, and only where it clears "Pitch" on a phone.
      ...steps.slice(0, -1).map((step, i) => ({ at: step.to, text: i === 0 && step.to >= 20 ? `Day ${step.start + step.length}` : String(step.start + step.length) })),
      { at: 100, text: `Day ${scheduleDays(stages)}` },
    ],
  };
}

/** One thing that goes in. `amount` is for the batch once the recipe has a batch size ("23 bags"), else per bbl
 *  ("57.5 lb / bbl"); the recipe's water is its own amount ("600 gal"). A grain line also reads its `share` of the
 *  grain bill, and its batch `weight` when its amount reads in packs. `line` is the ingredient line the row reads;
 *  a row without one is the recipe's water. */
export type GoesInRow = { key: string; title: string; amount: string; weight?: string; share?: string; line?: RecipeIngredientView };
/** The rows that go in at one moment ("Mash-in", "Boil, 10 min", "Day 3"). */
export type GoesInMoment = { when: string; rows: GoesInRow[] };

function lineRow(line: RecipeIngredientView, bbl: number): GoesInRow {
  const share = line.share === undefined ? undefined : wholePercent(line.share);
  if (!(bbl > 0) || !line.pack) return { key: line.key, title: line.title, amount: `${line.amount} / bbl`, share, line };
  const qty = batchQty(line.pack.perBbl, bbl), amount = batchTotalText(line.pack, bbl);
  // The amount in its unit, with its thousands grouped: "1,265 lb".
  const inUnit = `${qty.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${line.pack.unit}`;
  // An amount that is not a count of packs is that reading. A grain that reads in bags also reads its weight.
  if (amount === `${qty} ${line.pack.unit}`) return { key: line.key, title: line.title, amount: inUnit, share, line };
  return { key: line.key, title: line.title, amount, weight: share === undefined ? undefined : inUnit, share, line };
}

/** The moments that are worth saying: those with a row. */
const withRows = (moments: GoesInMoment[]) => moments.filter((moment) => moment.rows.length > 0);

/** What goes in on brew day, in time order: the mash water, its salts and the grain at mash-in, the sparge water and
 *  its salts, the kettle salts, each boil addition from the most minutes remaining to the fewest, then the whirlpool.
 *  A boil addition with no time comes last in the boil; a whirlpool addition with no time goes in as it starts. */
export function brewDayMoments(lines: readonly RecipeIngredientView[], water: RecipeWaterView | undefined, bbl: number): GoesInMoment[] {
  const row = (line: RecipeIngredientView) => lineRow(line, bbl);
  const at = (stage: string, timed: boolean) => lines.filter((line) => line.stage === stage && (line.timingMinutes !== null) === timed);
  /** A stage's timed lines, one moment per time, from the most minutes to the fewest. */
  const countdown = (stage: string, title: string) =>
    [...new Set(at(stage, true).map((line) => line.timingMinutes!))].sort((a, b) => b - a)
      .map((minutes) => at(stage, true).filter((line) => line.timingMinutes === minutes))
      .map((together) => ({ when: `${title}, ${together[0].timing}`, rows: together.map(row) }));
  const salts = (stage: string) => (water?.additions ?? []).flatMap((a, i) => (a.stage === stage ? [{ key: `water-${i}`, title: a.name, amount: `${a.qty} ${a.unit}` }] : []));
  const poured = (key: string, title: string, gal: string | undefined) => (gal ? [{ key, title, amount: `${gal} gal` }] : []);
  return withRows([
    { when: "Mash-in", rows: [...poured("water-mash", "Mash water", water?.mashGal), ...salts("mash"), ...at("mash", false).map(row)] },
    ...countdown("mash", "Mash"),
    { when: "Sparge", rows: [...poured("water-sparge", "Sparge water", water?.spargeGal), ...salts("sparge")] },
    { when: "Kettle", rows: salts("kettle") },
    ...countdown("boil", "Boil"),
    { when: "Boil", rows: at("boil", false).map(row) },
    { when: "Whirlpool", rows: at("whirlpool", false).map(row) },
    ...countdown("whirlpool", "Whirlpool"),
  ]);
}

/** What goes in after knock-out: the pitch (a fermentation line on day 0 or with no day, and a dry hop on day 0), then
 *  each later day's additions by day, dry hops with no day, and any packaging and other additions. */
export function cellarMoments(lines: readonly RecipeIngredientView[], bbl: number): GoesInMoment[] {
  const row = (line: RecipeIngredientView) => lineRow(line, bbl);
  const dated = lines.filter((line) => line.stage === "fermentation" || line.stage === "dry_hop");
  const atPitch = (line: RecipeIngredientView) => cellarDay(line) === 0 || (line.stage === "fermentation" && line.timingMinutes === null);
  const days = [...new Set(dated.flatMap((line) => cellarDay(line) || []))].sort((a, b) => a - b);
  const staged = (stage: string) => lines.filter((line) => line.stage === stage).map(row);
  return withRows([
    { when: "Pitch", rows: dated.filter(atPitch).map(row) },
    ...days.map((day) => dated.filter((line) => cellarDay(line) === day)).map((together) => ({ when: sentenceCase(together[0].timing), rows: together.map(row) })),
    { when: "Dry hop", rows: dated.filter((line) => line.stage === "dry_hop" && line.timingMinutes === null).map(row) },
    { when: "Packaging", rows: staged("packaging") },
    { when: "Other", rows: staged("other") },
  ]);
}

/** The two assumptions under the figures, each as the words that open the sheet holding it: "72% efficiency" and
 *  "78% attenuation", or "no efficiency" while one is blank. */
export function assumptions(numbers: Partial<Record<"efficiency" | "attenuation", string>>): [string, string] {
  const said = (value: string | undefined, name: string) => (value?.trim() ? `${value}% ${name}` : `no ${name}`);
  return [said(numbers.efficiency, "efficiency"), said(numbers.attenuation, "attenuation")];
}

/** A piece of a sentence: plain words, or a fact that opens the sheet holding it (the recipe's numbers, or its water). */
export type Fact = string | { text: string; opens: "numbers" | "water" };

/** The line over the brew-day list: the target water profile and mash pH, the pre-boil volume, and the whirlpool and
 *  knock-out temperatures, each only when the recipe holds it. Empty when it holds none. */
export function brewDayFacts(water: Pick<RecipeWaterView, "target" | "mashPh"> | undefined, numbers: Partial<Record<RecipeNumberKey, string>>): Fact[] {
  const number = (text: string): Fact => ({ text, opens: "numbers" });
  const sentences: Fact[][] = [];
  if (water?.target) sentences.push([{ text: water.target, opens: "water" }, water.mashPh ? `, mash pH ${water.mashPh}` : ""]);
  else if (water?.mashPh) sentences.push([`Mash pH ${water.mashPh}`]);
  if (numbers.preBoil) sentences.push(["Boil from ", number(`${numbers.preBoil} bbl`)]);
  if (numbers.whirlpoolTemp) sentences.push(["Whirlpool at ", number(degrees(numbers.whirlpoolTemp)), ...(numbers.knockoutTemp ? [", knock out at ", number(degrees(numbers.knockoutTemp))] : [])]);
  else if (numbers.knockoutTemp) sentences.push(["Knock out at ", number(degrees(numbers.knockoutTemp))]);
  const facts: Fact[] = [];
  // Each sentence ends with a full stop and a space before the next; words that meet are one piece.
  for (const piece of sentences.flatMap((sentence, i) => [...sentence, i < sentences.length - 1 ? ". " : "."])) {
    const last = facts[facts.length - 1];
    if (typeof piece === "string" && typeof last === "string") facts[facts.length - 1] = last + piece;
    else if (piece !== "") facts.push(piece);
  }
  return facts;
}

/** The line over the cellar list, "18 days from pitch to package."; "" without a stage. */
export const cellarFacts = (stages: readonly FermentationStage[]) => (stages.length ? `${plural(scheduleDays(stages), "day")} from pitch to package.` : "");

/** A note as a sentence: closed with a full stop unless it already ends one. */
export const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
