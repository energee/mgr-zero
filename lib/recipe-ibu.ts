// lib/recipe-ibu.ts — the one recipe IBU estimate, shared by get_recipe and the
// editor preview. It lives only here: v1 kept a second copy in SQL, and the two
// drifted about 2.3x apart. Also its words: the estimate as a line of its own
// (ibuText), and the line under a drawn IBU figure (ibuNote).
//
// Tinseth, for each hop line:
//   grams per bbl = perBblQty × LB_PER[unit] × 453.59237
//   alpha mg/L    = (alpha % / 100) × grams per bbl × 1000 / LITERS_PER_BBL
//   bigness       = 1.65 × 0.000125 ^ (OG_SG − 1)
//   boil factor   = (1 − e^(−0.04 × minutes)) / 4.15
//   boil line     = bigness × boil factor × alpha mg/L
//   whirlpool     = 0.05 × alpha mg/L
//
// OG is the predicted OG, a usual simplification of boil gravity. Whirlpool hops
// count at a flat 5% utilization, v1's value, because almost no recipe records a
// whirlpool time and many hop only there. That is a rough estimate, and the text
// says so. Dry hops add nothing. Alpha acid is never defaulted: a line missing an
// input is a gap, which gives a lower bound or a stated reason.
import { LB_PER, platoToSg } from "@/lib/recipe-gravity";
import { GRAMS_PER_LB } from "@/lib/uom";
import { LITERS_PER_BBL } from "@/lib/volume";

const WHIRLPOOL_UTILIZATION = 0.05;

export type IbuLine = {
  name: string;
  /** The material's kind; only "hop" counts. */
  category: string;
  stage: string;
  /** In the material's base unit, `unit`. */
  perBblQty: number;
  unit: string | null | undefined;
  timingMinutes: number | null;
  /** Percent. A saved version passes its frozen alpha_snapshot, a draft the material's alpha_acid. */
  alphaAcid: number | null;
};

const GAP_REASONS = ["no alpha acid", "no boil time", "not by weight"] as const;
export type IbuGap = { name: string; reason: (typeof GAP_REASONS)[number] };

export type RecipeIbu =
  | { kind: "estimate"; ibu: number; whirlpool: boolean }
  | { kind: "lowerBound"; ibu: number; gaps: IbuGap[] }
  /** Every counted hop has a gap. */
  | { kind: "gaps"; gaps: IbuGap[] }
  | { kind: "none"; reason: "no predicted OG" | "no boil or whirlpool hops" };

/** What stops one hop line from counting. A line with two problems has two gaps. */
function lineGaps(line: IbuLine): IbuGap[] {
  const reasons = [
    line.alphaAcid === null && "no alpha acid",
    line.stage === "boil" && line.timingMinutes === null && "no boil time",
    !LB_PER[line.unit ?? ""] && "not by weight",
  ] as const;
  return reasons.flatMap((reason) => (reason ? [{ name: line.name, reason }] : []));
}

/** One gap-free line's IBU. */
function lineIbu(line: IbuLine, ogSg: number): number {
  const gramsPerBbl = line.perBblQty * LB_PER[line.unit!] * GRAMS_PER_LB;
  const alphaMgPerL = (line.alphaAcid! / 100) * gramsPerBbl * 1000 / LITERS_PER_BBL;
  if (line.stage === "whirlpool") return WHIRLPOOL_UTILIZATION * alphaMgPerL;
  const bigness = 1.65 * 0.000125 ** (ogSg - 1);
  const boilFactor = (1 - Math.exp(-0.04 * line.timingMinutes!)) / 4.15;
  return bigness * boilFactor * alphaMgPerL;
}

/** The rounded IBU of a version's boil and whirlpool hops, or why there is none. A line with a gap adds nothing, so any gap makes the figure a lower bound. */
export function recipeIbu({ ogPlato, lines }: { ogPlato: number | null; lines: IbuLine[] }): RecipeIbu {
  if (ogPlato === null) return { kind: "none", reason: "no predicted OG" };
  const counted = lines.filter((line) => line.category === "hop" && (line.stage === "boil" || line.stage === "whirlpool"));
  if (counted.length === 0) return { kind: "none", reason: "no boil or whirlpool hops" };

  const gaps = counted.flatMap(lineGaps);
  const complete = counted.filter((line) => lineGaps(line).length === 0);
  if (complete.length === 0) return { kind: "gaps", gaps };

  const og = platoToSg(ogPlato);
  const ibu = Math.round(complete.reduce((sum, line) => sum + lineIbu(line, og), 0));
  return gaps.length > 0 ? { kind: "lowerBound", ibu, gaps } : { kind: "estimate", ibu, whirlpool: complete.some((line) => line.stage === "whirlpool") };
}

/** "no alpha acid: Citra, Mosaic · no boil time: Nelson". A hop on two lines is named once. A saved version adds how to fix
 *  missing alpha acid, because its value is frozen; a draft reads the material, so setting it there is enough. */
function gapsText(gaps: IbuGap[], saved: boolean): string {
  return GAP_REASONS.flatMap((reason) => {
    const names = [...new Set(gaps.filter((gap) => gap.reason === reason).map((gap) => gap.name))];
    if (names.length === 0) return [];
    const fix = saved && reason === "no alpha acid" ? "; set alpha acid under Materials, then Refresh from Materials on the current recipe" : "";
    return [`${reason}: ${names.join(", ")}${fix}`];
  }).join(" · ");
}

/** The estimate as one line that stands alone, number included. `saved` tells a saved version from a draft, as gravityBlockerText does. */
export function ibuText(result: RecipeIbu, { saved }: { saved: boolean }): string {
  switch (result.kind) {
    case "none": return `IBU not estimated: ${result.reason}`;
    case "gaps": return `IBU not estimated: ${gapsText(result.gaps, saved)}`;
    case "lowerBound": return `IBU ≥ ${result.ibu} · ${gapsText(result.gaps, saved)}`;
    case "estimate": return `IBU ${result.ibu}${result.whirlpool ? " · whirlpool hops at 5%" : ""}`;
  }
}

/** The line the recipe page prints under its figures, where the IBU is already drawn as a figure: only what that
 *  figure leaves out, without the number again. Undefined for a plain estimate, which is all in its figure. With no
 *  figure to draw (none, gaps) it is ibuText's reason. */
export function ibuNote(result: RecipeIbu, { saved }: { saved: boolean }): string | undefined {
  switch (result.kind) {
    case "estimate": return result.whirlpool ? "Whirlpool hops count at 5%." : undefined;
    case "lowerBound": return `Not counted in IBU: ${gapsText(result.gaps, saved)}`;
    default: return ibuText(result, { saved });
  }
}
