// components/mgr/views/step-line.tsx — a temperature line in steps, as one
// small SVG: the recipe sheet's brew-day band and its cellar profile (the
// models are built in lib/mgr/recipe-day-view.ts). Every x is a percent of the
// drawing's width and every y is in pixels, so the drawing stretches to any
// width while its text keeps its size. Each step is a level line with its
// temperature over its start and its note under it; a riser joins it to the
// step before. Zones are named along the top and every other one is shaded.
// Marks sit on the baseline, and the ticks read under it. The whole drawing is
// one image whose accessible name is the model's sentence.
import type { StepLineModel } from "@/lib/mgr/recipe-day-view";

const pct = (x: number) => `${Math.round(x * 100) / 100}%`;
/** A label at the left edge reads rightwards and one at the right edge leftwards, so neither is cut off; any other is centred on its point. */
const anchor = (at: number) => (at <= 0 ? "start" : at >= 100 ? "end" : "middle");
const TEXT = "fill-muted-foreground font-medium text-xs";

/** `rise` is the height in pixels between the lowest step and the highest. */
export function StepLine({ model: { summary, steps, zones, marks, ticks }, rise }: { model: StepLineModel; rise: number }) {
  // Top to bottom: the zone names, room for a temperature over the highest step, the steps, room for a note under the
  // lowest one, the baseline, the ticks.
  const top = (zones.length ? 26 : 0) + 22, bottom = top + rise;
  const floor = bottom + (steps.some((s) => s.note) ? 26 : 10);
  const y = (level: number) => bottom - level * rise;
  return (
    <svg role="img" aria-label={summary} width="100%" height={floor + (ticks.length ? 24 : 6)} className="block overflow-visible">
      {zones.map((zone, i) => {
        // A narrow last zone is named from its right end, so its name stays inside the drawing.
        const fromEnd = i > 0 && i === zones.length - 1 && zone.to - zone.from < 25;
        return (
          <g key={zone.name}>
            {i % 2 === 0 ? <rect x={pct(zone.from)} width={pct(zone.to - zone.from)} y={0} height={floor} rx={3} className="fill-muted dark:fill-muted/45" /> : null}
            <text x={pct(fromEnd ? zone.to : zone.from)} dx={fromEnd ? -8 : 8} y={18} textAnchor={fromEnd ? "end" : "start"} className="fill-foreground font-semibold text-[0.8125rem]">{zone.name}</text>
          </g>
        );
      })}
      {steps.map((step, i) => {
        const last = i > 0 && i === steps.length - 1;
        // A narrow last step's note is read from the right edge; any other is centred under its step.
        const noteAt = last && step.to - step.from < 20 ? 100 : (step.from + step.to) / 2;
        return (
          <g key={step.from}>
            {i > 0 ? <line x1={pct(step.from)} x2={pct(step.from)} y1={y(steps[i - 1].level)} y2={y(step.level)} className="stroke-2 stroke-foreground" strokeLinecap="round" /> : null}
            <line x1={pct(step.from)} x2={pct(step.to)} y1={y(step.level)} y2={y(step.level)} className="stroke-2 stroke-foreground" strokeLinecap="round" />
            {step.temp ? <text x={pct(step.from)} dx={i ? 6 : 2} y={y(step.level) - 7} className="fill-foreground font-semibold text-xs">{step.temp}</text> : null}
            {step.note ? <text x={pct(noteAt)} dx={noteAt === 100 ? -2 : 0} y={y(step.level) + 16} textAnchor={anchor(noteAt)} className={TEXT}>{step.note}</text> : null}
          </g>
        );
      })}
      <line x1="0" x2="100%" y1={floor} y2={floor} className="stroke-1 stroke-input" />
      {marks.map((at) => <circle key={at} cx={pct(at)} cy={floor} r={5} className="fill-primary" />)}
      {ticks.map((tick) => <text key={tick.at} x={pct(tick.at)} y={floor + 20} textAnchor={anchor(tick.at)} className={TEXT}>{tick.text}</text>)}
    </svg>
  );
}
