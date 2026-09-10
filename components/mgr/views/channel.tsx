// components/mgr/views/channel.tsx — shared Channel sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ChannelViewModel } from "@/lib/mgr/channel-view";

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
    taxTreatment?: (value: string) => void;
  };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  const treatment = model.taxOptions[model.taxIndex];
  return (
    <>
      <Field>
        <FieldLabel>Channel name</FieldLabel>
        <Input aria-label="Channel name" value={controls.name ? model.name : undefined} defaultValue={controls.name ? undefined : model.name} onChange={(event) => controls.name?.(event.target.value)} required={Boolean(controls.name)} />
      </Field>
      <ToggleGroup type="single" aria-label="Tax treatment" value={controls.taxTreatment ? treatment : undefined} defaultValue={controls.taxTreatment ? undefined : treatment} onValueChange={(value) => value && controls.taxTreatment?.(value)} variant="outline" size="sm" className="flex-wrap justify-start">
        {model.taxOptions.map((option) => <ToggleGroupItem key={option} value={option}>{option}</ToggleGroupItem>)}
      </ToggleGroup>
      {E.info("Customers may override this. Sales without a customer take the channel default.")}
      {E.note("A channel with movements cannot be deleted.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save channel")}
    </>
  );
}
