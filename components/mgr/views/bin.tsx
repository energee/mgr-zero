// components/mgr/views/bin.tsx — shared Bin sheet body.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { BinViewModel } from "@/lib/mgr/bin-view";

export type { BinViewModel };

export function BinView({
  model,
  controls = {},
  messages,
  footer,
}: {
  model: BinViewModel;
  controls?: { name?: (value: string) => void };
  messages?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <Field>
        <FieldLabel>Bin name</FieldLabel>
        <Input
          aria-label="Bin name"
          value={controls.name ? model.name : undefined}
          defaultValue={controls.name ? undefined : model.name}
          onChange={(event) => controls.name?.(event.target.value)}
          required={Boolean(controls.name)}
        />
      </Field>
      {E.info("A location keeps at least one bin. Rename the last one rather than removing it.")}
      {E.note("Tap lines are not bins. The tap board owns those.")}
      {messages}
      {footer !== undefined ? footer : E.btn("Save bin")}
    </>
  );
}
