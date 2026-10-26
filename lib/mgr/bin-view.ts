// lib/mgr/bin-view.ts — view-model for the Bin sheet (list_bins row).

export type BinViewModel = {
  name: string;
  nameError?: string;
  /** Where the tap note's Tap board link goes; fixtures leave it out. */
  tapBoardHref?: string;
};

export type BinSnapshot = {
  name: string;
  bins?: readonly { id: string; name: string }[];
  binId?: string;
  tapBoardHref?: string;
};

export function toBinViewProps({ name, bins = [], binId, tapBoardHref }: BinSnapshot): BinViewModel {
  const ownBin = bins.find((bin) => bin.id === binId);
  if (ownBin?.name === name) return { name, tapBoardHref };
  const normalizedName = name.trim().toLowerCase();
  const duplicate = bins.find((bin) => bin.id !== binId && bin.name.trim().toLowerCase() === normalizedName);
  return { name, tapBoardHref, nameError: duplicate ? `A bin named ${duplicate.name.trim()} already exists here` : undefined };
}
