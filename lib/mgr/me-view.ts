// lib/mgr/me-view.ts — view-model for the staff Me sheet (inventory).
export type MeViewModel = {
  name?: string;
  role: string;
  email: string;
  breweries: { id?: string; name: string; current: boolean }[];
};

export function toMeViewProps(s: MeViewModel): MeViewModel {
  return s;
}
