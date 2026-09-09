// lib/mgr/me-view.ts — view-model for the staff Me sheet (inventory).
export type MeViewModel = {
  name: string;
  role: string;
  email: string;
  currentBrewery: string;
  otherBrewery: string;
};

export function toMeViewProps(s: MeViewModel): MeViewModel {
  return s;
}
