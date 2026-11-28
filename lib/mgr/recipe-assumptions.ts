// lib/mgr/recipe-assumptions.ts — a recipe's two assumptions (brewhouse
// efficiency and yeast attenuation) suggested from the brewery's own finished
// batches (docs/plans/derived-assumptions.md). list_batch_measurements returns
// each counted batch as a BatchMeasurement; suggestAssumptions picks, for the
// sheet as typed, the batches it should be compared with and takes their median.
// Nothing here changes a recipe: the Recipe numbers sheet offers the number and
// the brewer uses it or not.
import { plural } from "./plural";

/** One brewed, closed batch as list_batch_measurements returns it: the keys it is matched on, and what it measured. */
export type BatchMeasurement = {
  batchId: string;
  batchNo: number | null;
  /** ISO date. */
  brewedOn: string;
  /** The grain bill of the copy the batch was brewed from (gristKey in lib/mgr/recipe-view.ts). */
  gristKey: string;
  /** The yeast materials on that copy's lines, at any stage. */
  yeastIds: string[];
  /** The saccharification rest of that copy's mash schedule, in °F; null when no rest is in range. */
  mashRestF: number | null;
  /** A fraction (0.74); null when the batch has no first gravity reading or no knockout. */
  brewhouseEfficiency: number | null;
  /** A fraction (0.80); null unless the last gravity reading is at least 7 days after brew day and below the first. */
  apparentAttenuation: number | null;
};

/** A suggested assumption: the number to use, how many batches it comes from, and the sentence the sheet shows. */
export type AssumptionSuggestion = { percent: number; batches: number; text: string };

/** One row of the rule table: which batches it compares, and the start of its sentence ("on this yeast"). */
type Rule = { matches: (batch: BatchMeasurement) => boolean; says: (batches: string) => string };

/** The middle value, or the mean of the middle two for an even count. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The first rule with at least two batches that measured this value, as a suggestion; none when no rule has two.
 *  Two, not one, so a single odd batch never sets a recipe's number. */
function firstRuleWithTwo(
  rules: readonly Rule[],
  history: readonly BatchMeasurement[],
  measured: (batch: BatchMeasurement) => number | null,
): AssumptionSuggestion | undefined {
  for (const rule of rules) {
    const values = history.filter(rule.matches).map(measured).filter((value): value is number => value !== null);
    if (values.length < 2) continue;
    const percent = Math.round(median(values) * 100);
    return { percent, batches: values.length, text: `${rule.says(plural(values.length, "batch", "batches"))} ${percent}%.` };
  }
  return undefined;
}

/** Suggests the sheet's brewhouse efficiency and yeast attenuation from the brewery's own batches, per the rule table in
 *  docs/plans/derived-assumptions.md: the closest batches with at least two measurements win, falling back to every batch.
 *  An empty gristKey (no mash lines) matches nothing; a sheet with no yeast or no mash rest skips the rules that need it. */
export function suggestAssumptions(
  sheet: { gristKey: string; yeastIds: readonly string[]; mashRestF: number | null },
  history: readonly BatchMeasurement[],
): { efficiency?: AssumptionSuggestion; attenuation?: AssumptionSuggestion } {
  const sameGrist = (b: BatchMeasurement) => sheet.gristKey !== "" && b.gristKey === sheet.gristKey;
  const sameYeast = (b: BatchMeasurement) => b.yeastIds.some((id) => sheet.yeastIds.includes(id));
  const nearMash = (b: BatchMeasurement) =>
    sheet.mashRestF !== null && b.mashRestF !== null && Math.abs(b.mashRestF - sheet.mashRestF) <= 2;
  const every = () => true;
  const mashed = `mashed near ${sheet.mashRestF} °F`;

  const efficiency = firstRuleWithTwo([
    { matches: sameGrist, says: (n) => `${n} on this grain bill measured` },
    { matches: every, says: (n) => `${n} across the brewery measured` },
  ], history, (b) => b.brewhouseEfficiency);

  const attenuation = firstRuleWithTwo([
    { matches: (b) => sameGrist(b) && sameYeast(b) && nearMash(b), says: (n) => `${n} on this grain bill and yeast, ${mashed}, finished at` },
    { matches: (b) => sameYeast(b) && nearMash(b), says: (n) => `${n} on this yeast, ${mashed}, finished at` },
    { matches: sameYeast, says: (n) => `${n} on this yeast finished at` },
    { matches: every, says: (n) => `${n} across the brewery finished at` },
  ], history, (b) => b.apparentAttenuation);

  return { ...(efficiency && { efficiency }), ...(attenuation && { attenuation }) };
}

/** A suggestion as the Recipe numbers sheet draws it: its sentence, and the whole percent Use puts in the field. */
export type AssumptionOffer = { text: string; use: string };

/** The suggestions the sheet offers for the sheet as typed: one per assumption, and only when the measured number
 *  differs from what the field holds, so a recipe already on it stays quiet. */
export function assumptionSuggestions(
  sheet: Parameters<typeof suggestAssumptions>[0],
  history: readonly BatchMeasurement[],
  fields: { efficiency: string; attenuation: string },
): Partial<Record<"efficiency" | "attenuation", AssumptionOffer>> {
  const measured = suggestAssumptions(sheet, history);
  const offer = (key: "efficiency" | "attenuation") => {
    const suggestion = measured[key];
    // A blank field holds no number, so it always differs.
    const differs = fields[key] === "" || Number(fields[key]) !== suggestion?.percent;
    return suggestion && differs ? { [key]: { text: suggestion.text, use: String(suggestion.percent) } } : {};
  };
  return { ...offer("efficiency"), ...offer("attenuation") };
}
