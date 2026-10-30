"use client";

import { useComboboxSearch, Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldLabel } from "@/components/ui/field";
import { timezoneLabel } from "@/lib/mgr/labels";

const TIMEZONES = Intl.supportedValuesOf("timeZone");

/** Shared searchable IANA timezone control; retain valid saved aliases such as UTC. */
export function TimezonePicker({ id, label, value, onChange, disabled = false }: {
  id: string; label: string; value: string; onChange: (timezone: string) => void; disabled?: boolean;
}) {
  const { anchor, props: search } = useComboboxSearch(timezoneLabel(value));
  return <Field data-required className="min-w-0 gap-2">
    <FieldLabel htmlFor={id}>{label}</FieldLabel>
    <Combobox
      items={TIMEZONES.includes(value) ? TIMEZONES : [value, ...TIMEZONES]}
      value={value}
      itemToStringLabel={timezoneLabel}
      itemToStringValue={(timezone) => timezone}
      onValueChange={(timezone) => timezone && onChange(timezone)}
      disabled={disabled}
      {...search}
    >
      <div ref={anchor}>
        <ComboboxInput id={id} placeholder="Search timezones…" required disabled={disabled} />
      </div>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>No timezone found.</ComboboxEmpty>
        <ComboboxList>{(timezone: string) => <ComboboxItem key={timezone} value={timezone}>{timezoneLabel(timezone)}</ComboboxItem>}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  </Field>;
}
