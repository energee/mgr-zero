// lib/mgr/movement-recorded-view.ts — the one-line receipt Record movement
// toasts after a save. The form then closes: the ledger on Finished goods
// already lists the movement, so no receipt sheet waits for Done (#1507).
import { formatVolume } from "@/lib/volume";

export type MovementReceipt = {
  sku: string;
  /** Signed SKU units, as recorded. */
  qty: number;
  kind: string;
  destState?: string;
  /** The barrels the server froze on the row. */
  bbl: number | string;
  /** "Location / Bin". */
  place: string;
  lot?: string | null;
};

/** "−1 Hazy IPA · ½ bbl · Festival removal · PA · 0.5 bbl · Taproom / Cold · lot L-7". */
export function movementReceiptLine(r: MovementReceipt): string {
  const signed = r.qty > 0 ? `+${r.qty}` : `−${Math.abs(r.qty)}`;
  return [`${signed} ${r.sku}`, r.kind, r.destState, formatVolume(r.bbl), r.place, r.lot ? `lot ${r.lot}` : undefined].filter(Boolean).join(" · ");
}
