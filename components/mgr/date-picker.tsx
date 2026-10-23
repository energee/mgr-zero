// components/mgr/date-picker.tsx — the labelled calendar date field behind
// E.edit(label, value, "date"). Popover + shadcn Calendar; value is ISO yyyy-mm-dd,
// shown in the app-wide date format (lib/date-format.ts formatDate).
"use client";

import { Icon } from "@/components/mgr/icon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDate } from "@/lib/date-format";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import * as React from "react";

/** An ISO date in local time ("T00:00"; a bare date string parses as UTC). Empty or malformed is no date. */
function parseISODate(value: string) {
  const date = new Date(`${value}T00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** yyyy-mm-dd. The year is padded too: a native date input reports each year digit as typed (0002). */
function formatISODate(date: Date) {
  const part = (value: number, width = 2) => String(value).padStart(width, "0");
  return `${part(date.getFullYear(), 4)}-${part(date.getMonth() + 1)}-${part(date.getDate())}`;
}

/** `aria-describedby` names the help text the caller composes beside the field. */
export function DatePicker({ label, defaultValue = "", value, onChange, disabled, required, name, "aria-describedby": describedBy }: { label: string; defaultValue?: string; value?: string; onChange?: (value: string) => void; disabled?: boolean; required?: boolean; name?: string; "aria-describedby"?: string }) {
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(() => parseISODate(defaultValue));
  const controlled = value !== undefined;
  const date = controlled ? parseISODate(value) : internalDate;
  // A calendar day, so formatDate reads it without a time zone, like every record date.
  const isoDate = date ? formatISODate(date) : "";
  // Picking a day closes the calendar; left open, it covers the form's own
  // submit button (Schedule batch) until Escape (#493).
  const [open, setOpen] = React.useState(false);
  const selectDate = (next: Date | undefined) => {
    if (!controlled) setInternalDate(next);
    onChange?.(next ? formatISODate(next) : "");
    setOpen(false);
  };
  // A <label for> does not name a button, so the trigger points back at both the
  // label and itself: "Best by, Sep 5, 2026".
  const labelId = React.useId();
  const triggerId = React.useId();

  return (
    <Field>
      <FieldLabel id={labelId} className="whitespace-nowrap">{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            disabled={disabled}
            id={triggerId}
            aria-labelledby={`${labelId} ${triggerId}`}
            aria-describedby={describedBy}
            variant="outline"
            className="w-full min-w-0 shrink justify-start text-left font-normal"
            // The trigger opens its calendar in place, so the screen explorer never routes it.
            data-preview-action
          >
            <Icon icon={Calendar03Icon} data-icon="inline-start" />
            {isoDate ? formatDate(isoDate) : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={date} onSelect={selectDate} defaultMonth={date} />
        </PopoverContent>
      </Popover>
      {(required || name) && <input type="date" aria-label={label} className="sr-only" tabIndex={-1} name={name} required={required} disabled={disabled} value={isoDate} onChange={event => selectDate(parseISODate(event.target.value))} />}
    </Field>
  );
}
