"use client";

import { useComboboxSearch, Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";
import { timezoneLabel } from "@/lib/mgr/labels";

const TIMEZONES = Intl.supportedValuesOf("timeZone");

/** Shared searchable IANA timezone control; retain valid saved aliases such as UTC. */
export function TimezonePicker({ id, label, value, onChange, disabled = false }: {
  id: string; label: string; value: string; onChange: (timezone: string) => void; disabled?: boolean;
}) {
  const { anchor, props: search } = useComboboxSearch(timezoneLabel(value));
  return <div className="flex min-w-0 flex-col gap-2">
    <Label htmlFor={id}>{label}</Label>
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
  </div>;
}
