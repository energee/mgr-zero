import { READING_BOUNDS } from "@/lib/composer/offline-policy";
import { INVALID_GRAVITY, parseGravity, type GravityUnit } from "./gravity-unit";
import { isNumber, numberNotationError } from "./quantity-input";
import { submitReason } from "./submit-reason";

/** One parse drives field errors, readiness and the fresh outbox payload. */
export function readingValidation(values: { observedAt: string; tempF: string; gravity: string; ph: string }, unit: GravityUnit) {
  const gravityPlato = parseGravity(values.gravity, unit);
  const tempF = Number(values.tempF);
  const ph = values.ph.trim() === "" ? undefined : Number(values.ph);
  const gravityHelp = unit === "sg"
    ? "Enter a gravity like 1.050 or 1050, or leave it blank."
    : "Enter a gravity in °P like 12.5, or leave it blank. Negative °P is valid for fermented beer.";
  const errors = {
    tempF: !isNumber(values.tempF) || tempF < READING_BOUNDS.tempF.min || tempF > READING_BOUNDS.tempF.max
      ? numberNotationError(values.tempF) ?? "Enter a temperature from 25 to 212 °F."
      : undefined,
    gravity: gravityPlato === INVALID_GRAVITY ? gravityHelp : undefined,
    ph: ph !== undefined && (!isNumber(values.ph) || ph < READING_BOUNDS.ph.min || ph > READING_BOUNDS.ph.max)
      ? numberNotationError(values.ph) ?? "Enter a pH from 0 to 14, or leave it blank."
      : undefined,
  };
  const reason = submitReason([
    ...(!values.observedAt ? ["an observation time"] : []),
    ...(errors.tempF ? ["a temperature from 25 to 212 °F in decimal notation"] : []),
    ...(errors.gravity ? ["a valid gravity in the selected unit or a blank gravity"] : []),
    ...(errors.ph ? ["a pH from 0 to 14 in decimal notation or a blank pH"] : []),
  ]);
  return {
    errors,
    reason,
    measurements: reason ? null : { tempF, gravityPlato: typeof gravityPlato === "number" ? gravityPlato : undefined, ph },
  };
}

/** Where the reading sheet goes when it closes: the page it was opened from
 *  (`?from=` — Cellar, Batches, or one batch), else the tank's Vessel detail.
 *  Only those app paths are accepted, so the link cannot send anyone off-site (#1508). */
export function readingReturnHref(from: string | string[] | undefined, vesselId: string): string {
  return typeof from === "string" && /^\/(cellar|batches(\/[0-9a-f-]{36})?)$/.test(from) ? from : `/cellar/vessels/${vesselId}`;
}

/** Save and next tank's destination: that tank's reading sheet, keeping this sheet's `?from=` so the round still closes
 *  where it began. readingReturnHref checks the value again on the next page. */
export function nextReadingHref(from: string | string[] | undefined, occupancyId: string): string {
  return `/cellar/${occupancyId}/reading${typeof from === "string" ? `?from=${encodeURIComponent(from)}` : ""}`;
}
