// lib/mgr/driver-route-view.ts — view-model for Driver route (departed run).
export type DriverStopView = {
  key: string;
  title: string;
  detail: string;
  verb?: string;
  href?: string;
  warning?: boolean;
  ok?: boolean;
  trailing?: string;
};

export type DriverRouteViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  driverVehicle: string;
  departed: string;
  stops: DriverStopView[];
};

export function toDriverRouteViewProps(s: DriverRouteViewModel): DriverRouteViewModel {
  return s;
}
