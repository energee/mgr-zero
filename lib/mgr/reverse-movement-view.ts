// lib/mgr/reverse-movement-view.ts — view-model for Reverse movement.
// Live create stays reversal-form.tsx: E.edit is not a controlled CommandForm.
export type ReverseMovementViewModel = {
  movement: string;
  exactReversal: string;
  note: string;
};

export type ReverseMovementSnapshot = {
  qty: number;
  type: string;
  location: string;
  bin: string;
  lot: string;
  bbl: number | string;
  note: string;
};

export function toReverseMovementViewProps(s: ReverseMovementSnapshot): ReverseMovementViewModel {
  const signed = s.qty > 0 ? `+${s.qty}` : `−${Math.abs(s.qty)}`;
  const oppQty = s.qty > 0 ? `−${s.qty}` : `+${Math.abs(s.qty)}`;
  const bbl = Number(s.bbl);
  const oppBbl = bbl === 0 ? "0" : bbl > 0 ? `−${bbl}` : String(Math.abs(bbl));
  return {
    movement: `${signed} ${s.type} · ${s.location} / ${s.bin} · ${s.lot}`,
    exactReversal: `${oppQty} unit · ${oppBbl} bbl`,
    note: s.note,
  };
}
