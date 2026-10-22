// lib/mgr/bin-view.ts — view-model for the Bin sheet (list_bins row).

export type BinViewModel = {
  name: string;
  /** Where the tap note's Tap board link goes; fixtures leave it out. */
  tapBoardHref?: string;
};

export type BinSnapshot = {
  id?: string;
  name: string;
  tapBoardHref?: string;
};

export function toBinViewProps({ name, tapBoardHref }: BinSnapshot): BinViewModel {
  return { name, tapBoardHref };
}
