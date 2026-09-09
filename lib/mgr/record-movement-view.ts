// lib/mgr/record-movement-view.ts — view-model for the Record movement sheet.
// Live create stays movement-form.tsx: E.pick / E.qty are not a controlled CommandForm.
import { formatVolume } from "@/lib/volume";

export const MOVEMENT_KIND_OPTIONS = [
  "opening balance", "depletion", "loss", "sample", "festival removal", "destruction", "adjustment",
] as const;

export const MOVEMENT_UNIT_OPTIONS = ["keg", "case", "bbl"] as const;
export const MOVEMENT_CHANNEL_OPTIONS = ["Wholesale", "Taproom", "DTC", "Export"];

export type RecordMovementViewModel = {
  kind: string;
  kindIndex: number;
  kindOptions: string[];
  sku: string;
  location: string;
  locationOptions: string[];
  bin: string;
  binOptions: string[];
  channel: string;
  channelOptions: string[];
  destState: string;
  destStateOptions: string[];
  qty: string;
  unitIndex: number;
  unitOptions: string[];
  preview: string;
};

export type RecordMovementSnapshot = {
  kind: (typeof MOVEMENT_KIND_OPTIONS)[number];
  sku: string;
  location: string;
  locationOptions: string[];
  bin: string;
  binOptions: string[];
  channel: string;
  destState: string;
  destStateOptions: string[];
  qty: number;
  unit: (typeof MOVEMENT_UNIT_OPTIONS)[number];
  bbl: string;
};

export function toRecordMovementViewProps(s: RecordMovementSnapshot): RecordMovementViewModel {
  const kindIndex = MOVEMENT_KIND_OPTIONS.indexOf(s.kind);
  const unitIndex = MOVEMENT_UNIT_OPTIONS.indexOf(s.unit);
  const sign = s.kind === "opening balance" || s.kind === "adjustment" ? "" : "−";
  return {
    kind: s.kind,
    kindIndex: kindIndex < 0 ? 0 : kindIndex,
    kindOptions: [...MOVEMENT_KIND_OPTIONS],
    sku: s.sku,
    location: s.location,
    locationOptions: s.locationOptions,
    bin: s.bin,
    binOptions: s.binOptions,
    channel: s.channel,
    channelOptions: [...MOVEMENT_CHANNEL_OPTIONS],
    destState: s.destState,
    destStateOptions: s.destStateOptions,
    qty: String(s.qty),
    unitIndex: unitIndex < 0 ? 0 : unitIndex,
    unitOptions: [...MOVEMENT_UNIT_OPTIONS],
    preview: `Preview: ${sign}${s.qty} ${s.unit} · ${formatVolume(s.bbl)} · ${s.kind} · ${s.destState.split(" · ")[0]} · amounts are entered positive`,
  };
}
