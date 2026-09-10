// components/mgr/qty.tsx — a typed quantity and the segmented bar that rides in
// its unit addon. Both are shared by `E.qty`/`E.tabs` (components/mgr/e.tsx) and
// by VolumeField (components/mgr/volume-field.tsx), which draws the same field
// with a generated id.
//
// It is its own module only to break an import cycle: e.tsx imports VolumeField
// for `E.volume`, so VolumeField cannot import `E` back, and the composition
// cannot simply live in e.tsx either — SCREENS is a module-level const, built at
// import time, where VolumeField's React.useId() could never run. Screen authors
// never import this directly; they use E.qty, E.tabs and E.volume.
import type { ReactNode } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** A typed quantity: the OS keyboard is the keypad, so nothing here draws one.
 *  Defaults live in `E.qty`/`E.tabs`, the vocabulary screen authors call; every
 *  caller here passes label, on and cls, so repeating those defaults would only
 *  give them a second place to drift. */
export function Qty({
  value,
  onChange,
  unit,
  label,
  id,
}: {
  value: string;
  onChange?: (value: string) => void;
  unit?: ReactNode;
  label: string;
  id?: string;
}) {
  return (
    // overflow-hidden: a unit addon (chips, or a TabBar) is a flex item with a
    // content-based min-width, so on a narrow field it won't shrink — clip to
    // the field's own border instead of letting it spill past. A clip, not a
    // scroll: a unit set that outgrows the field puts an option out of reach.
    <InputGroup className="overflow-hidden">
      <InputGroupInput
        id={id}
        type="number"
        inputMode="decimal"
        step="any"
        value={onChange ? value : undefined}
        defaultValue={onChange ? undefined : value}
        onChange={(event) => onChange?.(event.target.value)}
        aria-label={label}
        className="text-2xl font-semibold"
      />
      {/* pr-0 for a unit switcher: a TabsList insets itself (p-[3px]), so the
          addon's default inline-end pr-2 would only double up as dead space past
          the last unit. A plain-text unit ("bbl", "SG · prior 1.021") has no
          inset of its own and keeps the padding. */}
      {unit ? <InputGroupAddon align="inline-end" className="has-[>[data-slot=tabs]]:pr-0">{unit}</InputGroupAddon> : null}
    </InputGroup>
  );
}

/** A segmented bar: a view switcher, a row filter, or the unit a quantity is
 *  entered in. Uncontrolled, like chips — a controlled value with no
 *  onValueChange makes every trigger inert, and these bars are meant to be
 *  clickable in the inventory. `to` names the screen a tab opens (data-to)
 *  where each tab is a screen of its own, like the Work chips.
 *
 *  A11y: the body below is the active panel, so there are no TabsContent panels
 *  and Radix's aria-controls points at nothing. As a unit switcher it also
 *  announces "tab 1 of 3" with no group name, since the input's only name is its
 *  aria-label. Tolerable in a drawing; the real app's unit choice wants a
 *  radiogroup, not a tablist. */
export function TabBar({
  names,
  on,
  cls,
  to,
  onChange,
}: {
  names: string[];
  on: number;
  cls: string;
  to?: Record<string, string>;
  onChange?: (value: string) => void;
}) {
  return (
    <Tabs value={onChange ? names[on] : undefined} defaultValue={onChange ? undefined : names[on]} onValueChange={onChange} className="min-w-0">
      <TabsList variant="solid" className={cls}>
        {names.map((n) => <TabsTrigger key={n} value={n} data-to={to?.[n]}>{n}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  );
}
