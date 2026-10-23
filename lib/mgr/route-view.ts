// lib/mgr/route-view.ts — view-model for Route (planned builder), and what
// its Save route plan still needs.
import { submitReason } from "@/lib/mgr/submit-reason";

export type RouteStopView = {
  key: string;
  title: string;
  detail: string;
  locked?: boolean;
  warning?: boolean;
};

export type RouteViewModel = {
  backHref?: string;
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

/** A route plan needs its delivery date and at least one stop. */
export function routeReason({ date, selection }: Pick<RouteViewModel, "date" | "selection">): string | null {
  const missing: string[] = [];
  if (!date) missing.push("a delivery date");
  if (Object.keys(selection).length === 0) missing.push("a stop");
  return submitReason(missing);
}
