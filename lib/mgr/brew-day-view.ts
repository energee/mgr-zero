// lib/mgr/brew-day-view.ts — view-model for Brew day.
export type BrewDayLotView = { key: string; title: string; detail: string };
export type BrewDayVessel = { id: string; name: string; kind: string; capacity_bbl: number };

export type BrewDayViewModel = {
  backHref?: string;
  title: string;
  planned?: string;
  note?: string;
  lots?: BrewDayLotView[];
  vesselId: string;
  vesselName?: string;
  initialBbl: string;
  brewedOn: string;
  vessels: BrewDayVessel[];
  recorded?: boolean;
  sheet?: { title: string; detail: string };
  tapeHead?: [string, string][];
};

export function canRecordBrewDay(model: BrewDayViewModel) {
  return !model.recorded && model.vessels.some(vessel => vessel.id === model.vesselId) && Number.isFinite(Number(model.initialBbl)) && Number(model.initialBbl) > 0 && Boolean(model.brewedOn);
}
