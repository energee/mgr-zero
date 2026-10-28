// lib/mgr/me-view.ts — view-model for the staff Me sheet (inventory).
import type { UnitsViewModel } from "@/lib/mgr/units-view";

export type MeViewModel = {
  name?: string;
  roles: readonly string[];
  email: string;
  breweries: { id?: string; name: string; current: boolean }[];
  /** Your gravity unit chips; live passes GravityUnitForm in their place. */
  units?: UnitsViewModel;
};
