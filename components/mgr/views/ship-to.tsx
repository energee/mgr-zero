// Shared ship-to fields; adapters own state and command execution. A ship-to
// needs its label, and a US one its state (the TTB destination); street, city
// and postal code are optional until known. Another country has no state.
import { E } from "@/components/mgr/e";
import { COUNTRY_OPTIONS } from "@/lib/mgr/labels";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import type { ShipToViewModel } from "@/lib/mgr/ship-to-view";
import type { ReactNode } from "react";
import { Fragment, useId } from "react";

export type { ShipToViewModel };

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
  controls?: Partial<{ [K in Exclude<keyof ShipToViewModel, "title">]: (value: ShipToViewModel[K]) => void }>;
  messages?: ReactNode;
  submitting?: boolean;
  errors?: Partial<Record<"label" | "country" | "address" | "address2" | "city" | "state" | "zip", string>>;
}) {
  const id = useId();
  const us = model.country === "US";
  const fields = ([ ["label", "Label"], ["address", "Address"], ["address2", "Address 2 (optional)"], ["city", "City"], ["state", "State"], ["zip", "Postal code"] ] as const)
    .filter(([key]) => us || key !== "state");
  return (
    <>
      {E.ttl(model.title)}
      {E.pick("Country", model.country, COUNTRY_OPTIONS, { id: `${id}-country`, onChange: controls.country, required: true, error: errors.country })}
      {fields.map(([key, label]) => (
        <Fragment key={key}>{E.edit(label, model[key], "text", undefined, { id: `${id}-${key}`, error: errors[key], onChange: controls[key] ? (nextValue: string) => controls[key]?.(key === "state" ? nextValue.toUpperCase() : nextValue) : undefined, required: key === "label" || (us && key === "state"), maxLength: key === "state" ? 2 : undefined, placeholder: key === "state" ? "PA" : key === "zip" && us ? "15201 or 15201-1234" : undefined, "aria-label": label })}</Fragment>
      ))}
      {E.row("Default ship-to", "selected first on new orders", <Switch aria-label="Default ship-to" checked={controls.isDefault ? model.isDefault : undefined} defaultChecked={controls.isDefault ? undefined : model.isDefault} onCheckedChange={controls.isDefault} />, model.isDefault ? "ok" : "")}
      {messages}
      {footer !== undefined ? footer : <Button type="submit" className="w-full md:w-fit md:self-end" disabled={submitting}>{submitting ? "Saving…" : "Save ship-to"}</Button>}
    </>
  );
}
