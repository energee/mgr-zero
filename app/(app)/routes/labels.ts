// app/(app)/routes/labels.ts — the list_routes result shape as the pages read
// it, and the one driver label. A driver shows as their roster email
// (list_team_members); staff have no other display name.
import type { DeliveryRow, StopDoc } from "@/lib/commands/delivery";

export type Stop = DeliveryRow & { label: string };
export type Route = {
  id: string; name: string | null; delivery_date: string; driver_user_id: string | null; driver_email: string | null; vehicle: string | null; note: string | null;
  departed_at: string | null; returned_at: string | null; stops: Stop[];
};
export type RouteList = { routes: Route[]; unassigned: StopDoc[]; drivers: Driver[]; today: string };
export type Driver = { user_id: string; email: string; roles: string[] };

/** A route's driver: their roster email, or plainly why there is none. A
 *  driver no longer on the team has no roster email and is never named. */
export function driverLabel(route: Pick<Route, "driver_user_id" | "driver_email">): string {
  if (!route.driver_user_id) return "driver not assigned";
  return route.driver_email ?? "driver not on the team";
}
