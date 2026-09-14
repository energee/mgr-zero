// lib/mgr/recipe-schedule.ts — a recipe version's mash schedule is an ordered
// step list, and its screen states a total in the footer. saccharificationRest
// names the step the prediction reads: Recipe no longer carries a Mash temp
// scalar (spec D4), so the schedule is the only place that number lives and
// the footer has to point at it. The RPC in 20260917100000_recipe_process_spec
// derives mash_temp_f with the same range and tie-break; SQL is authoritative
// for the column, this is what the sheets print. Pure, so
// tests/recipe-schedule.test.ts covers it without a DOM.

/** One mash step as create_recipe_version stores it. */
export type MashStep = { name: string; kind: string; tempF: number; minutes: number };

/** Conversion happens between these temperatures; outside them a step is not a rest. */
export const SACC_RANGE_F = [144, 162] as const;

export const totalMinutes = (steps: readonly MashStep[]): number => steps.reduce((total, step) => total + step.minutes, 0);

/**
 * The conversion rest the prediction reads: the longest step sitting in the
 * saccharification range. Longest rather than first, because a step mash rests
 * twice in range and the alpha rest is the one that sets fermentability.
 */
export function saccharificationRest(steps: readonly MashStep[]): MashStep | null {
  const inRange = steps.filter((s) => s.tempF >= SACC_RANGE_F[0] && s.tempF <= SACC_RANGE_F[1]);
  if (inRange.length === 0) return null;
  return inRange.reduce((best, s) => (s.minutes > best.minutes ? s : best));
}
