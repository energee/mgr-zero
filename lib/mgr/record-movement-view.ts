// lib/mgr/record-movement-view.ts — view-model for the shared Record movement sheet.
import { formatVolume } from "@/lib/volume";

export const MOVEMENT_KIND_OPTIONS = [
  "opening balance", "depletion", "loss", "sample", "festival removal", "destruction", "adjustment", "production in", "return in",
] as const;

export const MOVEMENT_CHANNEL_OPTIONS = ["Wholesale", "Taproom", "DTC", "Export"];

export type RecordMovementViewModel = {
  kind: string;
  kindIndex: number;
  kindOptions: string[];
  sku: string;
  skuOptions: string[];
  location: string;
  locationOptions: string[];
  bin: string;
  binOptions: string[];
  channel: string;
  channelOptions: string[];
  destState: string;
  destStateOptions: string[];
  destStateInput?: boolean;
  qty: string;
  preview: string;
  direction?: string;
  directionOptions?: string[];
  lot?: string;
  lotOptions?: string[];
  note?: string;
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
  bbl: string;
};

export function toRecordMovementViewProps(s: RecordMovementSnapshot): RecordMovementViewModel {
  const kindIndex = MOVEMENT_KIND_OPTIONS.indexOf(s.kind);
  const sign = s.kind === "opening balance" || s.kind === "adjustment" ? "" : "−";
  return {
    kind: s.kind,
    kindIndex: kindIndex < 0 ? 0 : kindIndex,
    kindOptions: [...MOVEMENT_KIND_OPTIONS],
    sku: s.sku,
    skuOptions: [s.sku],
    location: s.location,
    locationOptions: s.locationOptions,
    bin: s.bin,
    binOptions: s.binOptions,
    channel: s.channel,
    channelOptions: [...MOVEMENT_CHANNEL_OPTIONS],
    destState: s.destState,
    destStateOptions: s.destStateOptions,
    qty: String(s.qty),
    preview: `Preview: ${sign}${s.qty} SKU unit · ${formatVolume(s.bbl)} · ${s.kind} · ${s.destState.split(" · ")[0]} · amounts are entered positive`,
    lot: "Untracked / legacy stock",
    lotOptions: ["Untracked / legacy stock"],
    note: "",
  };
}
