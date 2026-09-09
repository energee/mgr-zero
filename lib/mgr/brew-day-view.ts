// lib/mgr/brew-day-view.ts — view-model for Brew day.
export type BrewDayLotView = { key: string; title: string; detail: string };

export type BrewDayViewModel = {
  backHref?: string;
  title: string;
  planned?: string;
  note?: string;
  lots?: BrewDayLotView[];
  knockoutFrom?: string;
  knockoutTo?: string;
  sheet?: { title: string; detail: string };
  tapeHead?: [string, string][];
};

export function toBrewDayViewProps(s: BrewDayViewModel): BrewDayViewModel {
  return s;
}
