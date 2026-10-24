// lib/mgr/channel-view.ts — view-model for the Channel sheet, shared by the
// inventory frame and the live ChannelForm. Chip labels derive from
// TAX_TREATMENTS; taxHint holds the selected treatment's settled hint copy.
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
};

export type ChannelSnapshot = {
  id: string;
  name: string;
  tax_treatment: string;
};

/** Map one list_sale_channels row onto ChannelView. */
export function toChannelViewProps({ name, tax_treatment }: ChannelSnapshot): ChannelViewModel {
  const label = sentenceCase(tax_treatment);
  const taxIndex = CHANNEL_TAX_TREATMENTS.indexOf(label);
  return {
    name,
    taxOptions: [...CHANNEL_TAX_TREATMENTS],
    taxIndex: taxIndex < 0 ? 0 : taxIndex,
    taxHint: TAX_TREATMENT_HINTS[tax_treatment as TaxTreatment],
  };
}
