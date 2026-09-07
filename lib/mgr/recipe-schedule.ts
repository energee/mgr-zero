// lib/mgr/recipe-schedule.ts — a recipe version's mash and fermentation
// schedules are ordered step lists, and their screens state a total in the
// footer. saccharificationRest names the step the prediction reads: Recipe no
// longer carries a Mash temp scalar (spec D4), so the schedule is the only
// place that number lives and the footer has to point at it. Pure, so
// tests/recipe-schedule.test.ts covers it without a DOM.

/** One step of either schedule. `duration` is minutes for mash, days for fermentation. */
export type Step = { name: string; kind: string; tempF: number; duration: number };

/** Conversion happens between these temperatures; outside them a step is not a rest. */
const SACC_RANGE_F = [144, 162] as const;

/** The schedule's total duration, in whatever unit its steps carry. */
export function totalDuration(steps: readonly Step[]): number {
  return steps.reduce((total, step) => total + step.duration, 0);
}

/**
 * The conversion rest the prediction reads: the longest step sitting in the
 * saccharification range. Longest rather than first, because a step mash rests
 * twice in range and the alpha rest is the one that sets fermentability.
 */
export function saccharificationRest(steps: readonly Step[]): Step | null {
  const inRange = steps.filter(
    (s) => s.tempF >= SACC_RANGE_F[0] && s.tempF <= SACC_RANGE_F[1],
  );
  if (inRange.length === 0) return null;
  return inRange.reduce((best, s) => (s.duration > best.duration ? s : best));
}
