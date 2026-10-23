// lib/mgr/movement-recorded-view.ts — view-model for Movement recorded (the
// post-commit echo of Record movement). It carries no back link: the receipt
// is a sheet, closed by Done or the sheet's own close (#1167).
import { formatVolume } from "@/lib/volume";

export const MOVEMENT_CORRECTION_GATE =
  "is limited to standalone adjustments and losses on inventory SKU detail. Count corrections live on the latest eligible saved weekly count; shipments and other compound entries keep their own correction workflow";

export type MovementRecordedViewModel = {
  sku: string;
  tapeLabel: string;
  tapeDetail: string;
  correctionGate: string;
  details?: { label: string; value: string }[];
};

export type MovementRecordedSnapshot = {
  sku: string;
  qty: number;
  unit: string;
  kind: string;
  destState?: string;
  bbl: string;
  when?: string;
  details?: { label: string; value: string }[];
};

export function toMovementRecordedViewProps(s: MovementRecordedSnapshot): MovementRecordedViewModel {
  const signed = s.qty > 0 ? `+${s.qty}` : `−${Math.abs(s.qty)}`;
  const dest = s.destState ? ` · ${s.destState}` : "";
  return {
    sku: s.sku,
    tapeLabel: `${signed} ${s.unit} · ${s.kind}${dest}`,
    tapeDetail: `${formatVolume(s.bbl)} · ${s.when ?? "just now"}`,
    correctionGate: MOVEMENT_CORRECTION_GATE,
    details: s.details,
  };
}
