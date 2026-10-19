// components/mgr/views/keg-event-form.tsx — the complete Record keg event
// surface shared by the live command adapter and Keg fleet inventory fixture.
"use client";

import { useState, type FormEventHandler, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { KEG_EVENT_REASONS, KEG_SIZES } from "@/lib/mgr/enums";
import { REASON_EFFECT, REASON_LABEL, SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { kegEventReady, mayHaveKegCustomer, needsKegCustomer, withLocationBin, type KegEventOptions, type KegEventValue } from "@/lib/mgr/keg-fleet-view";

const SIZE_OPTIONS = KEG_SIZES.map((value) => ({ value, label: SIZE_LABEL[value] }));
const REASON_OPTIONS = KEG_EVENT_REASONS.map((value) => ({ value, label: REASON_LABEL[value] }));

/** Record keg event's fields and their dependent customer/location choices. */
export function KegEventFields({ value, options, onChange }: {
  value: KegEventValue; options: KegEventOptions; onChange?: (next: KegEventValue) => void;
}) {
  const set = <K extends keyof KegEventValue>(key: K) => onChange ? (next: KegEventValue[K]) => onChange({ ...value, [key]: next }) : undefined;
  return (
    <>
      {E.pick("Keg pool", value.poolId, options.pools, { id: "keg-pool", onChange: set("poolId"), placeholder: "Select a pool" })}
      {E.pick("Size", value.kegSize, SIZE_OPTIONS, { id: "keg-size", onChange: set("kegSize") as ((v: string) => void) | undefined })}
      {E.pick("Reason", value.reason, REASON_OPTIONS, {
        id: "keg-reason",
        onChange: set("reason") as ((v: string) => void) | undefined,
        "aria-describedby": "keg-reason-effect",
        description: <FieldDescription id="keg-reason-effect">{REASON_EFFECT[value.reason]}</FieldDescription>,
      })}
      {E.pick(value.reason === "shipped" ? "Shipped from" : value.reason === "returned" ? "Returned to" : "Location", value.locationId, options.locations,
        { id: "keg-location", onChange: set("locationId"), placeholder: "Select a location" })}
      {E.pick("Bin", value.binId, options.bins, { id: "keg-bin", onChange: set("binId"), disabled: !value.locationId, placeholder: "Select a bin" })}
      {mayHaveKegCustomer(value.reason) && E.pick(needsKegCustomer(value.reason) ? "Customer" : "Customer (optional)", value.customerId, options.customers,
        { id: "keg-customer", onChange: set("customerId"), placeholder: "Select a customer" })}
      {E.edit("Kegs", value.qty, "number", undefined, { id: "keg-qty", min: 1, step: 1, onChange: set("qty"), required: true })}
      {E.edit("Note", value.note, "text", undefined, { id: "keg-note", onChange: set("note") })}
      {E.note("Empty kegs only. Beer coming back with a keg, and its credit, is Return shipment. A deposit refund is a separate credit memo.")}
    </>
  );
}

/** The shared dialog/sheet, body, error slot, and action row for every Record keg event. */
export function KegEventPresentation({ open, onOpenChange, trigger, value, options, onChange, onSubmit, error, submitting, ready }: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  value: KegEventValue;
  options: KegEventOptions;
  onChange?: (next: KegEventValue) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  error?: string | null;
  submitting?: boolean;
  ready?: boolean;
}) {
  return (
    <CommandForm open={open} onOpenChange={onOpenChange} title="Record keg event" trigger={trigger}>
      <form data-preview-action onSubmit={onSubmit} className="flex flex-col gap-4">
        <KegEventFields value={value} options={options} onChange={onChange} />
        <CommandFormMessage error={error} />
        <CommandFormFooter>
          <Button type="submit" disabled={submitting || !ready}>{submitting ? "Recording…" : "Record keg event"}</Button>
        </CommandFormFooter>
      </form>
    </CommandForm>
  );
}

/** Inventory-only controlled fixture. It never submits a command and closing
 *  discards local edits. Its bins carry no location, so a changed location
 *  clears the bin rather than keep one from the old location. */
export function KegEventFixtureForm({ initialValue, options }: { initialValue: KegEventValue; options: KegEventOptions }) {
  const [open, setOpen] = useState(true);
  const [value, setValue] = useState(initialValue);
  const setOpenAndReset = (next: boolean) => {
    setOpen(next);
    if (!next) setValue(initialValue);
  };
  const submit: FormEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setOpenAndReset(false);
  };
  return <KegEventPresentation open={open} onOpenChange={setOpenAndReset} trigger={<Button data-preview-action size="sm">Record keg event</Button>}
    value={value} options={options} onChange={(next) => setValue(withLocationBin(value, next, () => ""))} onSubmit={submit} ready={kegEventReady(value)} />;
}
