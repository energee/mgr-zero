// lib/mgr/recipe-day-view.ts — the recipe sheet as "the day at a glance",
// worked out from what the sheet already holds; nothing here is stored.
// Two drawings share one shape (StepLineModel, drawn by
// components/mgr/views/step-line.tsx): the brew-day band, one temperature line
// from mash-in to knock-out with a mark where each boil and whirlpool addition
// goes in (brewDayBand), and the cellar's temperature by day with a mark for
// each dry hop (cellarProfile). A mark names what goes in there. A drawing's x
// values are percents of its span, and a short step is never drawn too narrow
// for its labels (spanShares). The band draws a boil or a whirlpool that has
// an addition even when the recipe holds no time for it: at the narrowest
// width, with no minutes.
// Under them, everything that goes in, in time order, with each moment said
// once: brew day (brewDayMoments) and the cellar (cellarMoments). Each row
// reads its amount for the batch, or per bbl while the recipe has no batch
// size. Also the sentences above the lists: the two assumptions under the
// figures (assumptions), the brew day's facts (brewDayFacts) and the cellar's
// length (cellarFacts). On the editable sheet the brew day's facts also say
// which numbers that apply are not set, as words that open Recipe numbers.
// Last, an earlier copy's mash rests and fermentation
// stages read out line by line (scheduleReadOut), since it has no sheet to
// open.
import { formatDuration, MINUTES_PER_DAY } from "@/lib/time-window";
import { sentenceCase } from "./labels";
import { batchQty } from "./pack-qty";
import { plural } from "./plural";
import { isNumber } from "./quantity-input";
import { fermentationStageDetail, mashStepDetail, perBblDisplay, scheduleDays, stepKind, type FermentationStage, type MashStep } from "./recipe-process-view";
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
  /** Where additions go in, on the baseline, left to right. `title` names what goes in there ("Citra and Mosaic"). */
  marks: { at: number; title: string }[];
  /** What the baseline says under itself: its ends, and any day between. */
  ticks: { at: number; text: string }[];
};

/** Each stretch's share of the span as a percent, by its length. No stretch is drawn narrower than `floor` percent, so
 *  its labels fit on a phone; the longer ones give up the room. A stretch with no length is drawn that narrow. With too
 *  many stretches for that, or when none has a length, all share equally. */
export function spanShares(lengths: readonly number[], floor: number): number[] {
  const least = Math.min(floor, 100 / lengths.length);
  const held = new Set<number>();
  for (;;) {
    const free = 100 - least * held.size;
    const total = lengths.reduce((sum, length, i) => (held.has(i) ? sum : sum + length), 0);
    const shares = lengths.map((length, i) => (held.has(i) ? least : total > 0 ? free * length / total : free / (lengths.length - held.size)));
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
/** Each value once. */
const unique = <T>(values: T[]) => [...new Set(values)];
/** Marks left to right, one for additions that go in together, named by what goes in there. A hop on two lines is named once. */
const marksAt = (placed: { at: number; name: string }[]): StepLineModel["marks"] =>
  unique(placed.map((p) => p.at)).sort((a, b) => a - b).map((at) => ({ at, title: andList(unique(placed.filter((p) => p.at === at).map((p) => p.name))) }));
/** A typed process number the drawing can use: plain notation, above zero. Anything else reads as not set. */
const positive = (text: string | undefined) => (text !== undefined && isNumber(text) && Number(text) > 0 ? Number(text) : undefined);
const degrees = (tempF: number | string) => `${tempF} °F`;

/** The narrowest a band step is drawn, in percent: room for "104 °F" over it at phone width. */
const BAND_FLOOR = 14;
/** The lowest temperature the band's scale starts from, unless a rest is cooler. The boil sits at 212 on that scale. */
const BAND_LOW_F = 95, BAND_HIGH_F = 212;

/** The boil and the whirlpool as the sheet holds them, for the band and for the line over the brew-day list. A number
 *  the draft cannot use reads as not set, and a time not set is 0. The recipe has a `boil` when it holds a boil time or
 *  an ingredient goes in at the boil. It has a `whirlpool` when it holds one of the whirlpool's three numbers (its
 *  time, its rest, its temperature) or an ingredient goes in there. */
type BrewDay = { boil: boolean; boilMin: number; whirlpool: boolean; whirlpoolMin: number; restMin: number; whirlpoolTemp?: number; knockout?: number };
function brewDay(numbers: Partial<Record<RecipeNumberKey, string>>, lines: readonly Pick<RecipeIngredientView, "stage">[]): BrewDay {
  const goesIn = (stage: string) => lines.some((line) => line.stage === stage);
  const boilMin = positive(numbers.boilMin) ?? 0, whirlpoolMin = positive(numbers.whirlpoolMin) ?? 0, restMin = positive(numbers.whirlpoolRest) ?? 0;
  const whirlpoolTemp = positive(numbers.whirlpoolTemp);
  return {
    boil: boilMin > 0 || goesIn("boil"), boilMin,
    whirlpool: whirlpoolMin + restMin > 0 || whirlpoolTemp !== undefined || goesIn("whirlpool"), whirlpoolMin, restMin, whirlpoolTemp,
    knockout: positive(numbers.knockoutTemp),
  };
}

/** The band in a sentence, for a screen reader: each rest, the boil, the whirlpool and its rest, then the knock-out, and
 *  what goes in at each mark. A boil or a whirlpool with no time is named without one. */
function bandSummary(rests: readonly MashStep[], { boil, boilMin, whirlpool, whirlpoolMin, restMin, whirlpoolTemp, knockout }: BrewDay, marks: StepLineModel["marks"]): string {
  const held = rests.map((step) => `${degrees(step.tempF)} for ${plural(step.minutes, "minute")}`);
  const at = whirlpoolTemp ? ` at ${degrees(whirlpoolTemp)}` : "";
  const whirlpoolSaid = whirlpoolMin ? `a ${whirlpoolMin} minute whirlpool${at}${restMin ? ` with a ${restMin} minute rest` : ""}` : restMin ? `a ${restMin} minute whirlpool rest${at}` : `a whirlpool${at}`;
  const said = [
    held.length > 1 ? `mash rests at ${andList(held)}` : held.length ? `a mash rest at ${held[0]}` : "",
    boil ? (boilMin ? `a ${boilMin} minute boil` : "a boil") : "",
    whirlpool ? whirlpoolSaid : "",
  ].filter(Boolean);
  return [
    `The brew day by temperature: ${andList(said)}.`,
    knockout ? `Knock out at ${degrees(knockout)}.` : "",
    marks.length ? `${plural(marks.length, "mark")} ${marks.length === 1 ? "shows" : "show"} where each boil or whirlpool addition goes in: ${marks.map((mark) => mark.title).join("; ")}.` : "",
  ].filter(Boolean).join(" ");
}

/** The brew day as one temperature line, mash-in to knock-out: each mash rest at its temperature with its minutes,
 *  then the boil and the whirlpool with its rest, when the recipe has them (brewDay). The boil draws at a fixed height
 *  with no temperature, because the boiling point depends on altitude; a whirlpool with no temperature draws level
 *  with it. A boil or a whirlpool with no time is drawn at the narrowest width with no minutes, so an addition there
 *  is always on the band.
 *  A mark shows where each boil and whirlpool addition goes in, and names it. A boil addition's minutes count down to
 *  the end of the boil, and a whirlpool addition's to the end of the whirlpool, before its rest. A whirlpool addition
 *  with no time goes in as the whirlpool starts; a boil addition with no time has no known place, so it has no mark.
 *  A step with no time has no scale, so everything that goes in during it shares one mark where it starts.
 *  The band closes with the knock-out temperature and the total time. The total counts the steps that have a time and
 *  names any that has none ("2 hours plus the whirlpool").
 *  Undefined when the recipe has no rest, no boil and no whirlpool. */
export function brewDayBand(mash: readonly MashStep[], numbers: Partial<Record<RecipeNumberKey, string>>, lines: readonly Pick<RecipeIngredientView, "stage" | "timingMinutes" | "title">[]): StepLineModel | undefined {
  const day = brewDay(numbers, lines);
  const { boilMin, whirlpoolMin, restMin, whirlpoolTemp, knockout } = day;
  const rests = mash.filter((step) => step.minutes > 0);
  const low = Math.min(BAND_LOW_F, ...rests.map((step) => step.tempF));
  const level = (tempF: number | undefined) => (tempF === undefined ? 1 : Math.min(1, Math.max(0, (tempF - low) / (BAND_HIGH_F - low))));
  const whirlpoolNote = whirlpoolMin && restMin ? `${whirlpoolMin} min, rest ${restMin}` : whirlpoolMin ? `${whirlpoolMin} min` : restMin ? `rest ${restMin} min` : undefined;
  const steps = layOut([
    ...rests.map((step) => ({ zone: "Mash", length: step.minutes, level: level(step.tempF), temp: degrees(step.tempF), note: `${step.minutes} min` })),
    ...(day.boil ? [{ zone: "Boil", length: boilMin, level: 1, temp: undefined, note: boilMin ? `${boilMin} min` : undefined }] : []),
    ...(day.whirlpool ? [{ zone: "Whirlpool", length: whirlpoolMin + restMin, level: level(whirlpoolTemp), temp: whirlpoolTemp ? degrees(whirlpoolTemp) : undefined, note: whirlpoolNote }] : []),
  ], BAND_FLOOR);
  if (steps.length === 0) return undefined;
  const zones = ["Mash", "Boil", "Whirlpool"].flatMap((name) => {
    const inZone = steps.filter((step) => step.zone === name);
    return inZone.length ? [{ name, from: inZone[0].from, to: inZone[inZone.length - 1].to }] : [];
  });
  const boil = steps.find((step) => step.zone === "Boil"), whirlpool = steps.find((step) => step.zone === "Whirlpool");
  const marks = marksAt(lines.flatMap((line) => {
    const step = line.stage === "boil" ? boil : line.stage === "whirlpool" ? whirlpool : undefined;
    // A mash or cellar line has no mark on the band.
    if (!step) return [];
    // A step with no time: where it starts.
    if (!step.length) return [{ at: step.from, name: line.title }];
    // An addition with no time: as the whirlpool starts, or nowhere in the boil.
    if (line.timingMinutes === null) return step === whirlpool ? [{ at: step.from, name: line.title }] : [];
    // Its minutes before the end of the boil, or of the whirlpool before its rest.
    return [{ at: along(step, step === boil ? 1 - line.timingMinutes / step.length : (whirlpoolMin - line.timingMinutes) / step.length), name: line.title }];
  }));
  const timed = steps.filter((step) => step.length > 0);
  const untimed = steps.filter((step) => !step.length).map((step) => `the ${step.zone.toLowerCase()}`);
  // One step already says its minutes, so it is not totalled again (#1518). A step with no time is named, not counted.
  const total = timed.length > 1 ? `${formatDuration(timed.reduce((sum, step) => sum + step.length, 0))}${untimed.length ? ` plus ${andList(untimed)}` : ""}` : "";
  const end = [knockout ? `Knock out at ${degrees(knockout)}` : "", total].filter(Boolean).join(", ");
  return {
    summary: bandSummary(rests, day, marks),
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
 *  pitch, each day the temperature changes and the last day under the baseline, and a mark on each dry hop's day,
 *  named by the hops that go in then. A dry hop after the schedule's last day sits at its end. Undefined without a stage. */
export function cellarProfile(stages: readonly FermentationStage[], lines: readonly Pick<RecipeIngredientView, "stage" | "timingMinutes" | "title">[]): StepLineModel | undefined {
  const runs: { tempF: number; length: number; start: number }[] = [];
  for (const stage of stages.filter((s) => s.days > 0)) {
    const last = runs[runs.length - 1];
    if (last?.tempF === stage.tempF) last.length += stage.days;
    else runs.push({ tempF: stage.tempF, length: stage.days, start: last ? last.start + last.length : 0 });
  }
  if (runs.length === 0) return undefined;
  const temps = runs.map((run) => run.tempF), low = Math.min(...temps), high = Math.max(...temps);
  const steps = layOut(runs, CELLAR_FLOOR);
  // Each dry hop with a day, by that day.
  const hops = lines.flatMap((line) => { const day = line.stage === "dry_hop" ? cellarDay(line) : null; return day === null ? [] : [{ at: day, name: line.title }]; });
  const at = (day: number) => {
    const step = steps.find((s) => day < s.start + s.length);
    return step ? along(step, (day - step.start) / step.length) : 100;
  };
  const held = runs.map((run) => `${degrees(run.tempF)} for ${plural(run.length, "day")}`);
  // The sentence names the hops by day; the marks by place, where every day past the schedule's end is one mark.
  const byDay = marksAt(hops).map((day) => `${day.title} on day ${day.at}`).join("; ");
  return {
    summary: `Fermentation temperature by day: ${andList(held)}.${byDay ? ` Marks show the dry hops: ${byDay}.` : ""}`,
    steps: steps.map(({ from, to, tempF }) => ({ from, to, level: high === low ? 0.5 : (tempF - low) / (high - low), temp: degrees(tempF) })),
    zones: [],
    marks: marksAt(hops.map((hop) => ({ ...hop, at: at(hop.at) }))),
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

/** A batch amount as a person writes it. Thousands are grouped ("1,265"). Under 100 it reads to three significant
 *  digits, as a per-bbl amount does (perBblDisplay): "0.253", "8.8". From 100 up it keeps one decimal at most
 *  ("272.7"). Display only; nothing stored is rounded. */
const batchAmount = (qty: number) => (qty < 100 ? perBblDisplay(qty) : qty.toLocaleString("en-US", { maximumFractionDigits: 1 }));

function lineRow(line: RecipeIngredientView, bbl: number): GoesInRow {
  const share = line.share === undefined ? undefined : wholePercent(line.share);
  if (!(bbl > 0) || !line.pack) return { key: line.key, title: line.title, amount: `${line.amount} / bbl`, share, line };
  const qty = batchQty(line.pack.perBbl, bbl), amount = batchTotalText(line.pack, bbl);
  const inUnit = `${batchAmount(qty)} ${line.pack.unit}`;
  // An amount that is not a count of packs is that reading. A grain that reads in bags also reads its weight.
  if (amount === `${qty} ${line.pack.unit}`) return { key: line.key, title: line.title, amount: inUnit, share, line };
  return { key: line.key, title: line.title, amount, weight: share === undefined ? undefined : inUnit, share, line };
}

/** The moments that are worth saying: those with a row. */
const withRows = (moments: GoesInMoment[]) => moments.filter((moment) => moment.rows.length > 0);

/** What goes in on brew day, in time order: the grain at mash-in, then the mash water and its salts, so the grain
 *  bar over the list sits on the grain's rows. Then each timed mash addition, the sparge water and its salts, the
 *  kettle salts, each boil addition, then the whirlpool. A stage's timed additions run as get_recipe orders them:
 *  boil and whirlpool minutes count down to the end of the stage, so the most minutes come first; mash minutes count
 *  up from mash-in, so the fewest do. A boil addition with no time comes last in the boil; a whirlpool addition with
 *  no time goes in as it starts. */
export function brewDayMoments(lines: readonly RecipeIngredientView[], water: RecipeWaterView | undefined, bbl: number): GoesInMoment[] {
  const row = (line: RecipeIngredientView) => lineRow(line, bbl);
  const at = (stage: string, timed: boolean) => lines.filter((line) => line.stage === stage && (line.timingMinutes !== null) === timed);
  /** A stage's timed lines, one moment per time: from the most minutes for a stage that counts down, else from the fewest. */
  const timed = (stage: string, title: string, countsDown: boolean) =>
    unique(at(stage, true).map((line) => line.timingMinutes!)).sort((a, b) => (countsDown ? b - a : a - b))
      .map((minutes) => at(stage, true).filter((line) => line.timingMinutes === minutes))
      .map((together) => ({ when: `${title}, ${together[0].timing}`, rows: together.map(row) }));
  const salts = (stage: string) => (water?.additions ?? []).flatMap((a, i) => (a.stage === stage ? [{ key: `water-${i}`, title: a.name, amount: `${a.qty} ${a.unit}` }] : []));
  const poured = (key: string, title: string, gal: string | undefined) => (gal ? [{ key, title, amount: `${gal} gal` }] : []);
  return withRows([
    { when: "Mash-in", rows: [...at("mash", false).map(row), ...poured("water-mash", "Mash water", water?.mashGal), ...salts("mash")] },
    ...timed("mash", "Mash", false),
    { when: "Sparge", rows: [...poured("water-sparge", "Sparge water", water?.spargeGal), ...salts("sparge")] },
    { when: "Kettle", rows: salts("kettle") },
    ...timed("boil", "Boil", true),
    { when: "Boil", rows: at("boil", false).map(row) },
    { when: "Whirlpool", rows: at("whirlpool", false).map(row) },
    ...timed("whirlpool", "Whirlpool", true),
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

/** Clauses as one sentence's pieces: those with words, joined by commas. Each clause is written as it would start a
 *  sentence ("Knock out at "), so one after the first starts in lower case, because it now follows a comma. */
function clauses(...parts: Fact[][]): Fact[] {
  const lower = (text: string) => text[0].toLowerCase() + text.slice(1);
  return parts.filter((part) => part.length).flatMap((part, i) => {
    if (i === 0) return part;
    const [first, ...rest] = part;
    return [", ", typeof first === "string" ? lower(first) : { ...first, text: lower(first.text) }, ...rest];
  });
}

/** The line over the brew-day list: the target water profile and mash pH, the pre-boil volume, and the whirlpool and
 *  knock-out temperatures, each only when the recipe holds it. A `source` profile is named beside the target; the page
 *  passes one only for an earlier copy, which has no Water sheet to hold it.
 *  On the `editable` sheet a number that applies and is not set says so, as the words that open Recipe numbers to set
 *  it: the boil time and the whirlpool's time and temperature when the recipe has that step (brewDay), which an
 *  ingredient at that stage is enough for; and the knock-out temperature, which every recipe has. The two times are
 *  asked for here because the band, where they read, opens nothing. An earlier copy says nothing about a number it
 *  does not have. Empty when there is nothing to say. */
export function brewDayFacts(water: Pick<RecipeWaterView, "target" | "source" | "mashPh"> | undefined, numbers: Partial<Record<RecipeNumberKey, string>>, lines: readonly Pick<RecipeIngredientView, "stage">[], editable: boolean): Fact[] {
  const number = (text: string): Fact => ({ text, opens: "numbers" });
  const day = brewDay(numbers, lines);
  const noBoilTime = editable && day.boil && !day.boilMin;
  const noWhirlpoolTime = editable && day.whirlpool && !(day.whirlpoolMin + day.restMin);
  const noWhirlpoolTemp = editable && day.whirlpool && !numbers.whirlpoolTemp;
  const sentences: Fact[][] = [];
  const mashPh = water?.mashPh ? `, mash pH ${water.mashPh}` : "";
  if (water?.target) sentences.push([{ text: water.target, opens: "water" }, `${water.source ? ` (source ${water.source})` : ""}${mashPh}`]);
  else if (water?.source) sentences.push([`Source water ${water.source}${mashPh}`]);
  else if (water?.mashPh) sentences.push([`Mash pH ${water.mashPh}`]);
  sentences.push(clauses(numbers.preBoil ? ["Boil from ", number(`${numbers.preBoil} bbl`)] : [], noBoilTime ? [number("Boil time not set")] : []));
  sentences.push(clauses(
    numbers.whirlpoolTemp ? ["Whirlpool at ", number(degrees(numbers.whirlpoolTemp))] : [],
    // One prompt asks for both when neither is set.
    noWhirlpoolTime ? [number(noWhirlpoolTemp ? "Whirlpool time and temperature not set" : "Whirlpool time not set")] : noWhirlpoolTemp ? [number("Whirlpool temperature not set")] : [],
    numbers.knockoutTemp ? ["Knock out at ", number(degrees(numbers.knockoutTemp))] : editable ? [number("Knock-out temperature not set")] : [],
  ));
  const said = sentences.filter((sentence) => sentence.length);
  const facts: Fact[] = [];
  // Each sentence ends with a full stop and a space before the next; words that meet are one piece.
  for (const piece of said.flatMap((sentence, i) => [...sentence, i < said.length - 1 ? ". " : "."])) {
    const last = facts[facts.length - 1];
    if (typeof piece === "string" && typeof last === "string") facts[facts.length - 1] = last + piece;
    else if (piece !== "") facts.push(piece);
  }
  return facts;
}

/** An earlier copy's schedules read out, because it has no schedule sheet to open: each mash rest and each
 *  fermentation stage as its name and its detail (its kind, temperature and length). A schedule of one step is
 *  already said in full by its drawing, so its line adds only the kind (#1518: nothing is said twice); `detail` is
 *  "" when the kind only repeats the name. */
export const scheduleReadOut = (mash: readonly MashStep[], stages: readonly FermentationStage[]) => ({
  rests: mash.map((step) => ({ name: step.name, detail: mash.length > 1 ? mashStepDetail(step) : stepKind(step) })),
  stages: stages.map((stage) => ({ name: stage.name, detail: stages.length > 1 ? [stepKind(stage), fermentationStageDetail(stage)].filter(Boolean).join(" · ") : stepKind(stage) })),
});

/** The line over the cellar list, "18 days from pitch to package."; "" without a stage. */
export const cellarFacts = (stages: readonly FermentationStage[]) => (stages.length ? `${plural(scheduleDays(stages), "day")} from pitch to package.` : "");

/** A note as a sentence: closed with a full stop unless it already ends one. */
export const sentence = (text: string) => (/[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);
