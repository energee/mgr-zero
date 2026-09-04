// components/mgr/time-window-field.tsx — a time-of-day window as one two-thumb
// range, behind E.window: quiet hours today, and anything else bounded by a
// start and an end (delivery windows, taproom hours). One control instead of a
// pair of clocks, so the window reads as a span and cannot be set to nothing.
"use client";

import * as React from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { MINUTES_PER_DAY, formatClock, formatWindow, fromNoonOffset, parseClock, toNoonOffset } from "@/lib/time-window";

/** Half hours: no one sets a window to 21:07, and 48 stops stay draggable on a phone. */
const STEP = 30;
/** The track is anchored at noon (lib/time-window.ts), so its fixed points read noon, midnight, noon. */
const TICKS = [0, MINUTES_PER_DAY / 2, MINUTES_PER_DAY].map((t) => formatClock(fromNoonOffset(t)));

export function TimeWindowField({ label, start, end }: { label: string; start: string; end: string }) {
  const [range, setRange] = React.useState(() => [toNoonOffset(parseClock(start)), toNoonOffset(parseClock(end))]);
  const [from, to] = range.map(fromNoonOffset);

  return (
    <Field>
      <div className="flex items-baseline justify-between gap-4">
        <FieldLabel className="whitespace-nowrap">{label}</FieldLabel>
        <FieldDescription className="text-right">{formatWindow(from, to)}</FieldDescription>
      </div>
      <Slider
        value={range}
        onValueChange={setRange}
        min={0}
        max={MINUTES_PER_DAY}
        step={STEP}
        minStepsBetweenThumbs={1}
        aria-label={label}
        className="mt-1"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        {TICKS.map((tick, i) => <span key={i}>{tick}</span>)}
      </div>
    </Field>
  );
}
