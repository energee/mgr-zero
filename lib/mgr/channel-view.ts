// lib/mgr/channel-view.ts — view-model for the Channel sheet (inventory).
// Live create/edit stays channel-form.tsx. Labels match screens.tsx TAX_TREATMENTS.
import { channelTreatmentLabel } from "./sale-channels-view";

/** Display labels for the tax-treatment chips (spaces, not snake_case). */
export const CHANNEL_TAX_TREATMENTS = [
  "taxable",
  "export",
  "vessel supplies",
  "research",
  "transfer in bond",
] as const;

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
  const label = channelTreatmentLabel(tax_treatment);
  const taxIndex = (CHANNEL_TAX_TREATMENTS as readonly string[]).indexOf(label);
  return {
    name,
    taxOptions: [...CHANNEL_TAX_TREATMENTS],
    taxIndex: taxIndex < 0 ? 0 : taxIndex,
  };
}
