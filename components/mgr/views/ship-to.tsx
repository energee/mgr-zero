// Shared ship-to fields; adapters own state and command execution. A ship-to
// needs its label, and a US one its state (the TTB destination); street, city
// and postal code are optional until known. Another country has no state.
// Save is withheld until shipToReason passes; a duplicate label or bad ZIP is
// also marked on its field.
import { E } from "@/components/mgr/e";
import { UsStateField } from "@/components/mgr/us-state-field";
import { COUNTRY_OPTIONS } from "@/lib/mgr/labels";
import { Switch } from "@/components/ui/switch";
import { shipToReason, shipToZipError, type ShipToViewModel } from "@/lib/mgr/ship-to-view";
import type { ReactNode } from "react";
import { Fragment, useId } from "react";

export function ShipToView({
  model,
  footer,
  controls = {},
  messages,
  submitting = false,
  errors = {},
}: {
  model: ShipToViewModel;
  footer?: ReactNode;
  controls?: Partial<{ [K in keyof ShipToViewModel]: (value: ShipToViewModel[K]) => void }>;
  messages?: ReactNode;
  submitting?: boolean;
  errors?: Partial<Record<"label" | "country" | "address" | "address2" | "city" | "state" | "zip", string>>;
}) {
  const id = useId();
  const us = model.country === "US";
  const fields = [["label", "Label"], ["address", "Address"], ["address2", "Address 2 (optional)"], ["city", "City"], ["state", "State"], ["zip", "Postal code"]] as const;
  const inline: Partial<Record<string, string>> = { label: model.labelError, zip: shipToZipError(model) };
  return (
    <>
      {E.pick("Country", model.country, COUNTRY_OPTIONS, { id: `${id}-country`, onChange: controls.country, required: true, error: errors.country })}
      {fields.map(([key, label]) => key === "state"
        ? us && <UsStateField key={key} value={model.state} controls={{ id: `${id}-state`, onChange: controls.state, required: true, error: errors.state, "aria-label": label }} />
        : <Fragment key={key}>{E.edit(label, model[key], "text", undefined, { id: `${id}-${key}`, error: errors[key] ?? inline[key], onChange: controls[key], required: key === "label", placeholder: key === "zip" && us ? "15201 or 15201-1234" : undefined, "aria-label": label })}</Fragment>,
      )}
      {E.row("Default ship-to", "This ship-to is selected first on new orders.", <Switch aria-label="Default ship-to" checked={controls.isDefault ? model.isDefault : undefined} defaultChecked={controls.isDefault ? undefined : model.isDefault} onCheckedChange={controls.isDefault} />, model.isDefault ? "ok" : "")}
      {messages}
      {footer !== undefined ? footer : E.submit("Save ship-to", { submitting, reason: shipToReason(model), className: "w-full md:w-fit md:self-end" })}
    </>
  );
}
