// lib/mgr/me-view.ts — view-model for the staff Me sheet (inventory).
export type MeViewModel = {
  name?: string;
  roles: readonly string[];
  email: string;
  breweries: { id?: string; name: string; current: boolean }[];
};
