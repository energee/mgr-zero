// lib/mgr/route-view.ts — view-model for Route (planned builder).
export type RouteStopView = {
  key: string;
  title: string;
  detail: string;
  locked?: boolean;
  warning?: boolean;
};

export type RouteViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  date?: string;
  driverId?: string;
  driverOptions?: { id: string; label: string }[];
  vehicle?: string;
  name?: string;
  stops?: RouteStopView[];
  selection: Record<string, number>;
  saved?: boolean;
  savedDriverId?: string | null;
};

export function toggleRouteStop(selection: Record<string, number>, id: string, on: boolean) {
  const next = { ...selection };
  if (on) next[id] = Math.max(0, ...Object.values(next)) + 1; else delete next[id];
  return next;
}
