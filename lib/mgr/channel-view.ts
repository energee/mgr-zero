// lib/mgr/channel-view.ts — view-model for the Channel sheet, shared by the
// inventory frame and the live ChannelForm. Chip labels derive from
// TAX_TREATMENTS; taxHint holds the selected treatment's settled hint copy;
// oneWayKegFee is the channel's one-way keg fee in dollars.
import { centsMaxError, dollarsInput } from "./money";
import { sentenceCase } from "./labels";
import { TAX_TREATMENTS, type TaxTreatment } from "./tax-treatments";

/** Display labels for the tax-treatment chips, derived from the enum so the
 *  chip order and the treatment list can never drift apart. */
export const CHANNEL_TAX_TREATMENTS = TAX_TREATMENTS.map(sentenceCase);

/** What a treatment means, shown under the chips while it is selected.
 *  The four tax-free removals keep their approved TTB meaning (#1149, #1207). */
const TAX_TREATMENT_HINTS: Record<TaxTreatment, string> = {
  taxable: "Beer removed with federal excise tax due.",
  export: "Sold for shipment outside the US, not taxed.",
  vessel_supplies: "Supplies for ships or aircraft in foreign trade, not taxed.",
  research: "Used for lab analysis, research or testing, not taxed.",
  transfer_in_bond: "Sent to another brewery in bond; that brewery pays the tax.",
};

export type ChannelViewModel = {
  name: string;
  taxOptions: string[];
  taxIndex: number;
  taxHint?: string;
  /** The one-way keg fee in dollars ("10.00"); blank or 0 bills none. */
  oneWayKegFee: string;
  /** Whether the channel's orders ship on pallets; false turns pallet advice off for its portal buyers. */
  pallets: boolean;
};

export type ChannelSnapshot = {
  id: string;
  name: string;
  tax_treatment: string;
  one_way_keg_fee_cents: number;
  /** Absent reads as true. */
  pallets?: boolean;
};

/** Map one list_sale_channels row onto ChannelView. */
export function toChannelViewProps({ name, tax_treatment, one_way_keg_fee_cents, pallets = true }: ChannelSnapshot): ChannelViewModel {
  const label = sentenceCase(tax_treatment);
  const taxIndex = CHANNEL_TAX_TREATMENTS.indexOf(label);
  return {
    name,
    taxOptions: [...CHANNEL_TAX_TREATMENTS],
    taxIndex: taxIndex < 0 ? 0 : taxIndex,
    taxHint: TAX_TREATMENT_HINTS[tax_treatment as TaxTreatment],
    oneWayKegFee: dollarsInput(one_way_keg_fee_cents),
    pallets,
  };
}

/** Match the fee's nonnegative integer-cent storage without rounding typed fractions. */
export function oneWayKegFeeError(value: string): string | undefined {
  if (value === "") return undefined;
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)
    || (value.split(".")[1]?.replace(/0+$/, "").length ?? 0) > 2) {
    return "Enter zero or a positive dollar amount with at most two decimal places.";
  }
  return centsMaxError(value, "a fee");
}

