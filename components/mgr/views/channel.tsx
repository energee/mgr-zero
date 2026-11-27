// components/mgr/views/channel.tsx — shared Channel sheet body: the name, the
// labelled tax treatment chips with the selected treatment's hint, the one-way
// keg fee, whether its orders ship on pallets, and Save.
// It has no Delete; the in-use rule lives on the list (sale-channels.tsx).
import { useId, type ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { FieldDescription } from "@/components/ui/field";
import { oneWayKegFeeError, type ChannelViewModel } from "@/lib/mgr/channel-view";
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
    oneWayKegFee?: (value: string) => void;
    pallets?: (value: boolean) => void;
  };
  messages?: ReactNode;
  footer?: ((submit: ReactNode) => ReactNode) | null;
}) {
  const nameId = useId();
  const feeId = useId();
  const feeError = oneWayKegFeeError(model.oneWayKegFee);
  const save = E.submit("Save channel", { submitting, reason: feeError ?? submitReason(model.name.trim() ? [] : ["a channel name"]) });
  const onTaxTreatment = controls.taxTreatment;
  const onPallets = controls.pallets;
  return (
    <>
      {E.edit("Channel name", model.name, "text", undefined, { id: nameId, onChange: controls.name, required: Boolean(controls.name), error: nameError ?? undefined })}
      {E.ttl("Tax treatment")}
      {E.chips(model.taxOptions, model.taxIndex, onTaxTreatment ? { onChange: index => onTaxTreatment(TAX_TREATMENTS[index]), label: "Tax treatment" } : undefined)}
      <div role="status">{E.polite(model.taxHint)}</div>
      {E.info("Customers may override this. Sales without a customer take the channel default. A change applies to new sales only; filed months stay as they were.")}
      <div className="flex min-w-0 flex-col gap-2">
        {E.edit("One-way keg fee ($)", model.oneWayKegFee, "number", undefined, { contextualLabels: true, onChange: controls.oneWayKegFee, id: feeId, min: 0, max: 21474836.47, step: 0.01, error: feeError, "aria-describedby": `${feeId}-help` })}
        <FieldDescription id={`${feeId}-help`}>Charged for each one-way keg on this channel&apos;s wholesale orders. Blank or 0 means no fee. A change applies to drafts and to lines added later.</FieldDescription>
      </div>
      {E.ttl("Ships on pallets")}
      {E.chips(["Yes", "No"], model.pallets ? 0 : 1, onPallets ? { onChange: index => onPallets(index === 0), label: "Ships on pallets" } : undefined)}
      {E.info("No turns off the pallet fit, the pallet line and Fill the pallet for this channel's portal buyers.")}
      {messages}
      {footer !== undefined ? footer?.(save) : save}
    </>
  );
}
