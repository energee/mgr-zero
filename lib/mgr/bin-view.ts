// lib/mgr/bin-view.ts — view-model for the Bin sheet (list_bins row).

export type BinViewModel = {
  name: string;
};

export type BinSnapshot = {
  id?: string;
  name: string;
};

export function toBinViewProps({ name }: BinSnapshot): BinViewModel {
  return { name };
}
