// components/mgr/views/channel.tsx — shared Channel sheet body: the name, the
// labelled tax treatment chips with the selected treatment's hint, and Save.
// It has no Delete; the in-use rule lives on the list (sale-channels.tsx).
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import type { ChannelViewModel } from "@/lib/mgr/channel-view";
import { TAX_TREATMENTS, type TaxTreatment } from "@/lib/mgr/tax-treatments";
import { submitReason } from "@/lib/mgr/submit-reason";

export function ChannelView({
  model,
  controls = {},
  nameError,
  submitting = false,
  messages,
  footer,
}: {
  model: ChannelViewModel;
  nameError?: string | null;
  submitting?: boolean;
  controls?: {
    name?: (value: string) => void;
    taxTreatment?: (value: TaxTreatment) => void;
  };
  messages?: ReactNode;
  footer?: ((submit: ReactNode) => ReactNode) | null;
}) {
  const nameId = useId();
  const save = E.submit("Save channel", { submitting, reason: submitReason(model.name.trim() ? [] : ["a channel name"]) });
  const onTaxTreatment = controls.taxTreatment;
  return (
    <>
      {E.edit("Channel name", model.name, "text", undefined, { id: nameId, onChange: controls.name, required: Boolean(controls.name), error: nameError ?? undefined })}
      {E.ttl("Tax treatment")}
      {E.chips(model.taxOptions, model.taxIndex, /* bright */ false, onTaxTreatment ? { onChange: index => onTaxTreatment(TAX_TREATMENTS[index]), label: "Tax treatment" } : undefined)}
      <div role="status">{E.polite(model.taxHint)}</div>
      {E.info("Customers may override this. Sales without a customer take the channel default. A change applies to new sales only; filed months stay as they were.")}
      {messages}
      {footer !== undefined ? footer?.(save) : save}
    </>
  );
}
