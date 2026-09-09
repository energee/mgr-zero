// lib/mgr/route-view.ts — view-model for Route (planned builder).
export type RouteStopView = {
  key: string;
  title: string;
  detail: string;
  trailing?: string;
  warning?: boolean;
};

export type RouteViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  date?: string;
  driver?: string;
  driverOptions?: string[];
  vehicle?: string;
  name?: string;
  stops?: RouteStopView[];
};

export function toRouteViewProps(s: RouteViewModel): RouteViewModel {
  return s;
}
