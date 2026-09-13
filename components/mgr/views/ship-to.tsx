// Shared ship-to fields; adapters own state and command execution.
import type { ReactNode } from "react";
import { E } from "@/components/mgr/e";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ShipToViewModel } from "@/lib/mgr/ship-to-view";

export type { ShipToViewModel };

export function ShipToView({
  model,
  footer,
  controls = {},
  messages,
  submitting = false,
}: {
  model: ShipToViewModel;
  footer?: ReactNode;
  controls?: Partial<{ [K in Exclude<keyof ShipToViewModel, "title">]: (value: ShipToViewModel[K]) => void }>;
  messages?: ReactNode;
  submitting?: boolean;
}) {
  return (
    <>
      {E.ttl(model.title)}
      {([ ["label", "Label"], ["address", "Address"], ["address2", "Address 2 (optional)"], ["city", "City"], ["state", "State"], ["zip", "Postal code"] ] as const).map(([key, label]) => (
        <Field key={key}><FieldLabel>{label}</FieldLabel><Input aria-label={label}
          value={controls[key] ? model[key] : undefined} defaultValue={controls[key] ? undefined : model[key]}
          onChange={event => controls[key]?.(key === "state" ? event.target.value.toUpperCase() : event.target.value)}
          maxLength={key === "state" ? 2 : undefined} required={key !== "address2"} />
        </Field>
      ))}
      {E.row("Default ship-to", "selected first on new orders", <Switch aria-label="Default ship-to" checked={controls.isDefault ? model.isDefault : undefined} defaultChecked={controls.isDefault ? undefined : model.isDefault} onCheckedChange={controls.isDefault} />, model.isDefault ? "ok" : "")}
      {messages}
      {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting}>{submitting ? "Saving…" : "Save ship-to"}</Button>}
    </>
  );
}
