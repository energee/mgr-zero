// lib/mgr/keg-fleet-view.ts — view-model for Keg fleet (inventory drawing).
import type { EmptyState } from "./empty-state";
export type KegFleetBinRow = { key: string; title: string; detail: string; qty: string };
export type KegFleetPoolRow = { key: string; title: string; detail: string; bins: KegFleetBinRow[] };
export type KegFleetNavRow = { key: string; href: string; title: string; detail: string };

export type KegFleetViewModel = {
  backHref?: string;
  pool?: string;
  kind?: string;
  kindOptions?: string[];
  vendor?: string;
  perFill?: string;
  bins?: KegFleetBinRow[];
  pools?: KegFleetPoolRow[];
  empty?: EmptyState;
  navRows?: KegFleetNavRow[];
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

const NO_POOLS: EmptyState = { title: "No keg pools yet", description: "A pool groups the kegs of one size and owner." };

/** Identity but for the blank: the pools list is the only thing this screen
 *  can be empty of, and the words for that belong here, not in the page. */
export function toKegFleetViewProps(s: KegFleetViewModel): KegFleetViewModel {
  if (!s.pools || s.pools.length) return s;
  return { ...s, empty: s.empty ?? NO_POOLS };
}
