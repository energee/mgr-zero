// lib/mgr/vessel-detail-view.ts — view-model for Vessel detail (inventory and
// live), its capacity field error, and what its Save vessel still needs.
import { formatGravity, type GravityUnit } from "./gravity-unit";
import { formatDateTime } from "@/lib/date-format";
import { submitReason } from "@/lib/mgr/submit-reason";

export type VesselReading = { id: string; at: string; temp_f: number | null; gravity_plato: number | null; ph: number | null; note: string | null };
export const VESSEL_TYPES = ["Fermenter", "Brite", "Barrel", "Kettle", "Other"];

export function formatVesselReading(reading: VesselReading, unit: GravityUnit): string {
  return [reading.gravity_plato == null ? undefined : formatGravity(reading.gravity_plato, unit), reading.temp_f == null ? undefined : `${reading.temp_f} °F`, reading.ph == null ? undefined : `pH ${reading.ph}`, reading.note].filter(Boolean).join(" · ");
}
// One tank's newest reading with its time, as Cellar and Batches list it.
export function formatLatestReading(reading: VesselReading | undefined | null, unit: GravityUnit, timeZone: string): string {
  return reading ? `${formatVesselReading(reading, unit)} · ${formatDateTime(reading.at, timeZone)}` : "No readings yet";
}
export type VesselDetailViewModel = {
  backHref?: string;
  title: string;
  /** The open occupancy; its row only opens the batch, so it is a row link, not a verb (#1026). */
  occupancy?: { title: string; detail: string; warning?: boolean; href?: string };
  readingHref?: string;
  /** Absent with `history` on New vessel: a vessel not saved yet has no
   *  occupancy or readings, so the view draws only its facts (#1116). */
  currentReading?: string;
  history?: { key: string; title: string; detail: string; who?: string }[];
  name: string;
  type: string;
  typeOptions: string[];
  capacity: string;
  /** Retired by delete_vessel: out of the cellar, history kept, nothing left to delete. */
  retired?: boolean;
};

function hasCapacity(capacity: string): boolean {
  const bbl = Number(capacity);
  return Number.isFinite(bbl) && bbl > 0;
}

/** A typed capacity the vessel cannot take, shown under the field. A blank
 *  one is not an error: the capacity is then missing (vesselReason). */
export function vesselCapacityError(capacity: string): string | undefined {
  return capacity.trim() !== "" && !hasCapacity(capacity) ? "Capacity must be more than 0." : undefined;
}

/** What Save vessel waits for: a name and a capacity above zero. */
export function vesselReason({ name, capacity }: { name: string; capacity: string }): string | null {
  const missing: string[] = [];
  if (!name.trim()) missing.push("a name");
  if (!hasCapacity(capacity)) missing.push("a capacity above zero");
  return submitReason(missing);
}
