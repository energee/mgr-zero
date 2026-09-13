// lib/mgr/channel-view.ts — view-model for the Channel sheet (inventory).
// Live create/edit stays channel-form.tsx. Labels match screens.tsx TAX_TREATMENTS.
import { TAX_TREATMENTS, treatmentLabel } from "@/app/(app)/settings/channels/tax-treatments";

/** Display labels for the tax-treatment chips, derived from the enum so the
 *  chip order and the treatment list can never drift apart. */
export const CHANNEL_TAX_TREATMENTS = TAX_TREATMENTS.map(treatmentLabel);

export type ChannelViewModel = {
  name: string;
  taxOptions: string[];
  taxIndex: number;
};

export type ChannelSnapshot = {
  id: string;
  name: string;
  tax_treatment: string;
};

/** Map one list_sale_channels row onto ChannelView. */
export function toChannelViewProps({ name, tax_treatment }: ChannelSnapshot): ChannelViewModel {
  const label = treatmentLabel(tax_treatment);
  const taxIndex = CHANNEL_TAX_TREATMENTS.indexOf(label);
  return {
    name,
    taxOptions: CHANNEL_TAX_TREATMENTS,
    taxIndex: taxIndex < 0 ? 0 : taxIndex,
  };
}
