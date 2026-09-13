// components/mgr/time-window-field.tsx — a time-of-day window as one two-thumb
// range, behind E.window: quiet hours today, and anything else bounded by a
// start and an end (delivery windows, taproom hours). One control instead of a
// pair of clocks, so the window reads as a span and cannot be set to nothing.
"use client";

import * as React from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { MINUTES_PER_DAY, anchorFor, formatClock, formatWindow, fromOffset, parseClock, toOffset, toClockInput } from "@/lib/time-window";

/** Default half-hour stops; persisted quiet hours use minute precision. */
const STEP = 30;
/** Where the track's three fixed points sit, as offsets along it. */
const TICK_OFFSETS = [0, MINUTES_PER_DAY / 2, MINUTES_PER_DAY];

export function TimeWindowField({ label, start, end, onChange, disabled = false, step = STEP }: { label: string; start: string; end: string; onChange?: (start: string, end: string) => void; disabled?: boolean; step?: number }) {
  // The anchor is fixed by the window this field was given (anchorFor): a
  // monotonic track can only draw a span that does not cross its own ends, so
  // use noon or midnight when possible, otherwise start at the window's start.
  const [anchor] = React.useState(() => anchorFor(parseClock(start), parseClock(end)));
  const [range, setRange] = React.useState(() => [toOffset(parseClock(start), anchor), start === end ? MINUTES_PER_DAY : toOffset(parseClock(end), anchor)]);
  const [from, to] = range.map((offset) => fromOffset(offset, anchor));
  const ticks = TICK_OFFSETS.map((t) => formatClock(fromOffset(t, anchor)));

  return (
    <Field>
      <div className="flex items-baseline justify-between gap-4">
        <FieldLabel className="whitespace-nowrap">{label}</FieldLabel>
        <FieldDescription className="text-right">{formatWindow(from, to)}</FieldDescription>
      </div>
      <Slider
        value={range}
        onValueChange={next => { setRange(next); onChange?.(toClockInput(fromOffset(next[0], anchor)), toClockInput(fromOffset(next[1], anchor))); }}
        min={0}
        max={MINUTES_PER_DAY}
        step={step}
        disabled={disabled}
        minStepsBetweenThumbs={1}
        // Radix puts role="slider" on each thumb, so a label on the root names
        // neither of them: without these both ends read as an anonymous slider.
        thumbLabels={[`${label} start`, `${label} end`]}
        className="mt-1"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        {ticks.map((tick, i) => <span key={i}>{tick}</span>)}
      </div>
    </Field>
  );
}
