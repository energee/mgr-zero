// components/mgr/views/channel.tsx — shared Channel sheet body: the name, the
// labelled tax treatment chips with the selected treatment's hint, and Save.
// It has no Delete; the in-use rule lives on the list (sale-channels.tsx).
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ChannelViewModel } from "@/lib/mgr/channel-view";
import { TAX_TREATMENTS, type TaxTreatment } from "@/lib/mgr/tax-treatments";

export type { ChannelViewModel };

export function ChannelView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: ChannelViewModel;
  controls?: {
    name?: (value: string) => void;
    taxTreatment?: (value: TaxTreatment) => void;
  };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const onTaxTreatment = controls.taxTreatment;
  return (
    <>
      {E.edit("Channel name", model.name, "text", undefined, { onChange: controls.name, required: Boolean(controls.name) })}
      {E.ttl("Tax treatment")}
      {E.chips(model.taxOptions, model.taxIndex, false, onTaxTreatment ? { onChange: index => onTaxTreatment(TAX_TREATMENTS[index]), label: "Tax treatment" } : undefined)}
      {E.polite(model.taxHint)}
      {E.info("Customers may override this. Sales without a customer take the channel default.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save channel")}
    </>
  );
}
