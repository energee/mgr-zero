// components/mgr/qty.tsx — a typed quantity and the segmented bar that rides in
// its unit addon. Both are shared by `E.qty`/`E.tabs` (components/mgr/e.tsx) and
// by VolumeField (components/mgr/volume-field.tsx). The quantity draws its own
// visible label, tied to the input by a generated id (#1115).
//
// It is its own module only to break an import cycle: e.tsx imports VolumeField
// for `E.volume`, so VolumeField cannot import `E` back, and the composition
// cannot simply live in e.tsx either — SCREENS is a module-level const, built at
// import time, where Qty's useId() could never run. Screen authors
// never import this directly; they use E.qty, E.tabs and E.volume.
"use client";
import type { FieldControls } from "@/components/mgr/e";
import { numberNotationError, stepQuantity } from "@/lib/mgr/quantity-input";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type AriaAttributes, type ReactNode, type RefObject } from "react";

/** Keep the lexical error on the input as well as on screen, including uncontrolled fixtures. */
function useNumberNotation(input: RefObject<HTMLInputElement | null>, value: string | undefined, initialValue = "") {
  const [typed, setTyped] = useState(initialValue);
  const error = numberNotationError(value ?? typed);
  const errorId = useId();
  useEffect(() => { input.current?.setCustomValidity(error ?? ""); }, [error, input]);
  function changed(next: string) {
    input.current?.setCustomValidity(numberNotationError(next) ?? "");
    if (value === undefined) setTyped(next);
  }
  return { error, errorId, changed };
}

/** The same stepper for controlled forms and uncontrolled inventory fields. */
export function StepQuantity({ label, value, defaultValue, onChange, contextualLabels, ...attributes }: Omit<FieldControls, "hideLabel" | "error"> & { label: string; value?: string; defaultValue?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const notation = useNumberNotation(input, onChange ? value : undefined, value ?? defaultValue);
  const notationError = attributes["aria-invalid"] ? undefined : notation.error;
  const step = (direction: -1 | 1) => {
    const field = input.current;
    if (!field || field.matches(":disabled") || field.readOnly || notation.error) return;
    const next = stepQuantity(field.value, direction, attributes.min === undefined ? undefined : Number(attributes.min), attributes.max === undefined ? undefined : Number(attributes.max));
    if (onChange) onChange(next);
    else field.value = next;
  };
  return <div className="flex flex-col gap-2"><ButtonGroup>
    <Button type="button" variant="outline" size="icon" aria-label={contextualLabels ? `Decrease ${label}` : "Decrease"} disabled={Boolean(notation.error) || attributes.disabled || attributes.readOnly || Boolean(onChange && attributes.min !== undefined && Number(value) <= Number(attributes.min))} onClick={() => step(-1)}>−</Button>
    {/* Grows with its digits (field-sizing) so a long quantity is not cut off (#493). */}
    {/* eslint-disable-next-line no-restricted-syntax -- Shared E numeric primitive; native spinners are hidden. */}
    <Input ref={input} type="number" inputMode="decimal" step="any" aria-label={label} {...attributes}
      aria-invalid={Boolean(notation.error) || attributes["aria-invalid"]}
      aria-describedby={[attributes["aria-describedby"], notationError ? notation.errorId : undefined].filter(Boolean).join(" ") || undefined}
      value={onChange ? value : undefined} defaultValue={onChange ? undefined : value ?? defaultValue}
      onChange={event => { notation.changed(event.target.value); onChange?.(event.target.value); }}
      className="w-auto min-w-14 field-sizing-content [appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
    <Button type="button" variant="outline" size="icon" aria-label={contextualLabels ? `Increase ${label}` : "Increase"} disabled={Boolean(notation.error) || attributes.disabled || attributes.readOnly || Boolean(onChange && attributes.max !== undefined && Number(value) >= Number(attributes.max))} onClick={() => step(1)}>+</Button>
  </ButtonGroup>{notationError && <FieldError id={notation.errorId}>{notationError}</FieldError>}</div>;
}

/** A typed quantity under its visible label: the OS keyboard is the keypad, so
 *  nothing here draws one. The label's generated id ties it to the input, so
 *  the visible text is the input's accessible name (#1115). No caller sits
 *  under a column header, so the label is always shown; add a hideLabel if
 *  one ever does. Defaults live in `E.qty`/`E.tabs`, the vocabulary screen
 *  authors call; every caller here passes label, on and cls, so repeating
 *  those defaults would only give them a second place to drift. */
export function Qty({
  value,
  onChange,
  unit,
  label,
  id,
  invalid,
  describedBy,
}: {
  value: string;
  onChange?: (value: string) => void;
  unit?: ReactNode;
  label: string;
  id?: string;
  /** From E.qty's `error` (#1121). */
  invalid?: AriaAttributes["aria-invalid"];
  describedBy?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const notation = useNumberNotation(input, onChange ? value : undefined, value);
  const notationError = invalid ? undefined : notation.error;
  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      {/* overflow-hidden: a unit addon (chips, or a TabBar) is a flex item with a
          content-based min-width, so on a narrow field it won't shrink — clip to
          the field's own border instead of letting it spill past. A clip, not a
          scroll: a unit set that outgrows the field puts an option out of reach. */}
      <InputGroup className="overflow-hidden">
        {/* eslint-disable-next-line no-restricted-syntax -- Shared E volume primitive; native spinners are hidden. */}
        <InputGroupInput
          id={inputId}
          ref={input}
          type="number"
          inputMode="decimal"
          step="any"
          value={onChange ? value : undefined}
          defaultValue={onChange ? undefined : value}
          onChange={(event) => { notation.changed(event.target.value); onChange?.(event.target.value); }}
          aria-invalid={Boolean(notation.error) || invalid}
          aria-describedby={[describedBy, notationError ? notation.errorId : undefined].filter(Boolean).join(" ") || undefined}
          className="text-2xl font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {/* pr-0 for a unit switcher: a TabsList insets itself (p-[3px]), so the
            addon's default inline-end pr-2 would only double up as dead space past
            the last unit. A plain-text unit ("bbl", "SG · prior 1.021") has no
            inset of its own and keeps the padding. */}
        {unit ? <InputGroupAddon align="inline-end" className="has-[>[data-slot=tabs]]:pr-0">{unit}</InputGroupAddon> : null}
      </InputGroup>
      {notationError && <FieldError id={notation.errorId}>{notationError}</FieldError>}
    </Field>
  );
}

/** A segmented bar: a view switcher, a row filter, or the unit a quantity is
 *  entered in. Uncontrolled, like chips — a controlled value with no
 *  onValueChange makes every trigger inert, and these bars are meant to be
 *  clickable in the inventory. `to` names the screen a tab opens (data-to)
 *  where each tab is a screen of its own, like the Work chips. `labels` is the
 *  text a tab shows when it differs from its name; the name stays the identity
 *  that `to`, `hrefs` and onChange use (the Work chips, #1104).
 *
 *  Each tab's Radix value is its index, not its name: Radix builds the tab and
 *  panel ids from the value, and a name with a space ("Packaging runs") would
 *  split aria-controls into two ids that resolve to nothing. onChange still
 *  receives the name.
 *
 *  A11y: a filter that changes rows in place (Work) passes `panel`, the
 *  selected tab's content, with `label`, the tablist's name, and `onChange`,
 *  because the caller re-renders `panel` for the newly chosen tab. Every tab
 *  then gets a TabsContent: Radix mounts each tabpanel (empty and `hidden`
 *  unless selected), so every aria-controls resolves (#727). The panel is a
 *  gap-3 column like the page body it replaces (the bar grows to fill it,
 *  so an empty state can centre), and it is not a Tab stop
 *  (tabIndex -1) because its rows hold their own focusable actions.
 *  Without `panel` the body below is drawn outside the bar and aria-controls
 *  points at nothing: tolerable for a drawing or a bar of links. As a unit
 *  switcher it also announces "tab 1 of 3" with no group name, since the input's
 *  only name is its label; the real app's unit choice wants a radiogroup. */
export function TabBar({
  names,
  on,
  cls,
  to,
  onChange,
  hrefs,
  labels,
  label,
  panel,
}: {
  names: string[];
  on: number;
  cls: string;
  to?: Record<string, string>;
  onChange?: (value: string) => void;
  hrefs?: Record<string, string>;
  labels?: Record<string, string>;
} & ({ label?: never; panel?: never } | { label: string; panel: ReactNode; onChange: (value: string) => void })) {
  const value = String(on);
  return (
    <Tabs value={hrefs || onChange ? value : undefined} defaultValue={hrefs || onChange ? undefined : value} onValueChange={onChange && ((v) => onChange(names[Number(v)]))} className={panel === undefined ? "min-w-0" : "min-w-0 flex-1 gap-3"}>
      <TabsList className={cn("rounded-xl border border-foreground/40 p-0", cls)} aria-label={label}>
        {names.map((n, i) => {
          const text = labels?.[n] ?? n;
          return <TabsTrigger key={n} value={String(i)} data-to={to?.[n]} className="h-full rounded-none px-3 first:rounded-l-[calc(var(--radius-xl)-1px)] last:rounded-r-[calc(var(--radius-xl)-1px)] data-active:shadow-none data-active:ring-1 data-active:ring-inset data-active:ring-foreground/40" asChild={Boolean(hrefs?.[n])}>{hrefs?.[n] ? <Link href={hrefs[n]}>{text}</Link> : text}</TabsTrigger>;
        })}
      </TabsList>
      {panel === undefined ? null : names.map((n, i) => <TabsContent key={n} value={String(i)} tabIndex={-1} className="flex flex-col gap-3">{panel}</TabsContent>)}
    </Tabs>
  );
}
