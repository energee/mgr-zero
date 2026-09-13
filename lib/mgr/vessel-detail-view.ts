// lib/mgr/vessel-detail-view.ts — view-model for Vessel detail (inventory).
import { formatGravity, type GravityUnit } from "./gravity-unit";

export type VesselReading = { id: string; at: string; temp_f: number; gravity_plato: number | null; ph: number | null; note: string | null };
export const VESSEL_TYPES = ["Fermenter", "Brite", "Barrel", "Kettle", "Other"];

export function formatVesselReading(reading: VesselReading, unit: GravityUnit): string {
  return [reading.gravity_plato == null ? undefined : formatGravity(reading.gravity_plato, unit), `${reading.temp_f} °F`, reading.ph == null ? undefined : `pH ${reading.ph}`, reading.note].filter(Boolean).join(" · ");
}
export type VesselDetailViewModel = {
  backHref?: string;
  title: string;
  occupancy?: { title: string; detail: string; verb: string; warning?: boolean; href?: string };
  readingHref?: string;
  currentReading: string;
  history: { key: string; title: string; detail: string; who?: string }[];
  name: string;
  type: string;
  typeOptions: string[];
  capacity: string;
};
