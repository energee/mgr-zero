// components/mgr/date-picker.tsx — the labelled calendar date field behind
// E.edit(label, value, "date"). Popover + shadcn Calendar; value is ISO yyyy-mm-dd.
"use client";

import * as React from "react";
import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/mgr/icon";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Pinned, not the ambient locale: the server formats during SSR and the browser
// on hydration, so an implicit locale renders two different strings and React
// reports a hydration mismatch.
const longDate = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

/** An ISO date in local time ("T00:00"; a bare date string parses as UTC). Empty or malformed is no date. */
function parseISODate(value: string) {
  const date = new Date(`${value}T00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function DatePicker({ label, defaultValue }: { label: string; defaultValue: string }) {
  const [date, setDate] = React.useState<Date | undefined>(() => parseISODate(defaultValue));
  // A <label for> does not name a button, so the trigger points back at both the
  // label and itself: "Best by, September 5, 2026".
  const labelId = React.useId();
  const triggerId = React.useId();

  return (
    <Field orientation="horizontal">
      <FieldLabel id={labelId} className="whitespace-nowrap">{label}</FieldLabel>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            aria-labelledby={`${labelId} ${triggerId}`}
            variant="outline"
            className="w-full min-w-0 shrink justify-start text-left font-normal"
          >
            <Icon icon={Calendar03Icon} data-icon="inline-start" />
            {date ? longDate.format(date) : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={date} onSelect={setDate} defaultMonth={date} />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
