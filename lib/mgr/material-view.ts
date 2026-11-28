// lib/mgr/material-view.ts — view-model for Material (inventory sheet), and the fields a kind fills on Add material.
export type MaterialViewModel = {
  name: string;
  kind: string;
  kindOptions: readonly string[];
  /** A kind suggested from the name ("hop"), shown on the Kind pick while `kind` is empty; Tab accepts it.
   * Never saved unless accepted (docs/plans/jev-suggestions.md). */
  kindSuggestion?: string;
  /** Base units in one purchase unit, the "Base units per purchase unit"
   * field: "44" for a 44 lb hop box. Not the base unit itself; that is `unit`. */
  baseUnits: string;
  purchaseUnit: string;
  purchaseUnitOptions: string[];
  /** The word one purchase unit is sold by, the "Sold by" pick: "bag", one of PACK_NAMES. Empty means none picked.
   * A recipe line of whole packs reads in it ("23 bags"). */
  soldBy: string;
  /** The material already has a saved word. The database keeps a saved word when none is sent, so it can be changed
   * but not cleared, and the pick stops offering None. */
  soldBySaved?: boolean;
  /** The base unit recipes and counts use, the "Base unit" field: "lb". */
  unit: string;
  unitOptions: string[];
  defaultVendorId?: string;
  defaultVendorOptions: { id: string; label: string }[];
  /** SG-style (1.037 = 37 PPG); asked on malt and adjunct only, where recipe
   * predictions read it (lib/recipe-gravity.ts). Empty means none typed. */
  extractPotential?: string;
  /** Percent, as on the bag; asked on hops only, where recipe IBU reads it
   * (lib/recipe-ibu.ts). Empty means none typed. */
  alphaAcid?: string;
  /** Dollars for one purchase unit, the "Price per purchase unit" field: "82.00" for a bag. Empty means none typed.
   * A recipe costs the material at it only until a purchase order receipt gives a cost. */
  price?: string;
  /** Why the typed price cannot be saved, drawn under the field. */
  priceError?: string;
  lotTracked: boolean;
  active: boolean;
};

/** The Add material fields a kind fills: Base unit, Purchase unit, Lot-tracked. */
export type KindFields = { unit: string; purchaseUnit: string; lotTracked: boolean };

/** What each kind fills on Add material. Adjunct, chemical and other fill nothing: their units vary too much. */
const KIND_DEFAULTS: Record<string, KindFields> = {
  malt: { unit: "lb", purchaseUnit: "lb", lotTracked: true },
  hop: { unit: "lb", purchaseUnit: "lb", lotTracked: true },
  yeast: { unit: "each", purchaseUnit: "each", lotTracked: true },
  packaging: { unit: "each", purchaseUnit: "each", lotTracked: false },
};

/** The fields after the kind changes from `from` to `to` on Add material. A field takes the new kind's value only
 *  while it still holds what the form gave it (`initial`, or what `from` filled), so a field the user changed stays. */
export function fieldsForKind(fields: KindFields, from: string, to: string, initial: KindFields): KindFields {
  const next = KIND_DEFAULTS[to];
  if (!next) return fields;
  const given = { ...initial, ...KIND_DEFAULTS[from] };
  return {
    unit: fields.unit === given.unit ? next.unit : fields.unit,
    purchaseUnit: fields.purchaseUnit === given.purchaseUnit ? next.purchaseUnit : fields.purchaseUnit,
    lotTracked: fields.lotTracked === given.lotTracked ? next.lotTracked : fields.lotTracked,
  };
}
