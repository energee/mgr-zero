import { z } from "zod";
import { submitReason } from "@/lib/mgr/submit-reason";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time in HH:MM format");

/** Recognize IANA aliases without rewriting the exact timezone string hashed by the command ledger. */
const timezone = z.string().refine(value => {
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: value }).resolvedOptions().timeZone;
    return canonical !== "" && !/^[+-]/.test(canonical);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return false;
  }
}, "Choose a valid timezone");

export const quietHoursWindowSchema = z.object({ start: hhmm.nullable(), end: hhmm.nullable() }).superRefine(({ start, end }, ctx) => {
  if (start !== null && end === null) ctx.addIssue({ code: "custom", path: ["end"], message: "Choose an end time" });
  if (start === null && end !== null) ctx.addIssue({ code: "custom", path: ["start"], message: "Choose a start time" });
  if (start !== null && start === end) ctx.addIssue({ code: "custom", path: ["end"], message: "End must differ from start" });
});

export const personalQuietHoursSchema = quietHoursWindowSchema.safeExtend({ timezone: timezone.nullable().optional() });
export const notificationQuietHoursSchema = personalQuietHoursSchema.safeExtend({ start: hhmm, end: hhmm, timezone: timezone.optional() });

type QuietHoursValues = { start: string; end: string };

/** The footer's need for each window quietHoursWindowSchema rejects, so Save never greys out silently (#1501). */
function windowNeeds({ start, end }: QuietHoursValues): string[] {
  if (start && !end) return ["an end time"];
  if (!start && end) return ["a start time"];
  if (start && start === end) return ["an end time different from the start"];
  return [];
}

export function breweryQuietHoursReason(values: QuietHoursValues, initial: QuietHoursValues): string | null {
  const unchanged = values.start === initial.start && values.end === initial.end;
  return submitReason(unchanged ? ["a change to brewery quiet hours"] : windowNeeds(values));
}

export function personalQuietHoursReason(values: QuietHoursValues & { timezone: string }, initial: QuietHoursValues & { timezone: string }): string | null {
  const unchanged = values.start === initial.start && values.end === initial.end && values.timezone === initial.timezone;
  return submitReason(unchanged ? ["a change to your quiet hours"] : windowNeeds(values));
}
