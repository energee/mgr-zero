// components/mgr/views/keg-event-form.tsx — the complete Record keg event
// surface shared by the live command adapter and Keg fleet inventory fixture.
"use client";

import { useId, useState, type FormEventHandler, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { CommandForm, CommandFormFooter, CommandFormMessage } from "@/components/mgr/command-form";
import { E } from "@/components/mgr/e";
import { KEG_EVENT_REASONS, KEG_SIZES } from "@/lib/mgr/enums";
import { REASON_EFFECT, REASON_LABEL, SIZE_LABEL } from "@/lib/mgr/keg-labels";
import { kegEventFieldErrors, mayHaveKegCustomer, needsKegCustomer, withLocationBin, type KegEventOptions, type KegEventValue } from "@/lib/mgr/keg-fleet-view";
import { submitReason } from "@/lib/mgr/submit-reason";
import { useTouchedLines } from "@/lib/mgr/touched-lines";

const SIZE_OPTIONS = KEG_SIZES.map((value) => ({ value, label: SIZE_LABEL[value] }));
const REASON_OPTIONS = KEG_EVENT_REASONS.map((value) => ({ value, label: REASON_LABEL[value] }));

/** Record keg event's fields and their dependent customer/location choices. */
export function KegEventFields({ value, options, onChange, attempted = false }: {
  value: KegEventValue; options: KegEventOptions; onChange?: (next: KegEventValue) => void; attempted?: boolean;
}) {
  const set = <K extends keyof KegEventValue>(key: K) => onChange ? (next: KegEventValue[K]) => onChange({ ...value, [key]: next }) : undefined;
  const touched = useTouchedLines(!onChange);
  const qtyError = attempted || touched.shown(0) ? kegEventFieldErrors(value).qty : undefined;
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
      {E.edit("Kegs", value.qty, "number", undefined, { id: "keg-qty", min: 1, step: 1, onChange: set("qty"), onBlur: () => touched.touch(0), error: qtyError, required: true })}
      {E.edit("Note", value.note, "text", undefined, { id: "keg-note", onChange: set("note") })}
      {E.note("Empty kegs only. Beer coming back with a keg, and its credit, is Return shipment. A deposit refund is a separate credit memo.")}
    </>
  );
}

/** The shared dialog/sheet, body, error slot, and action row for every Record
 *  keg event. The error and the submit ride in CommandForm's pinned footer, so
 *  both stay on screen while the long form scrolls (#1037). */
export function KegEventPresentation({ open, onOpenChange, trigger, value, options, onChange, onSubmit, error, submitting }: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  value: KegEventValue;
  options: KegEventOptions;
  onChange?: (next: KegEventValue) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  error?: string | null;
  submitting?: boolean;
}) {
  const formId = useId();
  const [attempted, setAttempted] = useState(false);
  const errors = kegEventFieldErrors(value);
  const reason = submitReason([
    errors.poolId && "a keg pool", errors.locationId && "a location", errors.binId && "a bin",
    errors.customerId && "a customer", errors.qty && "a whole number of kegs, at least 1 (no exponent notation)",
  ].filter((need): need is string => Boolean(need)));
  return (
    <CommandForm open={open} onOpenChange={(next) => { setAttempted(false); onOpenChange?.(next); }} title="Record keg event" trigger={trigger}
      footer={<>
        <CommandFormMessage error={error} />
        <CommandFormFooter>
          {E.submit("Record keg event", { form: formId, reason, submitting, busy: "Recording…" })}
        </CommandFormFooter>
      </>}>
      <form id={formId} data-preview-action onInvalidCapture={() => setAttempted(true)} onSubmit={(event) => {
        setAttempted(true);
        if (reason) { event.preventDefault(); event.stopPropagation(); }
        else onSubmit(event);
      }} className="flex flex-col gap-4">
        <KegEventFields value={value} options={options} onChange={onChange} attempted={attempted} />
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
    value={value} options={options} onChange={(next) => setValue(withLocationBin(value, next, () => ""))} onSubmit={submit} />;
}
