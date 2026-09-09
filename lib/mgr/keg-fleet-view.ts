// lib/mgr/keg-fleet-view.ts — view-model for Keg fleet (inventory drawing).
export type KegFleetBinRow = { key: string; title: string; detail: string; qty: string };

export type KegFleetViewModel = {
  backHref?: string;
  pool?: string;
  kind?: string;
  kindOptions?: string[];
  vendor?: string;
  perFill?: string;
  bins?: KegFleetBinRow[];
  customerBalance?: string;
  report?: string;
  history?: string;
  eventKindIndex?: number;
  eventKinds?: string[];
  customer?: string;
  customerOptions?: string[];
  qty?: number;
  previewName?: string;
  previewFrom?: string;
  previewTo?: string;
};

export function toKegFleetViewProps(s: KegFleetViewModel): KegFleetViewModel {
  return s;
}
