// components/mgr/quiet-hours.tsx — the quiet-hours window behind E.window: one
// two-thumb Slider instead of a pair of time inputs, so the window reads as a
// span and cannot be set to nothing. The track is anchored at noon
// (lib/time-window.ts) because a night window crosses midnight and would
// otherwise run backwards along a 0-24h axis.
"use client";

import * as React from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { MINUTES_PER_DAY, formatClock, formatWindow, fromNoonOffset, parseClock, toNoonOffset } from "@/lib/time-window";

/** Half hours: nobody sets quiet hours to 21:07, and 48 stops stay draggable on a phone. */
const STEP = 30;
/** Noon, midnight, noon — the three fixed points of the track. */
const TICKS = [0, MINUTES_PER_DAY / 2, MINUTES_PER_DAY];

export function QuietHours({ label, start, end }: { label: string; start: string; end: string }) {
  const [range, setRange] = React.useState(() => [toNoonOffset(parseClock(start)), toNoonOffset(parseClock(end))]);
  const [from, to] = range.map(fromNoonOffset);

  return (
    <Field>
      <div className="flex items-baseline justify-between gap-4">
        <FieldLabel className="whitespace-nowrap">{label}</FieldLabel>
        <span className="text-right text-sm text-muted-foreground">{formatWindow(from, to)}</span>
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
        {TICKS.map((tick, i) => <span key={i}>{formatClock(fromNoonOffset(tick))}</span>)}
      </div>
    </Field>
  );
}
