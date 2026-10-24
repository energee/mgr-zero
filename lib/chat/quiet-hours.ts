import { z } from "zod";

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
