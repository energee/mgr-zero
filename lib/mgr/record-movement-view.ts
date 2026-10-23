// lib/mgr/record-movement-view.ts — view-model for the shared Record movement sheet.
import { formatVolume } from "@/lib/volume";
import type { MovementFieldErrors } from "@/lib/movement-form";

export const MOVEMENT_KIND_OPTIONS = [
  "Opening balance", "Depletion", "Loss", "Sample", "Festival removal", "Destruction", "Adjustment", "Production in", "Return in",
] as const;

export const MOVEMENT_CHANNEL_OPTIONS = ["Wholesale", "Taproom", "DTC", "Export"];

export type RecordMovementViewModel = {
  kind: string;
  kindIndex: number;
  kindOptions: string[];
  sku: string;
  /** The picked option's value (the live form's SKU id); sku is its label. */
  skuId?: string;
  /** SKU names are not unique, so the live form keys options by SKU id. */
  skuOptions: { value: string; label: string }[];
  /** Where SKUs are made, for a user who may make one (create_sku). null when
   *  this user may not, so the empty SKU note names who can; the inventory
   *  leaves it out and the link stays inert. */
  skusHref?: string | null;
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
  /** The typed fields' corrections (movementFieldErrors). A live form shows
   *  each once its field is left; a fixture shows it at once. */
  errors?: MovementFieldErrors;
  /** Absent until the form is complete: the submit's reason says what is missing. */
  preview?: string;
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
  const sign = s.kind === "Opening balance" || s.kind === "Adjustment" ? "" : "−";
  return {
    kind: s.kind,
    kindIndex: kindIndex < 0 ? 0 : kindIndex,
    kindOptions: [...MOVEMENT_KIND_OPTIONS],
    sku: s.sku,
    skuOptions: [{ value: s.sku, label: s.sku }],
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
