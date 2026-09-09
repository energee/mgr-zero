// lib/mgr/return-route-view.ts — view-model for Return route (all stops done).
export type ReturnRouteStopView = {
  key: string;
  title: string;
  detail: string;
};

export type ReturnRouteViewModel = {
  backHref?: string;
  backTo?: string;
  title: string;
  driverVehicle: string;
  departed: string;
  stops: ReturnRouteStopView[];
};

export function toReturnRouteViewProps(s: ReturnRouteViewModel): ReturnRouteViewModel {
  return s;
}
